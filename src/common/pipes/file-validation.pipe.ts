// =========================================================
// src/common/pipes/file-validation.pipe.ts
//
// Pipe de validation de fichier en 3 couches de sécurité :
//
// COUCHE 1 — Extension déclarée (rapide, premier filtre)
// COUCHE 2 — Magic Bytes réels via la librairie `file-type`
//             → Lit les 4100 premiers octets du buffer
//             → Détecte le vrai type même si l'extension est falsifiée
//             → Ex: fichier .exe renommé .pdf → REJETÉ 422
// COUCHE 3 — Taille maximale
//
// POURQUOI file-type et pas juste le Content-Type header ?
// Le header Content-Type est envoyé par le CLIENT et peut donc
// être falsifié. Les magic bytes sont dans le fichier lui-même
// et sont beaucoup plus difficiles à usurper.
// =========================================================

import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '../config/minio.config';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly logger = new Logger(FileValidationPipe.name);

  // ArgumentMetadata est requis par l'interface PipeTransform
  // mais on ne l'utilise pas ici (la logique est générique)
  async transform(
    file: Express.Multer.File,
    _metadata: ArgumentMetadata,
  ): Promise<Express.Multer.File> {
    // ── Vérifier que Multer a bien transmis un fichier ──────
    if (!file) {
      throw new UnprocessableEntityException('Aucun fichier reçu.');
    }

    // ── COUCHE 1 : Extension déclarée ────────────────────────
    const originalName = file.originalname.toLowerCase();
    const extension = originalName.split('.').pop() ?? '';

    if (!ALLOWED_EXTENSIONS.includes(extension as any)) {
      this.logger.warn(
        `Fichier rejeté — Extension non autorisée: .${extension} (fichier: ${file.originalname})`,
      );
      throw new UnprocessableEntityException(
        `Extension de fichier non autorisée: .${extension}. ` +
          `Extensions acceptées: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    // ── COUCHE 2 : Magic Bytes (protection anti-spoofing) ────
    // file-type lit les premiers octets du buffer pour détecter
    // le VRAI format du fichier, indépendamment de son extension.
    const detectedType = await fileTypeFromBuffer(file.buffer);

    if (!detectedType) {
      this.logger.warn(
        `Fichier rejeté — Type impossible à détecter: ${file.originalname}`,
      );
      throw new UnprocessableEntityException(
        'Impossible de détecter le type réel du fichier. ' +
          'Le fichier est peut-être corrompu ou dans un format non supporté.',
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(detectedType.mime as any)) {
      this.logger.warn(
        `ALERTE SÉCURITÉ — Possible spoofing d'extension détecté! ` +
          `Fichier: ${file.originalname}, ` +
          `Extension déclarée: .${extension}, ` +
          `Type réel détecté: ${detectedType.mime}`,
      );
      throw new UnprocessableEntityException(
        `Type de fichier réel non autorisé: ${detectedType.mime}. ` +
          `L'extension du fichier ne correspond pas à son contenu réel.`,
      );
    }

    // ── COUCHE 3 : Taille maximale ───────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
      throw new UnprocessableEntityException(
        `Fichier trop volumineux: ${fileSizeMB} MB. ` +
          `Taille maximale autorisée: ${maxSizeMB} MB.`,
      );
    }

    // Mettre à jour le typeMime avec la valeur RÉELLE détectée
    // (pas celle déclarée par le client qui peut être falsifiée)
    file.mimetype = detectedType.mime;

    this.logger.debug(
      `Fichier validé: ${file.originalname} | Type: ${detectedType.mime} | Taille: ${(file.size / 1024).toFixed(1)} KB`,
    );

    return file;
  }
}
