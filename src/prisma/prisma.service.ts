// =========================================================
// src/prisma/prisma.service.ts
//
// Extension de PrismaClient qui s'intègre au cycle de vie
// NestJS. OnModuleInit assure la connexion au démarrage,
// ce qui fait échouer rapidement si la DB est injoignable
// (fail-fast) plutôt que de découvrir l'erreur à la première requête.
// =========================================================

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // Logger NestJS intégré pour tracer les erreurs de connexion DB
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // On passe les options de logging Prisma en dev pour voir les queries SQL
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  // ─── Cycle de vie NestJS ───────────────────────────────────
  // Appelé automatiquement quand le module est initialisé.
  // On ouvre la connexion PostgreSQL ici.
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('✅ Connexion PostgreSQL établie (document_db)');
    } catch (error) {
      this.logger.error('❌ Impossible de se connecter à PostgreSQL', error);
      // On laisse l'erreur remonter pour que NestJS arrête le démarrage
      throw error;
    }
  }

  // ─── Utilitaire: healthcheck ───────────────────────────────
  // Utilisé par le endpoint GET /health/ready pour vérifier
  // que la connexion DB est toujours opérationnelle.
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
