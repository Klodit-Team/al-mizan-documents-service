

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';


@Catch()
export class MinioExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MinioExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur de stockage interne';

    // ── Mapper les codes d'erreur MinIO ──────────────────────
    // exception.code contient le code d'erreur MinIO
    // exception.message contient le message descriptif

    if (exception.code === 'NoSuchKey') {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Fichier introuvable dans le stockage (MinIO)';
    } else if (exception.code === 'NoSuchBucket') {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Bucket MinIO non configuré ou inaccessible';
      this.logger.error(
        `Erreur de configuration MinIO: bucket inexistant — vérifiez MINIO_BUCKET_NAME`,
      );
    } else if (
      exception.code === 'AccessDenied' ||
      exception.code === 'SignatureDoesNotMatch' ||
      exception.code === 'InvalidAccessKeyId'
    ) {
      statusCode = HttpStatus.FORBIDDEN;
      message =
        'Accès MinIO refusé — identifiants invalides ou permissions insuffisantes';
      this.logger.error(
        `Erreur d'authentification MinIO: ${exception.code} — vérifiez les credentials`,
      );
    } else if (
      exception.code === 'EntityTooLarge' ||
      exception.code === 'RequestEntityTooLarge'
    ) {
      statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Fichier trop volumineux pour le stockage';
    } else {
      // Erreur MinIO non mappée mais identificable
      this.logger.error(
        `Erreur MinIO unmapped: ${exception.code || exception.name} — ${exception.message}`,
        exception.stack,
      );
    }

    // ── Répondre avec un format cohérent ─────────────────────
    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      // En production, ne pas exposer les détails techniques
      ...(process.env.NODE_ENV !== 'production' && {
        errorCode: exception.code || exception.name,
        details: exception.message,
      }),
    });
  }
}
