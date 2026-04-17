// =========================================================
// src/modules/documents/documents.service.ts
// =========================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  InternalServerErrorException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { Document } from '@prisma/client';
import { UploadDocumentDto } from './dto/upload-document.dto';
import {
  UploadResponseDto,
  PresignedUrlResponseDto,
  DocumentMetaResponseDto,
} from './dto/document-response.dto';
import { PRESIGNED_URL_TTL } from '../../common/config/minio.config';
import { DocumentEventPublisher } from '../../messaging/publishers/document-event.publisher';
import { CachingService } from '../../caching/caching.service';

const REDIS_KEY_PREFIX = 'presignedUrl';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    private readonly eventPublisher: DocumentEventPublisher,
    private readonly cache: CachingService, // Pour certaines méthodes Phase 6 si besoin
  ) {}

  // ─────────────────────────────────────────────────────────────
  // [DOC-01] Upload document sécurisé
  // ─────────────────────────────────────────────────────────────
  async uploadDocument(
    file: Express.Multer.File,
    uploadDto: UploadDocumentDto,
  ): Promise<UploadResponseDto> {
    const correlationId = uuidv4();
    const hashSha256 = this.computeSha256(file.buffer);
    this.logger.debug(`Hash calculé: ${hashSha256} | "${file.originalname}"`);

    const existingDoc = await this.prisma.document.findUnique({
      where: { hashSha256 },
      select: { id: true, nom: true, fichierUrl: true },
    });

    if (existingDoc) {
      this.logger.warn(
        `Doublon: "${file.originalname}" = document "${existingDoc.nom}" (${existingDoc.id})`,
      );
      // Pour compatibilité users-service: publier un événement idempotent
      try {
        if (uploadDto.ownerType === 'ORGANISATION') {
          await this.eventPublisher.publishOrganisationDocumentsUploaded({
            event_id: uuidv4(),
            correlation_id: correlationId,
            organisation_id: uploadDto.ownerId,
            user_id: uploadDto.uploadedBy || null,
            status: 'success',
            uploaded_documents: [
              {
                type: uploadDto.documentType || 'DENOMINATION',
                document_id: existingDoc.id,
                storage_key: existingDoc.fichierUrl,
                file_name: existingDoc.nom,
                status: 'uploaded',
              },
            ],
            failed_documents: [],
            processed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        this.logger.warn('Impossible de publier l\'événement de doublon: ' + (e as Error).message);
      }

      throw new ConflictException(
        `Ce fichier existe déjà dans le système (id: ${existingDoc.id}).`,
      );
    }

    // Validation pour les uploads d'organisation : documentType obligatoire
    if (uploadDto.ownerType === 'ORGANISATION' && !uploadDto.documentType) {
      throw new BadRequestException('documentType est requis pour les uploads ORGANISATION');
    }

    const fileUuid = uuidv4();
    const safeFileName = this.sanitizeFileName(file.originalname);
    const objectName = `${uploadDto.ownerType}/${uploadDto.ownerId}/${fileUuid}-${safeFileName}`;

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
      // Publier événement d'échec pour users-service si c'est un document d'organisation
      try {
        if (uploadDto.ownerType === 'ORGANISATION') {
          await this.eventPublisher.publishOrganisationDocumentsFailed({
            event_id: uuidv4(),
            correlation_id: correlationId,
            organisation_id: uploadDto.ownerId,
            user_id: uploadDto.uploadedBy || null,
            status: 'failed',
            uploaded_documents: [],
            failed_documents: [
              {
                type: uploadDto.documentType || 'DENOMINATION',
                file_name: file.originalname,
                reason: (error as Error).message,
              },
            ],
            error: (error as Error).message,
            processed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        this.logger.warn('Impossible de publier l\'événement d\'échec upload: ' + (e as Error).message);
      }

      throw new InternalServerErrorException(
        'Erreur lors du stockage du fichier. Veuillez réessayer.',
      );
    }

    let document: Document;
    try {
      document = await this.prisma.document.create({
        data: {
          ownerId: uploadDto.ownerId,
          ownerType: uploadDto.ownerType,
          nom: file.originalname,
          typeMime: file.mimetype,
          tailleOctets: BigInt(file.size),
          fichierUrl: uploadedObjectName,
          hashSha256,
        },
      });

      this.logger.log(
        `✅ Document créé: id=${document.id} | "${file.originalname}"`,
      );

      // Publier l'événement organisation si applicable
      try {
        if (uploadDto.ownerType === 'ORGANISATION') {
          await this.eventPublisher.publishOrganisationDocumentsUploaded({
            event_id: uuidv4(),
            correlation_id: correlationId,
            organisation_id: uploadDto.ownerId,
            user_id: uploadDto.uploadedBy || null,
            status: 'success',
            uploaded_documents: [
              {
                type: uploadDto.documentType || 'DENOMINATION',
                document_id: document.id,
                storage_key: document.fichierUrl,
                file_name: document.nom,
                status: 'uploaded',
              },
            ],
            failed_documents: [],
            processed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        this.logger.warn('Impossible de publier l\'événement uploaded: ' + (e as Error).message);
      }
    } catch {
      this.logger.error(
        `Prisma échoué → rollback MinIO: suppression de "${uploadedObjectName}"`,
      );
      await this.storageService.deleteObject(uploadedObjectName);
      // Publier un événement d'échec global si organisation
      try {
        if (uploadDto.ownerType === 'ORGANISATION') {
          await this.eventPublisher.publishOrganisationDocumentsFailed({
            event_id: uuidv4(),
            correlation_id: correlationId,
            organisation_id: uploadDto.ownerId,
            user_id: uploadDto.uploadedBy || null,
            status: 'failed',
            uploaded_documents: [],
            failed_documents: [
              {
                type: uploadDto.documentType || 'DENOMINATION',
                file_name: file.originalname,
                reason: 'Failed to persist metadata',
              },
            ],
            error: 'Failed to persist metadata',
            processed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        this.logger.warn('Impossible de publier l\'événement failed prisma: ' + (e as Error).message);
      }

      throw new InternalServerErrorException(
        "Erreur lors de l'enregistrement des métadonnées. Le fichier n'a pas été conservé.",
      );
    }

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
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, fichierUrl: true, nom: true },
    });

    if (!document) {
      throw new NotFoundException(`Document introuvable (id: ${documentId}).`);
    }

    const redisKey = `${REDIS_KEY_PREFIX}:${documentId}`;
    let cachedUrl: string | null = null;

    try {
      cachedUrl = await this.redisClient.get(redisKey);
    } catch (_err) {
      this.logger.warn(
        `Redis GET échoué (${redisKey}): ${(_err as Error).message}`,
      );
    }

    if (cachedUrl) {
      this.logger.debug(`[HIT] Redis: URL présignée pour ${documentId}`);
      let remainingTtl = PRESIGNED_URL_TTL;
      try {
        const ttl = await this.redisClient.ttl(redisKey);
        if (ttl > 0) remainingTtl = ttl;
      } catch {
        /* ignored */
      }

      return {
        url: cachedUrl,
        expiresAt: Math.floor(Date.now() / 1000) + remainingTtl,
        ttlSeconds: remainingTtl,
        fromCache: true,
      };
    }

    this.logger.debug(
      `[MISS] Redis: génération URL présignée pour ${documentId}`,
    );
    const presignedUrl = await this.storageService.generatePresignedUrl(
      document.fichierUrl,
      PRESIGNED_URL_TTL,
    );

    try {
      await this.redisClient.setex(redisKey, PRESIGNED_URL_TTL, presignedUrl);
    } catch {
      this.logger.warn(`Redis SET échoué (${redisKey})`);
    }

    return {
      url: presignedUrl,
      expiresAt: Math.floor(Date.now() / 1000) + PRESIGNED_URL_TTL,
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
      tailleOctets: document.tailleOctets
        ? Number(document.tailleOctets)
        : null,
      hashSha256: document.hashSha256,
      createdAt: document.createdAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // [DOC-09] Vérifier intégrité SHA-256
  // ─────────────────────────────────────────────────────────────
  async checkIntegrity(
    documentId: string,
  ): Promise<{ documentId: string; integrityOk: boolean; checkedAt: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} introuvable.`);
    }

    const stream = await this.storageService.getObjectStream(doc.fichierUrl);
    const actualHash = await this.computeSha256FromStream(stream);

    const integrityOk = actualHash === doc.hashSha256;
    const checkedAt = new Date().toISOString();

    if (!integrityOk) {
      this.logger.warn(
        `⚠️  Altération détectée sur le document ${documentId} !`,
      );
      await this.eventPublisher.publishDocumentValidated({
        documentId: doc.id,
        submissionId: doc.ownerId,
        isValid: false,
        validatedBy: 'SYSTEM',
        rejectionReason: `Hash altéré — Attendu: ${doc.hashSha256} | Calculé: ${actualHash}`,
      });
    }

    return { documentId, integrityOk, checkedAt };
  }

  // ─────────────────────────────────────────────────────────────
  // Méthodes privées
  // ─────────────────────────────────────────────────────────────
  private computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private computeSha256FromStream(
    stream: NodeJS.ReadableStream,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err: Error) => reject(err));
    });
  }

  private sanitizeFileName(originalName: string): string {
    return originalName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.\-_]/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+/, '')
      .substring(0, 150);
  }
}
