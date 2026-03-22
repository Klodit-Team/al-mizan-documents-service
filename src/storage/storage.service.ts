// =========================================================
// src/storage/storage.service.ts
//
// Wrapper autour du SDK MinIO (@minio/minio-js).
// Responsabilités :
//  1. Initialiser le client MinIO avec les credentials .env
//  2. Créer le bucket au démarrage s'il n'existe pas (idempotent)
//  3. Uploader un fichier depuis un Buffer vers MinIO
//  4. Générer une URL présignée GET (téléchargement temporaire)
//  5. Lire un objet MinIO sous forme de stream (pour vérif hash)
//  6. Supprimer un objet
//
// PRINCIPE : Ce service ne connaît rien du métier (Documents,
// Pièces...). Il est purement technique. La logique métier
// reste dans DocumentsService.
// =========================================================

import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import * as Minio from 'minio';
import * as stream from 'stream';
import { getMinioConfig } from '../common/config/minio.config';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;

  constructor() {
    // Lire la config depuis les variables d'environnement
    const config = getMinioConfig();
    this.bucketName = config.bucketName;

    // Instancier le client MinIO une seule fois (singleton dans NestJS)
    this.minioClient = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    this.logger.log(
      `Client MinIO configuré → ${config.endpoint}:${config.port} | Bucket: ${this.bucketName}`,
    );
  }

  // ─── Cycle de vie NestJS ───────────────────────────────────
  // Vérifie/crée le bucket au démarrage du service.
  // Utilisation de minioClient.bucketExists pour idempotence :
  // si le bucket existe déjà, on ne fait rien. Sinon on le crée.
  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);

      if (!exists) {
        // 'us-east-1' est la région par défaut pour MinIO
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`✅ Bucket "${this.bucketName}" créé avec succès`);
      } else {
        this.logger.log(`✅ Bucket "${this.bucketName}" déjà existant — OK`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Impossible d'initialiser le bucket MinIO: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  // ─── Upload ───────────────────────────────────────────────
  /**
   * Upload un fichier depuis un Buffer vers MinIO.
   *
   * @param objectName - Chemin complet dans le bucket
   *                     Ex: "USER/uuid-owner/uuid-file-monpdf.pdf"
   * @param buffer     - Contenu du fichier en Buffer (depuis Multer)
   * @param mimeType   - Content-Type réel du fichier
   * @param size       - Taille en bytes (pour les métadonnées MinIO)
   *
   * @returns Le chemin objet (objectName) — stocké dans document.fichierUrl
   *
   * NOTE: On utilise putObject qui accepte un Buffer converti en stream.
   * Pour les très gros fichiers en prod, préférer un streaming direct
   * depuis le body de la requête HTTP sans passer par un buffer complet.
   */
  async uploadBuffer(
    objectName: string,
    buffer: Buffer,
    mimeType: string,
    size: number,
  ): Promise<string> {
    try {
      // Convertir le Buffer en Readable stream pour MinIO
      const readableStream = stream.Readable.from(buffer);

      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        readableStream,
        size,
        {
          // Métadonnées stockées dans MinIO — utiles pour les outils d'admin
          'Content-Type': mimeType,
          'x-uploaded-by': 'al-mizan-document-service',
        },
      );

      this.logger.debug(
        `Fichier uploadé dans MinIO: ${objectName} (${(size / 1024).toFixed(1)} KB)`,
      );

      return objectName;
    } catch (error) {
      this.logger.error(
        `Échec upload MinIO pour "${objectName}": ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Erreur lors du stockage du fichier: ${(error as Error).message}`,
      );
    }
  }

  // ─── URL Présignée ────────────────────────────────────────
  /**
   * Génère une URL présignée temporaire pour permettre le
   * téléchargement DIRECT depuis MinIO (sans passer par notre API).
   *
   * AVANTAGE : Le fichier transite directement de MinIO vers le client,
   * sans consommer la bande passante de notre Gateway/Service.
   *
   * @param objectName     - Chemin objet dans MinIO (document.fichierUrl)
   * @param expirySeconds  - Durée de validité en secondes (ex: 300 = 5 min)
   *
   * @returns URL présignée (ex: http://minio:9000/al-mizan-docs/USER/...?X-Amz-Signature=...)
   */
  async generatePresignedUrl(
    objectName: string,
    expirySeconds: number,
  ): Promise<string> {
    try {
      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        objectName,
        expirySeconds,
      );

      this.logger.debug(
        `URL présignée générée pour "${objectName}" (TTL: ${expirySeconds}s)`,
      );

      return url;
    } catch (error) {
      this.logger.error(
        `Échec génération URL présignée pour "${objectName}": ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Impossible de générer l'URL de téléchargement: ${(error as Error).message}`,
      );
    }
  }

  // ─── Lecture en stream (pour vérification d'intégrité) ───
  /**
   * Retourne un stream de lecture vers un objet MinIO.
   * Utilisé par DocumentsService pour recalculer le hash SHA-256
   * sans télécharger tout le fichier en mémoire.
   *
   * @param objectName - Chemin objet dans MinIO
   * @returns stream.Readable qui émet les données du fichier
   */
  async getObjectStream(objectName: string): Promise<stream.Readable> {
    try {
      return await this.minioClient.getObject(this.bucketName, objectName);
    } catch (error) {
      throw new InternalServerErrorException(
        `Impossible de lire le fichier depuis le stockage: ${(error as Error).message}`,
      );
    }
  }

  // ─── Suppression ─────────────────────────────────────────
  /**
   * Supprime un objet de MinIO.
   * Appelé lors d'un soft-delete ou d'un rollback (ex: si l'insertion
   * en BDD échoue après un upload MinIO réussi, on nettoie MinIO).
   */
  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, objectName);
      this.logger.log(`Objet supprimé de MinIO: ${objectName}`);
    } catch (error) {
      // On log l'erreur mais on ne throw pas — la suppression est best-effort
      this.logger.error(
        `Échec suppression MinIO pour "${objectName}": ${(error as Error).message}`,
      );
    }
  }

  // ─── Healthcheck ─────────────────────────────────────────
  /**
   * Vérifie que MinIO est joignable. Utilisé par GET /health/ready.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.minioClient.bucketExists(this.bucketName);
      return true;
    } catch {
      return false;
    }
  }
}
