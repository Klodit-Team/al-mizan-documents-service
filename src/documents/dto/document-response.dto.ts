// =========================================================
// src/documents/dto/document-response.dto.ts
//
// DTO de réponse retourné par les endpoints.
// Définit précisément ce qu'on expose au client — on ne retourne
// jamais l'objet Prisma brut (qui pourrait contenir des champs
// internes non destinés à l'API).
// =========================================================

import { ApiProperty } from '@nestjs/swagger';
import { OwnerType } from '@prisma/client';

// ── Réponse upload ────────────────────────────────────────
export class UploadResponseDto {
  @ApiProperty({ description: 'UUID du document créé' })
  id: string;

  @ApiProperty({ description: 'Nom original du fichier' })
  nom: string;

  @ApiProperty({ description: 'Type MIME réel du fichier', example: 'application/pdf' })
  typeMime: string;

  @ApiProperty({ description: 'Taille en bytes', example: 204800 })
  tailleOctets: number;

  @ApiProperty({
    description: 'Hash SHA-256 du contenu du fichier (64 caractères hex)',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  hashSha256: string;

  @ApiProperty({
    description: 'Chemin objet dans MinIO (pas une URL directe)',
    example: 'USER/550e8400.../abc123-monfichier.pdf',
  })
  fichierUrl: string;

  @ApiProperty({ description: 'Date de création ISO 8601' })
  createdAt: Date;
}

// ── Réponse download (URL présignée) ─────────────────────
export class PresignedUrlResponseDto {
  @ApiProperty({
    description: 'URL présignée MinIO pour téléchargement direct',
    example: 'http://minio:9000/al-mizan-docs/USER/...?X-Amz-Signature=...',
  })
  url: string;

  @ApiProperty({
    description: 'Timestamp UNIX d\'expiration de l\'URL',
    example: 1700000300,
  })
  expiresAt: number;

  @ApiProperty({
    description: 'Durée de validité en secondes',
    example: 300,
  })
  ttlSeconds: number;

  @ApiProperty({
    description: 'Si true, l\'URL vient du cache Redis (pas recalculée)',
    example: false,
  })
  fromCache: boolean;
}

// ── Réponse métadonnées document ──────────────────────────
export class DocumentMetaResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty({ enum: OwnerType })
  ownerType: OwnerType;

  @ApiProperty()
  nom: string;

  @ApiProperty()
  typeMime: string;

  @ApiProperty({ nullable: true })
  tailleOctets: number | null;

  @ApiProperty()
  hashSha256: string;

  @ApiProperty()
  createdAt: Date;
}
