import { ApiProperty } from '@nestjs/swagger';

export class PkiVerificationResponse {
  @ApiProperty({
    description:
      'Indique si la signature et la chaîne de certificats sont valides',
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description: 'Autorité de certification émettrice du certificat',
    example:
      'CN=Autorité Nationale Algérienne de Certification Électronique, O=ANCG, C=DZ',
  })
  issuer: string;

  @ApiProperty({
    description: 'Propriétaire/sujet du certificat',
    example: 'CN=Opérateur Économique BTP, O=BTP ALGERIE, C=DZ',
  })
  subject: string;

  @ApiProperty({
    description: 'Date de début de validité du certificat (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
  })
  notBefore: string;

  @ApiProperty({
    description: 'Date de fin de validité du certificat (ISO 8601)',
    example: '2027-01-01T00:00:00Z',
  })
  notAfter: string;

  @ApiProperty({
    description: 'Indique si le certificat a été révoqué (via CRL/OCSP)',
    example: false,
  })
  isRevoked: boolean;
}
