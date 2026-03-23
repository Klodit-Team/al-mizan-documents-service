// =========================================================
// src/app.module.ts
//
// Module racine de l'application NestJS.
// Tous les modules sont importés ici.
//
// Ordre d'initialisation NestJS :
//  1. AppModule instancié
//  2. PrismaModule → onModuleInit → connexion PostgreSQL
//  3. RedisModule → client ioredis connecté
//  4. StorageModule → onModuleInit → bucket MinIO créé/vérifié
//  5. DocumentsModule → controllers/services prêts
//  6. Application en écoute sur le port
// =========================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Infrastructure (src/niveau racine)
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/caching/redis.module';
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
    // ConfigModule charge les variables .env globalement
    // isGlobal: true → process.env disponible partout sans import
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
})
export class AppModule {}
