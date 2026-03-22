// =========================================================
// src/documents/documents.controller.ts
//
// Contrôleur HTTP pour les endpoints Documents.
// Responsabilités UNIQUEMENT :
//  - Recevoir et parser les requêtes HTTP
//  - Appliquer les guards, pipes et intercepteurs
//  - Déléguer la logique au DocumentsService
//  - Retourner la réponse HTTP avec le bon status code
//
// Le contrôleur NE contient PAS de logique métier.
// Tous les décorateurs @ApiXxx sont pour Swagger UI (/api/docs)
//
// Endpoints implémentés :
//  POST   /api/v1/documents/upload       — Upload sécurisé (DOC-01)
//  GET    /api/v1/documents/:id          — Métadonnées document (DOC-02)
//  GET    /api/v1/documents/:id/download — URL présignée (DOC-02 / DOC-08)
// =========================================================

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import {
  UploadResponseDto,
  PresignedUrlResponseDto,
  DocumentMetaResponseDto,
} from './dto/document-response.dto';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { MAX_FILE_SIZE } from '../common/config/minio.config';

@ApiTags('Documents')
@Controller('api/v1/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documentsService: DocumentsService) {}

  // ─────────────────────────────────────────────────────────────
  // POST /api/v1/documents/upload
  // [DOC-01] Upload document sécurisé
  // ─────────────────────────────────────────────────────────────
  @Post('upload')
  @HttpCode(HttpStatus.CREATED) // 201 Created — pas 200

  // Swagger : indique que cet endpoint accepte multipart/form-data
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[DOC-01] Upload un document sécurisé',
    description:
      'Upload un fichier PDF ou image avec calcul automatique du hash SHA-256. ' +
      'Le fichier est stocké dans MinIO. Les métadonnées sont enregistrées en PostgreSQL. ' +
      'Validation en 3 couches : extension, magic bytes (file-type), taille max.',
  })
  @ApiBody({
    // Description du corps multipart pour Swagger UI
    schema: {
      type: 'object',
      required: ['file', 'ownerId', 'ownerType'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Fichier à uploader (PDF, JPG, PNG — max 50 MB)',
        },
        ownerId: {
          type: 'string',
          format: 'uuid',
          description: 'UUID du propriétaire',
        },
        ownerType: {
          type: 'string',
          enum: ['USER', 'ORGANISATION'],
          description: 'Type de propriétaire',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploadé avec succès',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Fichier déjà existant (doublon de hash)' })
  @ApiResponse({ status: 422, description: 'Fichier invalide (type non autorisé, spoofing détecté, trop grand)' })
  @ApiResponse({ status: 400, description: 'Corps de requête invalide (DTO)' })

  // FileInterceptor('file') configure Multer pour accepter le champ 'file'
  // memoryStorage() stocke le fichier en RAM (Buffer) — approprié pour < 50 MB
  // Pour des fichiers > 100 MB, utiliser diskStorage avec tmpdir puis stream vers MinIO
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Buffer en RAM — voir note ci-dessus
      limits: {
        fileSize: MAX_FILE_SIZE, // Limite Multer (première couche de taille)
        files: 1,                // Un seul fichier par requête
      },
    }),
  )
  async uploadDocument(
    // @UploadedFile avec FileValidationPipe :
    // 1. Multer reçoit le fichier → le met dans file.buffer
    // 2. FileValidationPipe.transform(file) vérifie extension + magic bytes + taille
    // 3. Si validation OK → file est passé à la méthode
    // 4. Si validation FAIL → exception 422 levée AVANT d'entrer dans la méthode
    @UploadedFile(new FileValidationPipe()) file: Express.Multer.File,

    // @Body() reçoit les champs texte du formulaire multipart
    // ValidationPipe global (configuré dans main.ts) valide les décorateurs class-validator
    @Body() uploadDto: UploadDocumentDto,
  ): Promise<UploadResponseDto> {
    this.logger.log(
      `Upload reçu: "${file.originalname}" | ${(file.size / 1024).toFixed(1)} KB | ` +
        `owner: ${uploadDto.ownerType}:${uploadDto.ownerId}`,
    );

    return this.documentsService.uploadDocument(file, uploadDto);
  }

  // ─────────────────────────────────────────────────────────────
  // GET /api/v1/documents/:id
  // [DOC-02] Consulter les métadonnées d'un document
  // ─────────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({
    summary: '[DOC-02] Récupérer les métadonnées d\'un document',
    description:
      'Retourne les informations du document (nom, type MIME, taille, hash SHA-256). ' +
      'Ne retourne PAS l\'URL de téléchargement — utiliser /download pour ça.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID du document' })
  @ApiResponse({
    status: 200,
    description: 'Métadonnées du document',
    type: DocumentMetaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  async getDocumentById(
    // ParseUUIDPipe valide que :id est un UUID v4 valide
    // Si ce n'est pas un UUID → 400 Bad Request automatiquement
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentMetaResponseDto> {
    return this.documentsService.getDocumentById(id);
  }

  // ─────────────────────────────────────────────────────────────
  // GET /api/v1/documents/:id/download
  // [DOC-02 / DOC-08] Générer URL présignée pour téléchargement
  // ─────────────────────────────────────────────────────────────
  @Get(':id/download')
  @ApiOperation({
    summary: '[DOC-08] Générer une URL présignée pour téléchargement direct',
    description:
      'Génère une URL présignée MinIO permettant le téléchargement DIRECT du fichier. ' +
      'Le fichier transite directement de MinIO vers le client, sans passer par ce service. ' +
      'L\'URL est mise en cache Redis (TTL configurable, défaut: 5 min). ' +
      'Si l\'URL est déjà en cache, elle est retournée instantanément (fromCache: true).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID du document' })
  @ApiResponse({
    status: 200,
    description: 'URL présignée générée',
    type: PresignedUrlResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  async getPresignedDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PresignedUrlResponseDto> {
    this.logger.debug(`Demande URL présignée pour document: ${id}`);
    return this.documentsService.getPresignedUrl(id);
  }
}
