// =========================================================
// src/common/caching/redis.module.ts
//
// Module NestJS pour Redis via ioredis.
// Utilise un CUSTOM PROVIDER avec token 'REDIS_CLIENT'
// pour permettre l'injection dans n'importe quel service.
//
// POURQUOI un custom provider et pas @nestjs/cache-manager ?
// - Contrôle total sur le client ioredis
// - Gestion fine des erreurs de connexion
// - Compatible avec les méthodes ioredis (setex, ttl, etc.)
//   que @nestjs/cache-manager n'expose pas directement
// =========================================================

import { Module, Logger, Global } from '@nestjs/common';
import Redis from 'ioredis';

const redisLogger = new Logger('RedisModule');

@Global() // Redis accessible partout sans import
@Module({
  providers: [
    {
      // Token d'injection : @Inject('REDIS_CLIENT')
      provide: 'REDIS_CLIENT',

      // useFactory permet de créer le client de manière asynchrone
      // et de gérer les erreurs de connexion proprement
      useFactory: (): Redis => {
        const client = new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,

          // Reconnexion automatique en cas de coupure réseau
          // retryStrategy retourne le délai en ms avant la prochaine tentative
          // null = ne plus réessayer (après 10 tentatives)
          retryStrategy: (times: number) => {
            if (times > 10) {
              redisLogger.error(
                `Redis: 10 tentatives de reconnexion échouées — abandon`,
              );
              return null; // Arrêter de réessayer
            }
            const delay = Math.min(times * 200, 3000); // Backoff: 200ms, 400ms... max 3s
            redisLogger.warn(`Redis: reconnexion dans ${delay}ms (tentative ${times})`);
            return delay;
          },

          // Pas de throw si Redis est down — retourner null à la place
          // Permet le graceful degradation dans DocumentsService
          enableOfflineQueue: false,
          lazyConnect: false,
          maxRetriesPerRequest: 1, // Ne pas bloquer longtemps si Redis est lent
        });

        // Événements ioredis pour le monitoring
        client.on('connect', () => {
          redisLogger.log(
            `✅ Connexion Redis établie → ${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`,
          );
        });

        client.on('error', (err: Error) => {
          // Ne pas throw ici — juste logger. Les services gèrent le cas Redis down.
          redisLogger.error(`Erreur Redis: ${err.message}`);
        });

        client.on('close', () => {
          redisLogger.warn('Connexion Redis fermée');
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT'], // Exporter le token pour injection ailleurs
})
export class RedisModule {}
