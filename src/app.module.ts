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
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/caching/redis.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    // ConfigModule charge les variables .env globalement
    // isGlobal: true → process.env disponible partout sans import
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Modules infrastructure (ordre important pour le démarrage)
    PrismaModule,   // @Global() — PostgreSQL
    RedisModule,    // @Global() — Redis cache
    StorageModule,  // MinIO

    // Modules métier
    DocumentsModule,
  ],
})
export class AppModule {}
