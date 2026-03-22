// =========================================================
// src/prisma/prisma.module.ts
//
// Module NestJS global qui expose PrismaService dans toute
// l'application. Déclaré @Global() pour éviter de devoir
// l'importer dans chaque module qui en a besoin.
// =========================================================

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Rend PrismaService disponible partout sans import explicite
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Exporte pour que les autres modules puissent l'injecter
})
export class PrismaModule {}
