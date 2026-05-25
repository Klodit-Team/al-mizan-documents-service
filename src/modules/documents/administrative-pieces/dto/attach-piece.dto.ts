import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { PieceType } from '@prisma/client';

export class AttachPieceDto {
  @ApiProperty({
    description: 'ID unique du document physique (déjà uploadé sur MinIO)',
    example: '123e4567-e89bd-12d3-a456-426614174000',
  })
  @IsUUID(4, { message: "L'ID du document doit être un UUID valide" })
  @IsNotEmpty({ message: "L'ID du document est requis" })
  documentId: string;

  @ApiProperty({
    enum: PieceType,
    description:
      'Type de la pièce administrative selon la nomenclature (NIF, NIS, RC...)',
    example: PieceType.REGISTRE_COMMERCE,
  })
  @IsEnum(PieceType)
  @IsNotEmpty({ message: 'Le type de la pièce est requis' })
  type: PieceType;

  @ApiPropertyOptional({
    description: "Désignation libre ou complémentaire fournie par l'opérateur",
    example: 'Copie du registre de commerce électronique de 2025',
  })
  @IsString({
    message: 'La désignation doit être une chaîne de caractères',
  })
  @IsOptional()
  designation?: string;

  @ApiPropertyOptional({
    description:
      "Date d'expiration de la pièce administrative (format ISO 8601)",
    example: '2026-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsOptional()
  dateExpiration?: string;
}
