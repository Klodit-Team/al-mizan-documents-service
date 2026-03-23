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
  exports: [DocumentsService],
})
export class DocumentsModule {}
