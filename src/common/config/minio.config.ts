// =========================================================
// src/common/config/minio.config.ts
//
// Centralise la lecture et la validation des variables
// d'environnement MinIO. En isolant ça ici, si une variable
// manque on a une erreur claire AU DÉMARRAGE, pas au moment
// du premier upload (fail-fast).
// =========================================================

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
}

// Charger explicitement le fichier .env si présent. Ceci rend la
// configuration plus robuste lorsque l'application est lancée
// depuis des environnements où @nestjs/config n'aurait pas encore
// injecté les variables dans process.env au moment de l'instanciation.
// On utilise dotenv en fallback.
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Lit les variables d'environnement et retourne un objet typé.
 * Lance une erreur explicite si une variable obligatoire est absente.
 */
export function getMinioConfig(): MinioConfig {
  const required = [
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET_NAME',
  ];

  // Vérifier que toutes les variables obligatoires sont présentes
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(
        `[MinIO Config] Variable d'environnement manquante: ${key}. ` +
          `Vérifiez votre fichier .env`,
      );
    }
  }

  return {
    endpoint: process.env.MINIO_ENDPOINT!,
    // parseInt avec fallback à 9000 si MINIO_PORT non défini
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    // 'true' en string → true en boolean
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    bucketName: process.env.MINIO_BUCKET_NAME!,
  };
}

// TTL par défaut pour les URL présignées (en secondes)
// Configurable via PRESIGNED_URL_TTL_SECONDS dans .env
export const PRESIGNED_URL_TTL = parseInt(
  process.env.PRESIGNED_URL_TTL_SECONDS ?? '300', // 5 minutes par défaut
  10,
);

// Types MIME autorisés (validation en couche 2 — après les magic bytes)
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

// Extensions autorisées (validation de surface — couche 1)
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;

// Taille maximale upload en bytes (50 MB par défaut)
export const MAX_FILE_SIZE = parseInt(
  process.env.UPLOAD_MAX_FILE_SIZE ?? '52428800',
  10,
);
