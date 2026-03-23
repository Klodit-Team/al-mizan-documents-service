// =========================================================
// src/caching/caching.service.ts
//
// Wrapper léger autour du client Redis partagé ('REDIS_CLIENT').
// Réutilise le client ioredis injecté par RedisModule (@Global)
// au lieu de créer une 2ème connexion redondante.
// =========================================================

import { Injectable, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Injectable()
export class CachingService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly client: Redis,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
