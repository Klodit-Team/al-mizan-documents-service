# Phase 2 : Pièces Administratives & URL Présignées (S7-S8)

## Résumé
Associer les documents bruts (uploadés plus tôt) à la structuration métier des appels d'offres : les "Pièces Administratives". Nous mettons en œuvre un téléchargement sécurisé via liens éphémères générés par le SDK MinIO et couplés à Redis, afin de ne pas engorger notre bande passante Gateway avec des gros fichiers.

## User Stories associées
* [`DOC-03`] **Joindre les pièces administratives** : En tant qu'OE, je veux joindre mes pièces (NIF, NIS...).
* [`DOC-02`] **Consulter / Télécharger un document** : ... via URL présignée MinIO ...
* [`DOC-08`] **Générer URL présignée temporaire** : ... (TTL configurable) ...
* [`DOC-09`] **Vérifier intégrité d'un document** : ... recalculer hash SHA-256 post-upload.

## Structure de Fichiers à Créer (src/)
```
src/
├── common/
│   └── caching/
│       ├── redis.module.ts              # Instanciation de ioredis
│       └── redis.service.ts             # Service générique SET / GET
├── documents/
│   └── administrative-pieces/
│       ├── administrative-pieces.module.ts
│       ├── administrative-pieces.controller.ts  # Endpoints dédiés aux pièces
│       ├── administrative-pieces.service.ts     # Logique de création/attachement
│       └── dto/
│           └── attach-piece.dto.ts      # DTO: { documentId, type, designation }
└── [...existant]
```

## Tâches Techniques & Détails d'Implémentation :

### 1. Redis Module (`src/common/caching/`)
*   Installer et configurer le module Redis (ex: avec `ioredis` ou `@nestjs/cache-manager`).
*   Créer les méthodes wrapper `async setWithTTL(key: string, value: string, ttlSeconds: number)` et `async get(key: string)`. Ne pas oublier de gérer les erreurs de connexion Redis pour permettre une tolérance de pannes (graceful fallback).

### 2. Génération des URL Présignées (`GET /api/v1/documents/:id/download`)
*   **Contrôleur** (`DocumentsController`) :
    * Accepter `id` comme UUID.
*   **Service** (`DocumentsService` + `StorageService`) :
    1. Récupérer le `Document` depuis Prisma. (Erreur 404 si introuvable).
    2. Interroger Redis avec la clé : `presignedUrl:${documentId}`.
        *   Si trouvé (HIT) => Renvoyer directement la valeur URL.
        *   Si introuvable (MISS) => Appeler `minioClient.presignedGetObject(bucketName, document.fichierUrl, expiryInSeconds)`.
    3. Définir une variable globale config pour `expiryInSeconds` (ex: 300s = 5 minutes pour pièces sensibles).
    4. Enregistrer dans Redis cette URL générée avec comme limite mémoire ce même temps d'expiration `expiryInSeconds`.
    5. Retourner l'URL structurée dans un JSON : `{ "url": "...", "expiresAt": <timestamp> }`.

### 3. Attachement de Pièces Administratives (`POST /api/v1/documents/administrative/:submissionId`)
*   **Contrôleur** (`AdministrativePiecesController`) : 
    * URL Param: `submissionId` (Id externe vers le microservice Soumission).
    * Body DTO (`AttachPieceDto`) : `documentId` (requis, UUID), `type` (requis, Enum `PieceType`), `designation` (optionnel), `dateExpiration` (optionnel).
*   **Service** :
    1. Vérifier si un enregistrement existant de la même pièce existe déjà pour ce `submissionId`. Si la pièce de type "NIF" est déjà jointe, que faire ? (Remplacer ou refuser ? Le code doit s'aligner au métier, généralement : on refuse un doublon).
    2. Appeler Prisma `this.prisma.pieceAdministrative.create({ data: { documentId, soumissionId, type, ... } })`.
    3. Retourner l'enregistrement fraîchement rattaché.

### 4. Job de Vérification Logique de Hash (`GET /api/v1/documents/:id/integrity`)
*   *(Ce endpoint n'est accessible qu'aux RBAC "SYSTEM" ou "ADMIN" : il peut s'agir d'un trigger asynchrone manuel).*
*   **Service** :
    1. Charger `hashSha256` existant en base.
    2. Streamer le fichier ciblé via `minioClient.getObject(bucket, fileUrl)`.
    3. Le wrapper dynamiquement via Node.js dans `crypto.createHash('sha256')`.
    4. Obtenir le résultat sous chaine hexadécimale, et appeler une fonction `boolean (result == expected)`.
    5. *(Bonus)* Logguer une trace rouge brique ou alerter l'admin dans la DB / Terminal si altération détectée.
