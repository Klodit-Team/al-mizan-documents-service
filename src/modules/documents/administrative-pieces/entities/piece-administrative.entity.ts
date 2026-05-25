import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PieceType } from '@prisma/client';

export class PieceAdministrative {
  @ApiProperty({
    description: 'UUID de la pièce administrative en base de données',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: "UUID de la soumission d'appel d'offres associée",
    example: '223e4567-e89b-12d3-a456-426614174001',
  })
  soumissionId: string;

  @ApiProperty({
    description: 'UUID du document physique lié (stocké sur MinIO)',
    example: '323e4567-e89b-12d3-a456-426614174002',
  })
  documentId: string;

  @ApiProperty({
    enum: PieceType,
    description: 'Type de la pièce administrative',
    example: PieceType.REGISTRE_COMMERCE,
  })
  type: PieceType;

  @ApiPropertyOptional({
    description: "Désignation libre ou complémentaire fournie par l'opérateur",
    example: 'Copie du registre de commerce électronique 2025',
  })
  designation: string | null;

  @ApiPropertyOptional({
    description:
      'Statut de validation (true = conforme, false = non conforme, null = en attente)',
    example: null,
  })
  isValide: boolean | null;

  @ApiPropertyOptional({
    description: "Date d'expiration de la pièce administrative",
    example: '2026-12-31T23:59:59Z',
  })
  dateExpiration: Date | null;

  @ApiProperty({ description: "Date de création de l'enregistrement" })
  createdAt: Date;
}

export class AttachPieceResponse {
  @ApiProperty({
    description: "Message explicatif de l'action",
    example: 'La pièce administrative a été rattachée avec succès.',
  })
  message: string;

  @ApiProperty({
    type: PieceAdministrative,
    description: 'Détails de la pièce administrative rattachée',
  })
  piece: PieceAdministrative;
}

export class ValidatePieceResponse {
  @ApiProperty({
    description: 'Message explicatif de la validation',
    example: 'Le statut de la pièce a été mis à jour avec succès.',
  })
  message: string;

  @ApiProperty({
    type: PieceAdministrative,
    description: 'Détails de la pièce administrative après mise à jour',
  })
  piece: PieceAdministrative;

  @ApiProperty({
    description:
      'La décision de conformité appliquée (true = validée, false = rejetée)',
    example: true,
  })
  appliedDecision: boolean;

  @ApiProperty({
    description: 'Motif du rejet (si non conforme)',
    example: 'Date de validité de la CNAS dépassée.',
  })
  appliedReason: string;
}
