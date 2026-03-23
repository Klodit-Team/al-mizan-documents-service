import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentEventPublisher } from '../../../messaging/publishers/document-event.publisher';
import { AttachPieceDto } from './dto/attach-piece.dto';
import { ValidatePieceDto } from './dto/validate-piece.dto';

@Injectable()
export class AdministrativePiecesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentEventPublisher: DocumentEventPublisher,
  ) {}

  async attachPiece(submissionId: string, attachPieceDto: AttachPieceDto) {
    const { documentId, type, designation, dateExpiration } = attachPieceDto;

    // 1. Vérifier que le document physique existe bien (uploadé par le collègue)
    const documentExists = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!documentExists) {
      throw new NotFoundException(
        `Le document physique avec l'ID ${documentId} n'existe pas ou n'a pas encore été uploadé.`,
      );
    }

    // 2. Règle métier : Interdire les doublons du même type de pièce pour une même soumission
    const pieceAlreadyAttached =
      await this.prisma.pieceAdministrative.findFirst({
        where: {
          soumissionId: submissionId,
          type: type,
        },
      });

    if (pieceAlreadyAttached) {
      throw new ConflictException(
        `Une pièce de type ${type} est déjà attachée à cette soumission.`,
      );
    }

    // 3. Rattachement dans la base de données
    const newPiece = await this.prisma.pieceAdministrative.create({
      data: {
        soumissionId: submissionId,
        documentId: documentId,
        type: type,
        designation: designation || null,
        dateExpiration: dateExpiration ? new Date(dateExpiration) : null,
      },
    });

    // Déclencher les événements RabbitMQ (Phase 4)
    await this.documentEventPublisher.publishAdministrativeAttached({
      documentId: documentId,
      submissionId: submissionId,
      pieceType: type,
      ownerId: documentExists.ownerId,
    });

    await this.documentEventPublisher.publishOcrRequested({
      documentId: documentId,
      storagePath: documentExists.fichierUrl,
      mimeType: documentExists.typeMime,
      pieceType: type,
      submissionId: submissionId,
    });

    return {
      message: 'Pièce administrative rattachée avec succès',
      piece: newPiece,
    };
  }

  async getPiecesBySubmission(submissionId: string) {
    const pieces = await this.prisma.pieceAdministrative.findMany({
      where: {
        soumissionId: submissionId,
      },
      include: {
        document: true, // Inclut les métadonnées réelles du document physique (URL MinIO, Hash)
      },
    });

    return pieces;
  }

  async validatePiece(pieceId: string, validatePieceDto: ValidatePieceDto) {
    const { isValide, reason } = validatePieceDto;

    // 1. Récupérer la pièce existante
    const existingPiece = await this.prisma.pieceAdministrative.findUnique({
      where: { id: pieceId },
    });

    if (!existingPiece) {
      throw new NotFoundException(
        `La pièce administrative avec l'ID ${pieceId} n'existe pas.`,
      );
    }

    // 2. Règle métier forte : Vérifier la date d'expiration
    let finalDecision = isValide;
    let fallbackReason = reason;

    if (
      existingPiece.dateExpiration &&
      existingPiece.dateExpiration < new Date()
    ) {
      // Forcer l'invalidation car le document est d'ores et déjà expiré légalement
      finalDecision = false;
      if (isValide === true) {
        fallbackReason =
          "Rejet automatique par le système : La date d'expiration du document est dépassée.";
      }
    }

    // 3. Mise à jour de la décision en base de données
    const updatedPiece = await this.prisma.pieceAdministrative.update({
      where: { id: pieceId },
      data: {
        isValide: finalDecision,
      },
    });

    // Déclencher "documents.exchange" :: "document.validated" (Phase 4)
    await this.documentEventPublisher.publishDocumentValidated({
      documentId: existingPiece.documentId,
      submissionId: existingPiece.soumissionId,
      isValid: finalDecision,
      validatedBy: null, // Géré par l'API Gateway ou contexte utilisateur futur
      rejectionReason: fallbackReason || null,
    });

    return {
      message: 'Décision enregistrée avec succès',
      piece: updatedPiece,
      appliedDecision: finalDecision,
      appliedReason: fallbackReason || 'Aucune',
    };
  }
}
