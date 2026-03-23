// =========================================================
// src/prisma/prisma.module.ts
//
// Module NestJS global qui expose PrismaService dans toute
// l'application. Déclaré @Global() pour éviter de devoir
// l'importer dans chaque module qui en a besoin.
// =========================================================

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
