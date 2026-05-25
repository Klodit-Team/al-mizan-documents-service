import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidatePieceDto {
  @ApiProperty({
    description: 'Décision de la commission (true = conforme, false = rejetée)',
    example: true,
  })
  @IsBoolean({
    message: 'La décision de la commission doit être un booléen',
  })
  @IsNotEmpty({ message: 'La décision de la commission est requise' })
  isValide: boolean;

  @ApiPropertyOptional({
    description:
      'Raison du rejet de la pièce (généralement requis si isValide est false)',
    example: 'Date de validité de la CNAS dépassée.',
  })
  @IsString({ message: 'La raison doit être une chaîne de caractères' })
  @IsOptional()
  reason?: string;
}
