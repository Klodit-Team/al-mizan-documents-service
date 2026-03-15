# Phase 1 : Configuration et Stockage de Base (S6)

Cette phase est critique, car le Document Service gère le stockage centralisé des pièces. Sans cette étape, le blocage est absolu.

## Résumé
Pendant cette phase, nous allons configurer l'upload via **Multer**, l'interface avec le stockage objet **MinIO**, et le calcul sécurisé du Hash **SHA-256** au vol permettant par la suite le stockage des métadonnées dans la DB locale PostgreSQL.

## User Stories associées
* [`DOC-01`] **Upload document sécurisé** : En tant qu'utilisateur, je veux uploader un document avec calcul automatique du hash SHA-256 afin de le stocker de manière sécurisée sur MinIO.

## Structure de Fichiers à Créer (src/)
```
src/
├── common/
│   ├── config/minio.config.ts        # Configuration du client MinIO
│   ├── filters/                      # Filtres d'exceptions personnalisés (ex: MinioException)
│   └── pipes/                        # Pipes de validation (ex: FileValidationPipe)
├── storage/
│   ├── storage.module.ts             # Module dédié aux interactions S3/MinIO
│   └── storage.service.ts            # Wrapper autour de @minio/minio-js
├── documents/
│   ├── documents.module.ts           # Module principal des documents
│   ├── documents.controller.ts       # Points d'entrée HTTP (Upload, Download)
│   ├── documents.service.ts          # Logique métier: appel Storage, Prisma, Hashing
│   └── dto/
│       └── upload-document.dto.ts    # { ownerId, ownerType }
└── prisma/
    ├── prisma.module.ts              # Module global d'accès à la BDD
    └── prisma.service.ts             # Extension de PrismaClient
```

## Tâches Techniques & Détails d'Implémentation :

### 1. Module Prisma (`src/prisma`)
*   Exécuter `npx nest g module prisma` et `npx nest g service prisma`.
*   Dans `prisma.service.ts`, étendre `PrismaClient` et implémenter `OnModuleInit` pour gérer la connexion à Postgres. Le définir en module Global (`@Global()`) pour qu'il soit accessible partout sans l'importer systématiquement.

### 2. Module Storage (MinIO) (`src/storage`)
*   Créer le module et le service S3.
*   Dans le service, initier le client de la librairie `@minio/minio-js` dans le constructeur à l'aide des variables d'environnement (`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, etc.).
*   Créer une méthode `uploadStream(bucketName: string, objectName: string, stream: stream.Readable)` qui utilise `minioClient.putObject`.
*   Assurez-vous de créer le bucket (ex: `al-mizan-docs`) au démarrage du service si celui-ci n'existe pas via `minioClient.bucketExists` et `minioClient.makeBucket`.

### 3. Middleware de Sécurité & Validation `FileValidator`
*   Dans les contrôleurs, nous n'utiliserons pas de MemoryStorage pour `Multer` afin de ne pas exploser la RAM du serveur. Utiliser un stream upload ou limiter drastiquement la mémoire si le fichier passe temporairement en mémoire tampon.
*   Créer un pipe ou intercepteur métier qui prend le header du fichier, et utilise le package `file-type` pour lire les Magic Bytes (les 4100 premiers octets) afin de vérifier l'extension **réelle** du fichier, et rejeter (HTTP 422) s'il y a spoofing malveillant de l'extension.

### 4. Logique de Hachage SHA-256 (`src/documents/documents.service.ts`)
*   Le stream de fichier Node.js doit être pipé dans un processus Crypto.
*   Utiliser `crypto.createHash('sha256')`. Soit vous lisez le stream pour construire le bloc sur MinIO et vous l'injectez en parallèle dans l'instance de crypto, soit vous utilisez un `PassThrough` stream qui va à la fois vers MinIO et vers le hasher.
*   *Note*: Pour des raisons de facilité, et parce que Multer peut écrire les fichiers localement sur disque temporaire dans un container Docker avant l'envoi, vous pouvez lire le buffer créé temp, le hacher via `Stream`, l'envoyer sur MinIO, puis l'effacer localement (`fs.unlink`).

### 5. `POST /api/v1/documents/upload`
*   **Contrôleur** : `update(@Req() req, @UploadedFile() file, @Body() uploadDto: UploadDocumentDto)`
*   **DTO** : Valide que `ownerId` est un UUID et `ownerType` est un Enum valide.
*   **Service** :
    1. Calcule le Hash SHA-256 du fichier physique.
    2. Check si le hash existe dèjà (`hashSha256` est `@unique` dans Prisma). Si oui, lever une erreur ou l'ignorer selon le métier.
    3. Upload du fichier vers MinIO sous un format : `/{ownerType}/{ownerId}/{uuid}-{file.originalname}`.
    4. Enregistrement dans PostgreSQL en appelant PrismaService `this.prisma.document.create(...)`.
    5. *(La partie Event RabbitMQ sera implémentée en Phase 4)*.
    6. Retourner un DTO représentant le fichier (`id`, `hash`, `url`).
