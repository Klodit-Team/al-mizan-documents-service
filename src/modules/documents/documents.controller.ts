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
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe';
import { MAX_FILE_SIZE } from '../../common/config/minio.config';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[DOC-01] Upload un document sécurisé',
    description:
      "Permet de téléverser et de stocker de manière sécurisée un fichier physique (PDF, image, etc.) sur MinIO, d'en calculer le hash SHA-256 et de l'associer à une entité propriétaire (Utilisateur ou Organisation).",
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'ownerId', 'ownerType'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Le fichier physique à téléverser (limite : 10 Mo)',
        },
        ownerId: {
          type: 'string',
          format: 'uuid',
          description:
            'UUID du propriétaire du document (Utilisateur ou Organisation)',
        },
        ownerType: {
          type: 'string',
          enum: ['USER', 'ORGANISATION'],
          description: 'Type de propriétaire associé',
        },
        documentType: {
          type: 'string',
          enum: ['NIF', 'NIS', 'DENOMINATION'],
          description:
            "Type de justificatif administratif d'organisation (requis si ownerType = ORGANISATION)",
        },
        uploadedBy: {
          type: 'string',
          format: 'uuid',
          description: "UUID de l'utilisateur effectuant le téléversement",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Le document a été téléversé et enregistré avec succès.',
    type: UploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Données d'entrée invalides, type de fichier non autorisé ou taille limite dépassée.",
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflit : ce document existe déjà dans le système (doublon de fichier).',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    }),
  )
  async uploadDocument(
    @UploadedFile(new FileValidationPipe()) file: Express.Multer.File,
    @Body() uploadDto: UploadDocumentDto,
  ): Promise<UploadResponseDto> {
    return this.documentsService.uploadDocument(file, uploadDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: "[DOC-02] Récupérer les métadonnées d'un document",
    description:
      'Retourne toutes les métadonnées associées à un document physique enregistré (nom original, type MIME, hash cryptographique, taille et propriétaire).',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unique du document physique recherché',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Métadonnées du document récupérées avec succès.',
    type: DocumentMetaResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'ID de document fourni non valide.',
  })
  @ApiResponse({
    status: 404,
    description: 'Document introuvable dans le système.',
  })
  async getDocumentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getDocumentById(id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: '[DOC-08] Générer une URL présignée pour téléchargement direct',
    description:
      'Génère une URL présignée MinIO hautement sécurisée, temporaire et avec mise en cache Redis, permettant au client de télécharger le fichier directement depuis le bucket privé.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unique du document à télécharger',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'URL de téléchargement présignée générée avec succès.',
    type: PresignedUrlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'ID de document fourni non valide.',
  })
  @ApiResponse({
    status: 404,
    description: 'Document introuvable dans le système.',
  })
  async getPresignedDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getPresignedUrl(id);
  }

  @Get(':id/integrity')
  @ApiOperation({
    summary: "[DOC-09] Vérifier l'intégrité SHA-256 d'un document",
    description:
      'Calcule dynamiquement le hash SHA-256 actuel du fichier physique stocké sur MinIO et le compare à celui stocké en base de données pour détecter toute corruption ou altération.',
  })
  @ApiParam({
    name: 'id',
    description: "UUID unique du document dont l'intégrité doit être vérifiée",
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description:
      "Résultat de la vérification d'intégrité (valide ou corrompu).",
    schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', format: 'uuid' },
        nom: { type: 'string' },
        hashStocke: { type: 'string' },
        hashCalcule: { type: 'string' },
        conforme: { type: 'boolean' },
        verifieLe: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'ID de document fourni non valide.',
  })
  @ApiResponse({
    status: 404,
    description: 'Document physique ou enregistrement introuvable.',
  })
  async integrity(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.checkIntegrity(id);
  }
}
