import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PieceType } from '@prisma/client';

export class PieceAdministrative {
  @ApiProperty() id: string;
  @ApiProperty() soumissionId: string;
  @ApiProperty() documentId: string;
  @ApiProperty({ enum: PieceType }) type: PieceType;
  @ApiPropertyOptional() designation: string | null;
  @ApiPropertyOptional() isValide: boolean | null;
  @ApiPropertyOptional() dateExpiration: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AttachPieceResponse {
  @ApiProperty() message: string;
  @ApiProperty({ type: PieceAdministrative }) piece: PieceAdministrative;
}

export class ValidatePieceResponse {
  @ApiProperty() message: string;
  @ApiProperty({ type: PieceAdministrative }) piece: PieceAdministrative;
  @ApiProperty() appliedDecision: boolean;
  @ApiProperty() appliedReason: string;
}
