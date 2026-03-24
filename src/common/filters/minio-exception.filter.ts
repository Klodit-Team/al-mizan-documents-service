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
    const err = exception as {
      code?: string;
      message?: string;
      name?: string;
      stack?: string;
    };
    const response = host.switchToHttp().getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur de stockage interne';

    // ── Mapper les codes d'erreur MinIO ──────────────────────
    // exception.code contient le code d'erreur MinIO
    // exception.message contient le message descriptif

    if (err.code === 'NoSuchKey') {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Fichier introuvable dans le stockage (MinIO)';
    } else if (err.code === 'NoSuchBucket') {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Bucket MinIO non configuré ou inaccessible';
      this.logger.error(
        `Erreur de configuration MinIO: bucket inexistant — vérifiez MINIO_BUCKET_NAME`,
      );
    } else if (
      err.code === 'AccessDenied' ||
      err.code === 'SignatureDoesNotMatch' ||
      err.code === 'InvalidAccessKeyId'
    ) {
      statusCode = HttpStatus.FORBIDDEN;
      message =
        'Accès MinIO refusé — identifiants invalides ou permissions insuffisantes';
      this.logger.error(
        `Erreur d'authentification MinIO: ${err.code} — vérifiez les credentials`,
      );
    } else if (
      err.code === 'EntityTooLarge' ||
      err.code === 'RequestEntityTooLarge'
    ) {
      statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Fichier trop volumineux pour le stockage';
    } else {
      // Erreur MinIO non mappée mais identificable
      this.logger.error(
        `Erreur MinIO unmapped: ${err.code || err.name} — ${err.message}`,
        err.stack,
      );
    }

    // ── Répondre avec un format cohérent ─────────────────────
    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      // En production, ne pas exposer les détails techniques
      ...(process.env.NODE_ENV !== 'production' && {
        errorCode: err.code || err.name,
        details: err.message,
      }),
    });
  }
}
