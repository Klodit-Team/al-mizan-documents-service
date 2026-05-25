import { ApiProperty } from '@nestjs/swagger';

export class PkiVerificationResponse {
  @ApiProperty() isValid: boolean;
  @ApiProperty() issuer: string;
  @ApiProperty() subject: string;
  @ApiProperty() notBefore: string;
  @ApiProperty() notAfter: string;
  @ApiProperty() isRevoked: boolean;
}
