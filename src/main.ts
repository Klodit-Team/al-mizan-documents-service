// =========================================================
// src/main.ts
//
// Point d'entrée de l'application NestJS.
// Configure :
//  - ValidationPipe global (class-validator sur tous les DTOs)
//  - Swagger UI sur /api/docs
//  - Préfixe global /api/v1 (optionnel — déjà dans les contrôleurs)
//  - CORS
//  - Port d'écoute 8005
// =========================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { MinioExceptionFilter } from './common/filters/minio-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ── Filtres globaux ──────────────────────────────────────
  // MinioExceptionFilter traduit les erreurs MinIO en réponses HTTP cohérentes
  app.useGlobalFilters(new MinioExceptionFilter());

  // ── ValidationPipe global ────────────────────────────────────
  // Applique automatiquement les décorateurs class-validator
  // sur TOUS les DTOs de TOUS les contrôleurs, sans avoir à
  // ajouter @UsePipes() sur chaque endpoint.
  //
  // whitelist: true      → Supprimer les propriétés inconnues du body
  //                        (sécurité : empêche l'injection de champs non attendus)
  // forbidNonWhitelisted → Lever une erreur si des champs inconnus sont envoyés
  //                        (plutôt que les ignorer silencieusement)
  // transform: true      → Convertir automatiquement les types
  //                        (ex: "4" string → 4 number si le DTO attend un number)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Messages d'erreur lisibles en cas d'échec de validation
      // Ex: "ownerId must be a UUID" plutôt qu'un tableau d'erreurs brut
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── CORS ────────────────────────────────────────────────
  // En développement, autoriser toutes les origines.
  // En production, restreindre à l'API Gateway uniquement.
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
      : '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Swagger UI ───────────────────────────────────────────
  // Documentation API auto-générée depuis les décorateurs @ApiXxx
  // Accessible sur http://localhost:8005/api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Al-Mizan — Document Service')
    .setDescription(
      'API de gestion des documents pour la plateforme Al-Mizan. ' +
        'Gère l\'upload sécurisé, le stockage MinIO, la génération d\'URL présignées ' +
        'et les pièces administratives des soumissions.',
    )
    .setVersion('1.0')
    .addTag('Documents', 'Upload, téléchargement et gestion des documents')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-Auth', // Nom du schéma de sécurité référencé dans les @ApiBearerAuth()
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      // Persister l'autorisation Bearer entre les rechargements de page
      persistAuthorization: true,
    },
  });

  // ── Démarrage ────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '8005', 10);
  await app.listen(port);

  logger.log(`🚀 Document Service démarré sur le port ${port}`);
  logger.log(`📚 Swagger UI disponible sur http://localhost:${port}/api/docs`);
  logger.log(`🌍 Environnement: ${process.env.NODE_ENV ?? 'development'}`);
}

// Gestion des rejets de promesses non capturés
// Évite que l'application plante silencieusement sur une erreur async
process.on('unhandledRejection', (reason: Error) => {
  new Logger('UnhandledRejection').error(
    `Promesse rejetée non gérée: ${reason?.message ?? reason}`,
    reason?.stack,
  );
});

bootstrap();
