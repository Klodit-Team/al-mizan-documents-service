import { Controller, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { PkiService } from './pki.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PkiVerificationResponse } from './entities/pki-verification.entity';

@ApiTags('SÃ©curitÃ© PKI & Certificats')
@Controller('documents')
export class PkiController {
  constructor(private readonly pkiService: PkiService) {}

  @Post(':id/verify-certificate')
  @ApiOperation({
    summary: 'Vérifier la validité des certificats PKI (DOC-07)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID du document (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificat cryptographique analysé avec succès.',
    type: PkiVerificationResponse
  })
  @ApiResponse({
    status: 400,
    description: 'Aucune signature Pades trouvée dans les octets',
  })
  async verifyCertificate(@Param('id', ParseUUIDPipe) id: string): Promise<PkiVerificationResponse> {
    return this.pkiService.verifyCertificate(id);
  }
}
