import { Module } from '@nestjs/common';
import { AdministrativePiecesController } from './administrative-pieces.controller';
import { AdministrativePiecesService } from './administrative-pieces.service';

@Module({
  controllers: [AdministrativePiecesController],
  providers: [AdministrativePiecesService],
})
export class AdministrativePiecesModule {}
