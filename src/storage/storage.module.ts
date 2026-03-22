// =========================================================
// src/storage/storage.module.ts
//
// Module dédié aux interactions avec MinIO (S3-compatible).
// Exporté pour être utilisé dans DocumentsModule.
// =========================================================

import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService], // Exporté pour injection dans DocumentsService
})
export class StorageModule {}
