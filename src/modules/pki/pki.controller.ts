import { Controller, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { PkiService } from './pki.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('SÃ©curitÃ© PKI & Certificats')
@Controller('documents')
export class PkiController {
  constructor(private readonly pkiService: PkiService) {}

  @Post(':id/verify-certificate')
  @ApiOperation({
    summary: 'VÃ©rifier la validitÃ© des certificats PKI (DOC-07)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID du document (UUID)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificat cryptographique analysÃ© avec succÃ¨s.',
  })
  @ApiResponse({
    status: 400,
    description: 'Aucune signature Pades trouvÃ©e dans les octets',
  })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  async verifyCertificate(@Param('id', ParseUUIDPipe) id: string) {
    return this.pkiService.verifyCertificate(id);
  }
}
