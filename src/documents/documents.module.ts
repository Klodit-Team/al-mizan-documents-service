// =========================================================
// src/documents/documents.module.ts
//
// Module NestJS qui regroupe tous les providers Documents.
// NestJS utilise les modules pour gérer le graphe d'injection
// de dépendances — ce fichier déclare "qui fournit quoi".
//
// Dépendances injectées dans DocumentsService :
//  - PrismaService   (via PrismaModule @Global())
//  - StorageService  (via StorageModule importé ici)
//  - REDIS_CLIENT    (via RedisModule @Global())
// =========================================================

import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    StorageModule, // Fournit StorageService (wrapper MinIO)
    // PrismaModule et RedisModule sont @Global() → pas besoin de les importer ici
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService], // Exporté si d'autres modules ont besoin de DocumentsService
})
export class DocumentsModule {}
