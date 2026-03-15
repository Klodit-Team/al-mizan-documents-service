import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { CachingModule } from './caching/caching.module';
import { MessagingModule } from './messaging/messaging.module';
import { DocumentsModule } from './documents/documents.module';
import { OcrModule } from './ocr/ocr.module';
import { PkiModule } from './pki/pki.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    StorageModule,
    CachingModule,
    MessagingModule,
    DocumentsModule,
    OcrModule,
    PkiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
