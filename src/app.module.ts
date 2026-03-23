import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Infrastructure (src/niveau racine)
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { CachingModule } from './caching/caching.module';
import { MessagingModule } from './messaging/messaging.module';

// Modules métier (src/modules/)
import { DocumentsModule } from './modules/documents/documents.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { PkiModule } from './modules/pki/pki.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Protection DDOS / Rate Limiting — max 10 requêtes/minute par IP
    ThrottlerModule.forRoot([
      {
        name: 'upload',
        ttl: 60000,
        limit: 10,
      },
    ]),
    // Infrastructure
    PrismaModule,
    StorageModule,
    CachingModule,
    MessagingModule,
    // Modules métier
    DocumentsModule,
    OcrModule,
    PkiModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
