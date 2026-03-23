import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10),
      useSSL:
        this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>(
        'MINIO_ACCESS_KEY',
        'minioadmin',
      ),
      secretKey: this.configService.get<string>(
        'MINIO_SECRET_KEY',
        'minioadmin',
      ),
    });
    this.bucket = this.configService.get<string>(
      'MINIO_BUCKET',
      'al-mizan-docs',
    );
  }

  /**
   * Génère une URL présignée MinIO pour téléchargement direct (DOC-08)
   * @param objectPath Chemin de l'objet dans le bucket (ex: submissions/uuid/file.pdf)
   * @param ttlSeconds Durée de validité en secondes (ex: 30*60 = 30 min)
   */
  async getPresignedUrl(
    objectPath: string,
    ttlSeconds: number,
  ): Promise<string> {
    this.logger.log(
      `Generating presigned URL for ${objectPath} (TTL: ${ttlSeconds}s)`,
    );
    return this.minioClient.presignedGetObject(
      this.bucket,
      objectPath,
      ttlSeconds,
    );
  }

  /**
   * Retourne un stream de lecture depuis MinIO pour le recalcul SHA-256 (DOC-09)
   */
  async getObjectStream(objectPath: string): Promise<NodeJS.ReadableStream> {
    this.logger.log(
      `Fetching object stream for integrity check: ${objectPath}`,
    );
    return this.minioClient.getObject(this.bucket, objectPath);
  }
}
