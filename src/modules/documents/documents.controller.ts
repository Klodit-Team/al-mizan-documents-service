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
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'ownerId', 'ownerType'],
      properties: {
        file: { type: 'string', format: 'binary' },
        ownerId: { type: 'string', format: 'uuid' },
        ownerType: { type: 'string', enum: ['USER', 'ORGANISATION'] },
        documentType: { type: 'string', enum: ['NIF', 'NIS', 'DENOMINATION'] },
        uploadedBy: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 201, type: UploadResponseDto })
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
  @ApiOperation({ summary: "[DOC-02] Récupérer les métadonnées d'un document" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: DocumentMetaResponseDto })
  async getDocumentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getDocumentById(id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: '[DOC-08] Générer une URL présignée pour téléchargement direct',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: PresignedUrlResponseDto })
  async getPresignedDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getPresignedUrl(id);
  }

  @Get(':id/integrity')
  @ApiOperation({
    summary: "[DOC-09] Vérifier l'intégrité SHA-256 d'un document",
  })
  @ApiParam({
    name: 'id',
    description: 'ID du document (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: "Résultat de la vérification d'intégrité.",
  })
  @ApiResponse({ status: 404, description: 'Document introuvable.' })
  async integrity(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.checkIntegrity(id);
  }
}
