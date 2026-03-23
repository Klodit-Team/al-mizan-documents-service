import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':id/download')
  @ApiOperation({
    summary: 'Générer une URL présignée MinIO pour téléchargement (DOC-08)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID du document (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: "URL présignée retournée avec sa date d'expiration.",
  })
  @ApiResponse({ status: 404, description: 'Document introuvable.' })
  async download(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getPresignedUrl(id);
  }

  @Get(':id/integrity')
  @ApiOperation({
    summary: "Vérifier l'intégrité SHA-256 d'un document (DOC-09)",
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
