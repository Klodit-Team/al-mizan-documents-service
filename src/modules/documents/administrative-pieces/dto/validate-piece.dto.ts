import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidatePieceDto {
  @ApiProperty({
    description:
      'DÃ©cision de la commission (true = conforme, false = rejetÃ©e)',
    example: true,
  })
  @IsBoolean({
    message: 'La dÃ©cision de la commission doit Ãªtre un boolÃ©en',
  })
  @IsNotEmpty({ message: 'La dÃ©cision de la commission est requise' })
  isValide: boolean;

  @ApiPropertyOptional({
    description:
      'Raison du rejet de la piÃ¨ce (gÃ©nÃ©ralement requis si isValide est false)',
    example: 'Date de validitÃ© de la CNAS dÃ©passÃ©e.',
  })
  @IsString({ message: 'La raison doit Ãªtre une chaÃ®ne de caractÃ¨res' })
  @IsOptional()
  reason?: string;
}
