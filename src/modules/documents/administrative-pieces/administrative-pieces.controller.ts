import {
  Controller,
  Param,
  Post,
  Body,
  ParseUUIDPipe,
  Get,
  Patch,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { AdministrativePiecesService } from './administrative-pieces.service';
import { AttachPieceDto } from './dto/attach-piece.dto';
import { ValidatePieceDto } from './dto/validate-piece.dto';

@ApiTags('Pièces Administratives')
@Controller('documents/administrative')
export class AdministrativePiecesController {
  constructor(
    private readonly administrativePiecesService: AdministrativePiecesService,
  ) {}

  @Post(':submissionId')
  @ApiOperation({
    summary: 'Joindre une pièce administrative à une soumission (DOC-03)',
  })
  @ApiParam({
    name: 'submissionId',
    description: "ID de la soumission d'appel d'offres (UUID)",
    type: 'string',
  })
  @ApiResponse({
    status: 201,
    description: 'La pièce a été rattachée avec succès.',
  })
  @ApiResponse({ status: 404, description: 'Document de base introuvable.' })
  @ApiResponse({
    status: 409,
    description: 'Une pièce de ce type est déjà jointe à la soumission.',
  })
  // @Roles('OPERATEUR_ECONOMIQUE') // TODO: Décommenter après la mise en place du système de rôles (Étape 1) ou délégué à l'API Gateway
  async attachPiece(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() attachPieceDto: AttachPieceDto,
  ) {
    return this.administrativePiecesService.attachPiece(
      submissionId,
      attachPieceDto,
    );
  }

  @Get(':submissionId')
  @ApiOperation({
    summary: "Lister les pièces administratives d'une soumission (DOC-10)",
  })
  @ApiParam({
    name: 'submissionId',
    description: 'ID de la soumission (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des pièces avec leurs documents physiques.',
  })
  // Protection RBAC @Roles ignorée intentionnellement (déléguée à l'API Gateway)
  async getPiecesBySubmission(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    return this.administrativePiecesService.getPiecesBySubmission(submissionId);
  }

  @Patch('piece/:pieceId/validate')
  @ApiOperation({
    summary: 'Valider ou invalider une pièce administrative (DOC-04)',
  })
  @ApiParam({
    name: 'pieceId',
    description: 'ID de la pièce administrative à valider (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Le statut de la pièce a été mis à jour.',
  })
  @ApiResponse({
    status: 404,
    description: 'La pièce administrative est introuvable.',
  })
  // Protection RBAC @Roles ignorée intentionnellement (déléguée à l'API Gateway)
  async validatePiece(
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Body() validatePieceDto: ValidatePieceDto,
  ) {
    return this.administrativePiecesService.validatePiece(
      pieceId,
      validatePieceDto,
    );
  }
}
