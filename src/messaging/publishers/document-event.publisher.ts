import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PieceType } from '@prisma/client';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class DocumentEventPublisher {
  private readonly logger = new Logger(DocumentEventPublisher.name);

  constructor(
    @Inject('RABBITMQ_SERVICE') private readonly client: ClientProxy,
  ) {}

  async publishDocumentUploaded(payload: {
    documentId: string;
    hash: string;
    mimeType: string;
    size: bigint | number | null;
    uploadedBy: string;
    entityType: string;
    entityId: string;
  }) {
    // Si la taille est un BigInt, la convertir en string pour la sérialisation JSON RabbitMQ
    const safePayload = {
      ...payload,
      size:
        typeof payload.size === 'bigint'
          ? payload.size.toString()
          : payload.size,
    };

    this.logger.log(
      `Publishing event: document.uploaded for ${payload.documentId}`,
    );
    await lastValueFrom(this.client.emit('document.uploaded', safePayload));
  }

  async publishAdministrativeAttached(payload: {
    documentId: string;
    submissionId: string;
    pieceType: PieceType;
    ownerId: string;
  }) {
    this.logger.log(
      `Publishing event: document.administrative.attached for doc ${payload.documentId}`,
    );
    await lastValueFrom(
      this.client.emit('document.administrative.attached', payload),
    );
  }

  async publishOcrRequested(payload: {
    documentId: string;
    storagePath: string;
    mimeType: string;
    pieceType: PieceType;
    submissionId: string;
  }) {
    this.logger.log(
      `Publishing event: document.ocr.requested for doc ${payload.documentId}`,
    );
    await lastValueFrom(this.client.emit('document.ocr.requested', payload));
  }

  async publishDocumentValidated(payload: {
    documentId: string;
    submissionId: string;
    isValid: boolean;
    validatedBy: string | null;
    rejectionReason: string | null;
  }) {
    this.logger.log(
      `Publishing event: document.validated for doc ${payload.documentId}`,
    );
    await lastValueFrom(this.client.emit('document.validated', payload));
  }
}
