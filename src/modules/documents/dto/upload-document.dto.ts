// =========================================================
// src/documents/dto/upload-document.dto.ts
//
// DTO (Data Transfer Object) pour l'endpoint POST /upload.
// Validé automatiquement par ValidationPipe de NestJS grâce
// aux décorateurs class-validator.
//
// Ce DTO ne contient PAS les informations du fichier lui-même
// (géré par Multer), mais les métadonnées métier associées :
// qui est le propriétaire (ownerId) et de quel type (ownerType).
// =========================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { OwnerType } from '@prisma/client';

export enum OrganisationDocumentType {
  NIF = 'NIF',
  NIS = 'NIS',
  DENOMINATION = 'DENOMINATION',
}

export class UploadDocumentDto {
  @ApiProperty({
    description: 'UUID du propriétaire du document (userId ou organisationId)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'ownerId doit être un UUID valide (v4)' })
  @IsNotEmpty({ message: 'ownerId est obligatoire' })
  ownerId: string;

  @ApiProperty({
    description: 'Type de propriétaire',
    enum: OwnerType,
    example: OwnerType.USER,
  })
  @IsEnum(OwnerType, {
    message: `ownerType doit être l'une des valeurs: ${Object.values(OwnerType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'ownerType est obligatoire' })
  ownerType: OwnerType;

  @ApiProperty({
    description: "Type du document d'organisation (NIF | NIS | DENOMINATION). Obligatoire si ownerType = ORGANISATION",
    enum: OrganisationDocumentType,
    required: false,
  })
  @IsEnum(OrganisationDocumentType)
  @IsOptional()
  documentType?: OrganisationDocumentType;

  @ApiProperty({
    description: "UUID de l'utilisateur qui a uploadé (optionnel)",
    required: false,
    format: 'uuid',
  })
  @IsUUID('4')
  @IsOptional()
  uploadedBy?: string;
}
