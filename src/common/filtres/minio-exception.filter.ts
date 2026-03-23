// =========================================================
// src/common/filters/minio-exception.filter.ts
//
// Filtre d'exceptions personnalisé pour les erreurs MinIO.
//
// Sans ce filtre, une erreur de connexion MinIO remonte comme
// une erreur 500 générique sans contexte.
// Avec ce filtre, on intercepte les erreurs MinIO spécifiques
// et on retourne un message clair et structuré.
//
// Exemples d'erreurs MinIO capturées :
//  - NoSuchBucket : Le bucket n'existe pas
//  - NoSuchKey    : Le fichier n'existe pas dans MinIO
//  - InvalidAccessKeyId : Mauvaise clé d'accès
//  - AccessDenied : Permissions insuffisantes
// =========================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

// Interface pour typer les erreurs MinIO
// Le SDK MinIO retourne des erreurs avec ces propriétés
interface MinioError extends Error {
  code?: string;    // Ex: 'NoSuchKey', 'NoSuchBucket'
  resource?: string; // La ressource concernée
}

@Catch()
export class MinioExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MinioExceptionFilter.name);

  catch(exception: MinioError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Mapper les codes d'erreur MinIO vers des statuts HTTP appropriés
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur de stockage interne';

    if (exception.code) {
      switch (exception.code) {
        case 'NoSuchKey':
          // Le fichier demandé n'existe pas dans MinIO
          status = HttpStatus.NOT_FOUND;
          message = `Fichier introuvable dans le stockage: ${exception.resource ?? 'inconnu'}`;
          break;

        case 'NoSuchBucket':
          // Le bucket n'existe pas — erreur de configuration
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Bucket de stockage non configuré. Contactez l\'administrateur.';
          this.logger.error(`Bucket MinIO inexistant: ${exception.resource}`);
          break;

        case 'AccessDenied':
          // Permissions insuffisantes — erreur de configuration
          status = HttpStatus.FORBIDDEN;
          message = 'Accès au stockage refusé. Vérifiez les permissions MinIO.';
          this.logger.error('Erreur de permission MinIO — vérifier les credentials');
          break;

        case 'InvalidAccessKeyId':
        case 'SignatureDoesNotMatch':
          // Mauvaises credentials MinIO — erreur de configuration
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Configuration de stockage invalide.';
          this.logger.error('Credentials MinIO invalides');
          break;

        default:
          // Erreur MinIO inconnue — logger pour investigation
          this.logger.error(
            `Erreur MinIO non gérée [${exception.code}]: ${exception.message}`,
          );
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: 'Storage Error',
      timestamp: new Date().toISOString(),
    });
  }
}
