import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CachingService } from '../../caching/caching.service';
import { DocumentEventPublisher } from '../../messaging/publishers/document-event.publisher';
import * as crypto from 'crypto';

// TTL par défaut selon le type (en secondes)
const TTL_DEFAULT = 30 * 60; // 30 min (documents publics type CDC)

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: CachingService,
    private readonly eventPublisher: DocumentEventPublisher,
  ) {}

  /**
   * DOC-08 : Génère une URL MinIO présignée pour téléchargement direct.
   * Implémente un cache Redis TTL pour éviter de régénérer une URL déjà valide.
   */
  async getPresignedUrl(
    documentId: string,
  ): Promise<{ presignedUrl: string; expiresAt: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} introuvable.`);
    }

    const cacheKey = `presignedUrl:${documentId}`;

    // Cache HIT — retourner l'URL directement
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.log(`Cache HIT pour presignedUrl:${documentId}`);
      const expiresAt = new Date(Date.now() + TTL_DEFAULT * 1000).toISOString();
      return { presignedUrl: cached, expiresAt };
    }

    // Cache MISS — générer l'URL et la mettre en cache
    this.logger.log(`Cache MISS — génération URL présignée pour ${documentId}`);
    const ttl = TTL_DEFAULT;
    const presignedUrl = await this.storage.getPresignedUrl(
      doc.fichierUrl,
      ttl,
    );

    await this.cache.set(cacheKey, presignedUrl, ttl);

    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    return { presignedUrl, expiresAt };
  }

  /**
   * DOC-09 : Vérifie l'intégrité d'un document en recalculant son hash SHA-256.
   * Compare avec le hash stocké lors de l'upload — détecte toute altération post-upload.
   */
  async checkIntegrity(
    documentId: string,
  ): Promise<{ documentId: string; integrityOk: boolean; checkedAt: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} introuvable.`);
    }

    const stream = await this.storage.getObjectStream(doc.fichierUrl);
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

  /**
   * Calcule le SHA-256 d'un flux Node.js Readable en mode streaming.
   */
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
}
