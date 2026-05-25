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
import {
  PieceAdministrative,
  AttachPieceResponse,
  ValidatePieceResponse,
} from './entities/piece-administrative.entity';

@ApiTags('Pièces Administratives')
@Controller('documents/administrative')
export class AdministrativePiecesController {
  constructor(
    private readonly administrativePiecesService: AdministrativePiecesService,
  ) {}

  @Post(':submissionId')
  @ApiOperation({
    summary: 'Joindre une pièce administrative à une soumission (DOC-03)',
    description:
      "Permet d'associer un document physique préalablement téléversé sur MinIO à une pièce administrative requise pour une soumission d'appel d'offres spécifique.",
  })
  @ApiParam({
    name: 'submissionId',
    description: "ID unique de la soumission d'appel d'offres (UUID)",
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description:
      'La pièce administrative a été rattachée à la soumission avec succès.',
    type: AttachPieceResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'ID de soumission invalide, données de liaison incorrectes ou document physique inexistant.',
  })
  @ApiResponse({
    status: 404,
    description: "Soumission d'appel d'offres introuvable.",
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflit : une pièce administrative de ce type est déjà liée à cette soumission.',
  })
  async attachPiece(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() attachPieceDto: AttachPieceDto,
  ): Promise<AttachPieceResponse> {
    return this.administrativePiecesService.attachPiece(
      submissionId,
      attachPieceDto,
    );
  }

  @Get(':submissionId')
  @ApiOperation({
    summary: "Lister les pièces administratives d'une soumission (DOC-10)",
    description:
      "Récupère la liste complète des pièces administratives (ex: NIF, NIS, Registre de commerce) rattachées à une soumission d'offre spécifique avec les détails de leurs documents physiques.",
  })
  @ApiParam({
    name: 'submissionId',
    description: "ID de la soumission d'offre (UUID)",
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des pièces administratives récupérée avec succès.',
    type: [PieceAdministrative],
  })
  @ApiResponse({
    status: 400,
    description: 'ID de soumission non valide.',
  })
  @ApiResponse({
    status: 404,
    description: 'Soumission introuvable dans le système.',
  })
  async getPiecesBySubmission(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ): Promise<PieceAdministrative[]> {
    return this.administrativePiecesService.getPiecesBySubmission(submissionId);
  }

  @Patch('piece/:pieceId/validate')
  @ApiOperation({
    summary: 'Valider ou invalider une pièce administrative (DOC-04)',
    description:
      "Permet au contrôleur ou à la commission d'évaluation de marquer une pièce administrative comme valide (conforme) ou rejetée (non conforme) avec justification obligatoire.",
  })
  @ApiParam({
    name: 'pieceId',
    description: 'ID unique de la pièce administrative à valider (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description:
      'Le statut de validation de la pièce a été mis à jour avec succès.',
    type: ValidatePieceResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'ID de pièce non valide ou données de validation incorrectes.',
  })
  @ApiResponse({
    status: 404,
    description: 'Pièce administrative introuvable dans le système.',
  })
  async validatePiece(
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Body() validatePieceDto: ValidatePieceDto,
  ): Promise<ValidatePieceResponse> {
    return this.administrativePiecesService.validatePiece(
      pieceId,
      validatePieceDto,
    );
  }
}
