import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AdministrativePiecesModule } from './administrative-pieces/administrative-pieces.module';
import { StorageModule } from '../../storage/storage.module';
import { CachingModule } from '../../caching/caching.module';
import { MessagingModule } from '../../messaging/messaging.module';

@Module({
  imports: [
    AdministrativePiecesModule,
    StorageModule,
    CachingModule,
    MessagingModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
