import { Controller, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { PkiService } from './pki.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PkiVerificationResponse } from './entities/pki-verification.entity';

@ApiTags('Sécurité PKI & Certificats')
@Controller('documents')
export class PkiController {
  constructor(private readonly pkiService: PkiService) {}

  @Post(':id/verify-certificate')
  @ApiOperation({
    summary: 'Vérifier la validité des certificats PKI (DOC-07)',
    description:
      "Analyse les signatures cryptographiques du document PDF (PAdES) pour valider l'intégrité, la chaîne de confiance de l'autorité de certification (CA) et le statut de révocation.",
  })
  @ApiParam({
    name: 'id',
    description: 'ID du document physique (UUID) à vérifier',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificat cryptographique analysé avec succès.',
    type: PkiVerificationResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'Aucune signature PAdES trouvée dans les octets ou signature invalide.',
  })
  @ApiResponse({
    status: 404,
    description: 'Document physique introuvable.',
  })
  async verifyCertificate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PkiVerificationResponse> {
    return this.pkiService.verifyCertificate(id);
  }
}
