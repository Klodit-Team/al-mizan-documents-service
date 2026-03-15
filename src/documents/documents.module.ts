import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AdministrativePiecesModule } from './administrative-pieces/administrative-pieces.module';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  imports: [AdministrativePiecesModule],
})
export class DocumentsModule {}
