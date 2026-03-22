// =========================================================
// src/documents/documents.service.ts  — VERSION CORRIGÉE
//
// Correction clé : @Inject('REDIS_CLIENT') sur le paramètre
// ioredis du constructeur — OBLIGATOIRE pour les custom providers
// avec token string dans NestJS.
// =========================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import {
  UploadResponseDto,
  PresignedUrlResponseDto,
  DocumentMetaResponseDto,
} from './dto/document-response.dto';
import { PRESIGNED_URL_TTL } from '../common/config/minio.config';

const REDIS_KEY_PREFIX = 'presignedUrl';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    // @Inject('REDIS_CLIENT') EST OBLIGATOIRE pour un custom provider token string
    // Sans ce décorateur, NestJS chercherait un provider de type Redis (classe)
    // et ne trouverait pas 'REDIS_CLIENT' — erreur d'injection au démarrage
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // [DOC-01] Upload document sécurisé
  // ─────────────────────────────────────────────────────────────
  async uploadDocument(
    file: Express.Multer.File,
    uploadDto: UploadDocumentDto,
  ): Promise<UploadResponseDto> {

    // ÉTAPE 1 — Hash SHA-256 du fichier
    // Synchrone, natif Node.js, très rapide pour < 100 MB
    const hashSha256 = this.computeSha256(file.buffer);
    this.logger.debug(`Hash calculé: ${hashSha256} | "${file.originalname}"`);

    // ÉTAPE 2 — Vérification anti-doublon
    // hashSha256 est @unique dans le schéma Prisma.
    // Même fichier uploadé deux fois → détecté ici, AVANT l'appel MinIO.
    const existingDoc = await this.prisma.document.findUnique({
      where: { hashSha256 },
      select: { id: true, nom: true },
    });

    if (existingDoc) {
      this.logger.warn(`Doublon: "${file.originalname}" = document "${existingDoc.nom}" (${existingDoc.id})`);
      throw new ConflictException(
        `Ce fichier existe déjà dans le système (id: ${existingDoc.id}).`,
      );
    }

    // ÉTAPE 3 — Construction du chemin objet MinIO
    // Format: {OWNER_TYPE}/{ownerId}/{uuid}-{nom-sanitisé}
    // Exemple: USER/550e8400.../3f2504e0-mon-bilan-2024.pdf
    const fileUuid = uuidv4();
    const safeFileName = this.sanitizeFileName(file.originalname);
    const objectName = `${uploadDto.ownerType}/${uploadDto.ownerId}/${fileUuid}-${safeFileName}`;

    // ÉTAPE 4 — Upload vers MinIO
    // On upload AVANT d'écrire en DB.
    // Si MinIO échoue → rien en DB à rollback (ordre important).
    let uploadedObjectName: string;
    try {
      uploadedObjectName = await this.storageService.uploadBuffer(
        objectName,
        file.buffer,
        file.mimetype,
        file.size,
      );
    } catch (error) {
      this.logger.error(`Échec upload MinIO: ${(error as Error).message}`);
      throw new InternalServerErrorException(
        'Erreur lors du stockage du fichier. Veuillez réessayer.',
      );
    }

    // ÉTAPE 5 — Enregistrement PostgreSQL via Prisma
    // Si Prisma échoue → on ROLLBACK MinIO pour éviter les fichiers orphelins
    let document: any;
    try {
      document = await this.prisma.document.create({
        data: {
          ownerId: uploadDto.ownerId,
          ownerType: uploadDto.ownerType,
          nom: file.originalname,
          typeMime: file.mimetype,
          tailleOctets: BigInt(file.size),   // BigInt requis par le schéma Prisma (BIGINT SQL)
          fichierUrl: uploadedObjectName,     // Chemin MinIO, PAS une URL HTTP
          hashSha256,
        },
      });

      this.logger.log(
        `✅ Document créé: id=${document.id} | "${file.originalname}" | ` +
          `${(file.size / 1024).toFixed(1)} KB | ${uploadDto.ownerType}:${uploadDto.ownerId}`,
      );
    } catch (error) {
      // ⚠️ ROLLBACK MinIO
      this.logger.error(
        `Prisma échoué → rollback MinIO: suppression de "${uploadedObjectName}"`,
      );
      await this.storageService.deleteObject(uploadedObjectName);

      throw new InternalServerErrorException(
        "Erreur lors de l'enregistrement des métadonnées. Le fichier n'a pas été conservé.",
      );
    }

    // ÉTAPE 6 — Retourner le DTO (jamais l'objet Prisma brut)
    // BigInt → number : JSON.stringify ne sérialise pas BigInt nativement
    return {
      id: document.id,
      nom: document.nom,
      typeMime: document.typeMime,
      tailleOctets: Number(document.tailleOctets),
      hashSha256: document.hashSha256,
      fichierUrl: document.fichierUrl,
      createdAt: document.createdAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // [DOC-02 / DOC-08] URL présignée avec cache Redis
  // ─────────────────────────────────────────────────────────────
  async getPresignedUrl(documentId: string): Promise<PresignedUrlResponseDto> {

    // ÉTAPE 1 — Vérifier que le document existe en DB
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, fichierUrl: true, nom: true },
    });

    if (!document) {
      throw new NotFoundException(
        `Document introuvable (id: ${documentId}). Vérifiez l'identifiant.`,
      );
    }

    // ÉTAPE 2 — Consulter le cache Redis
    // Clé: "presignedUrl:550e8400-e29b-41d4-a716-446655440000"
    const redisKey = `${REDIS_KEY_PREFIX}:${documentId}`;
    let cachedUrl: string | null = null;

    try {
      cachedUrl = await this.redisClient.get(redisKey);
    } catch (err) {
      // Redis down → graceful degradation : on continue sans cache
      // Le service reste opérationnel, sans perf optimale temporairement
      this.logger.warn(
        `Redis GET échoué (${redisKey}): ${(err as Error).message} — génération directe`,
      );
    }

    // CACHE HIT — Retourner l'URL depuis Redis
    if (cachedUrl) {
      this.logger.debug(`[HIT] Redis: URL présignée pour ${documentId}`);

      // Lire le TTL restant dans Redis pour expiresAt précis
      let remainingTtl = PRESIGNED_URL_TTL;
      try {
        const ttl = await this.redisClient.ttl(redisKey);
        if (ttl > 0) remainingTtl = ttl;
      } catch { /* pas bloquant */ }

      return {
        url: cachedUrl,
        expiresAt: Math.floor(Date.now() / 1000) + remainingTtl,
        ttlSeconds: remainingTtl,
        fromCache: true,
      };
    }

    // CACHE MISS — Générer l'URL depuis MinIO
    this.logger.debug(`[MISS] Redis: génération URL présignée pour ${documentId}`);

    const presignedUrl = await this.storageService.generatePresignedUrl(
      document.fichierUrl,
      PRESIGNED_URL_TTL,
    );

    // ÉTAPE 3 — Mettre en cache Redis
    // SETEX: SET + EX (expiration) atomique
    // TTL cache = TTL URL présignée → expirent ensemble
    try {
      await this.redisClient.setex(redisKey, PRESIGNED_URL_TTL, presignedUrl);
      this.logger.debug(`[SET] Redis: ${redisKey} (TTL: ${PRESIGNED_URL_TTL}s)`);
    } catch (err) {
      // Pas bloquant — l'URL est retournée sans mise en cache
      this.logger.warn(
        `Redis SET échoué (${redisKey}): ${(err as Error).message} — URL retournée sans cache`,
      );
    }

    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGNED_URL_TTL;

    return {
      url: presignedUrl,
      expiresAt,
      ttlSeconds: PRESIGNED_URL_TTL,
      fromCache: false,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // [DOC-02] Métadonnées d'un document
  // ─────────────────────────────────────────────────────────────
  async getDocumentById(documentId: string): Promise<DocumentMetaResponseDto> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document introuvable (id: ${documentId})`);
    }

    return {
      id: document.id,
      ownerId: document.ownerId,
      ownerType: document.ownerType,
      nom: document.nom,
      typeMime: document.typeMime,
      tailleOctets: document.tailleOctets ? Number(document.tailleOctets) : null,
      hashSha256: document.hashSha256,
      createdAt: document.createdAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Méthodes privées
  // ─────────────────────────────────────────────────────────────

  /**
   * Hash SHA-256 d'un Buffer → chaîne hex 64 caractères.
   * Synchrone, natif Node.js, aucune dépendance externe.
   */
  private computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Nettoie le nom de fichier pour sécuriser le chemin objet MinIO.
   * Protège contre path traversal ("../../etc/passwd") et caractères spéciaux.
   *
   * Exemples :
   *   "Mon Bilan 2024 (FINAL).PDF" → "mon-bilan-2024-final.pdf"
   *   "../../etc/passwd.pdf"       → "etcpasswd.pdf"
   */
  private sanitizeFileName(originalName: string): string {
    return originalName
      .toLowerCase()
      .replace(/\s+/g, '-')           // Espaces → tirets
      .replace(/[^a-z0-9.\-_]/g, '')  // Supprimer tout sauf alphanumeric, point, tiret, underscore
      .replace(/\.{2,}/g, '.')        // ".." → "." (path traversal)
      .replace(/^\.+/, '')            // Pas de point en début de nom
      .substring(0, 150);             // Longueur max
  }
}
