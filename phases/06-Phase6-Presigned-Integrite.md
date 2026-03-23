# Phase 6 : URL Présignée & Vérification d'Intégrité (Backlogs Manquants)

## Résumé

Ces deux backlogs (`DOC-08` et `DOC-09`) étaient initialement mentionnés dans la Phase 1 côté collègue, mais leur logique métier complexe (cache Redis, recalcul SHA-256 en streaming) relève du **Document Service côté commission**. Ils n'avaient pas de phase dédiée — cette Phase 6 corrige cela.

## User Stories associées

* [`DOC-08`] **Générer URL présignée temporaire** : En tant que système, je veux générer une URL présignée MinIO (TTL configurable) afin de permettre le téléchargement direct sans double transit serveur.
* [`DOC-09`] **Vérifier intégrité d'un document** : En tant que système, je veux recalculer et comparer le hash SHA-256 d'un document stocké afin de détecter toute altération post-upload.

## Structure de Fichiers (src/)

```
src/
├── documents/
│   ├── documents.service.ts       # Implémentation de presignedUrl() + checkIntegrity()
│   ├── documents.controller.ts    # Routes GET /:id/download + GET /:id/integrity
│   └── documents.module.ts        # Imports StorageModule + CachingModule
├── storage/
│   └── storage.service.ts        # Méthode getPresignedUrl(path, ttl) via MinIO SDK
└── caching/
    └── caching.service.ts        # Méthodes get/set/del via Redis (ioredis)
```

## Tâches Techniques & Détails d'Implémentation

### 1. `CachingService` (Redis via ioredis)

*   Implémenter `get(key: string): Promise<string | null>`
*   Implémenter `set(key: string, value: string, ttlSeconds: number): Promise<void>`
*   Le prefix de clé sera `presignedUrl:{documentId}` pour les URL présignées.

### 2. `StorageService` (MinIO SDK)

*   Implémenter `getPresignedUrl(filePath: string, ttlSeconds: number): Promise<string>` via `presignedGetObject()`.
*   MinIO est configuré via les variables d'environnement : `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`.

### 3. `DocumentsService` — DOC-08 : `getPresignedUrl(documentId)`

1. Charger les métadonnées du document (`prisma.document.findUnique()`).
2. Vérifier le cache Redis : `presignedUrl:{documentId}`.
   - **HIT** → retourner l'URL directement.
   - **MISS** → générer une URL via MinIO SDK.
3. Stocker en cache Redis avec le TTL correspondant :
   - **30 min** pour les documents publics (CDC)
   - **5 min** pour les pièces administratives sensibles
4. Retourner `{ presignedUrl, expiresAt }`.

### 4. `DocumentsService` — DOC-09 : `checkIntegrity(documentId)`

1. Charger le document depuis la BDD (`hashSha256` + `fichierUrl`).
2. Télécharger le flux binaire du fichier depuis MinIO.
3. Recalculer le hash SHA-256 du flux en temps réel (Node.js `crypto`).
4. Comparer le hash recalculé avec celui stocké :
   - **Correspondance** → `{ documentId, integrityOk: true }`
   - **Altération détectée** → publier événement `document.integrity.failed` + retourner `{ documentId, integrityOk: false }`.

### 5. Contrôleur (`DocumentsController`)

*   `GET /documents/:id/download` → Appel `getPresignedUrl()`
*   `GET /documents/:id/integrity` → Appel `checkIntegrity()`

### 6. Tests Unitaires

*   **CachingService** : Mock ioredis, tester `get()`, `set()`, `del()`.
*   **StorageService** : Mock MinIO Client, tester `getPresignedUrl()`.
*   **DocumentsService** : Mock complet (PrismaService + StorageService + CachingService), tester les deux flux (cache HIT/MISS pour DOC-08, hash match/mismatch pour DOC-09).
*   **DocumentsController** : Mock DocumentsService, vérifier la délégation.
