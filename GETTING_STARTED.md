# 📚 al-mizan-documents-service

Service de gestion des documents pour la plateforme **Al-Mizan**. Construit avec **NestJS**, **PostgreSQL**, **MinIO** (S3-compatible), **Redis**, et sécurisé par validation en 3 couches.

---

## 🎯 Objectif

Fournir une API robuste pour :
- ✅ Upload sécurisé de documents (PDF, JPG, PNG)
- ✅ Stockage dans MinIO (object storage)
- ✅ Génération d'URL présignées pour téléchargement direct
- ✅ Cache Redis des URLs (5 min TTL par défaut)
- ✅ Anti-doublon via SHA-256 + unique constraint
- ✅ Métadonnées complètes en PostgreSQL

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      NestJS API (Port 8005)             │
├─────────────────────────────────────────┤
│  DocumentsController                    │
│  ├─ POST   /api/v1/documents/upload     │
│  ├─ GET    /api/v1/documents/:id        │
│  └─ GET    /api/v1/documents/:id/download │
├─────────────────────────────────────────┤
│  DocumentsService                       │
│  ├─ Validation SHA-256                  │
│  ├─ Orchestration MinIO/PostgreSQL      │
│  └─ Cache Redis (TTL)                   │
├─────────────────────────────────────────┤
│  Infrastructure Layer                   │
│  ├─ StorageService (MinIO wrapper)      │
│  ├─ PrismaService (PostgreSQL ORM)      │
│  └─ RedisModule (Cache via ioredis)     │
└─────────────────────────────────────────┘
```

---

## 🚀 Démarrage Rapide

### Option 1 : Docker Compose (Recommandé)

```bash
# Cloner et installer
git clone <repo>
cd al-mizan-documents-service
npm install

# Démarrer l'infrastructure (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Attendre ~10 secondes que MinIO soit prêt

# Générer les types Prisma
npm run prisma:generate

# Exécuter les migrations
npm run prisma:migrate

# Lancer le service en développement
npm run start:dev
```

**Accès** :
- API : http://localhost:8005
- Swagger UI : http://localhost:8005/api/docs
- MinIO Console : http://localhost:9001 (admin: minioadmin / minioadmin)

### Option 2 : Infrastructure Manuelle

```bash
# PostgreSQL 16
docker run -d --name postgres \
  -e POSTGRES_DB=document_db \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16

# Redis 7
docker run -d --name redis \
  -p 6379:6379 \
  redis:7

# MinIO
docker run -d --name minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 -p 9001:9001 \
  minio/minio:latest server /data --console-address ":9001"

# Puis :
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

---

## 📋 Variables d'Environnement

Créer un fichier `.env` (déjà fourni) :

```properties
# Application
PORT=8005
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=document_db
DB_USER=postgres
DB_PASSWORD=password
DATABASE_URL="postgresql://postgres:password@localhost:5432/document_db"

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=al-mizan-docs

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# URLs Présignées (TTL en secondes)
PRESIGNED_URL_TTL_SECONDS=300

# Upload (taille max = 50 MB)
UPLOAD_MAX_FILE_SIZE=52428800
```

---

## 📚 Endpoints API

### 1. Upload Document
```http
POST /api/v1/documents/upload

Content-Type: multipart/form-data

file: <PDF, JPG, PNG - max 50 MB>
ownerId: 550e8400-e29b-41d4-a716-446655440000
ownerType: USER
```

**Response (201 Created)**
```json
{
  "id": "3f2504e0-4f89-41d3-9a0c-0305e8f7f789",
  "nom": "mon-document.pdf",
  "typeMime": "application/pdf",
  "tailleOctets": 102400,
  "hashSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "fichierUrl": "USER/550e8400.../3f2504e0-mon-document.pdf",
  "createdAt": "2026-03-23T00:00:00Z"
}
```

**Erreurs**
- `400` : DTO invalide
- `409` : Doublon (même fichier déjà uploadé)
- `422` : Fichier invalide (extension, type MIME, taille)

---

### 2. Récupérer Métadonnées
```http
GET /api/v1/documents/3f2504e0-4f89-41d3-9a0c-0305e8f7f789
```

**Response (200 OK)**
```json
{
  "id": "3f2504e0-4f89-41d3-9a0c-0305e8f7f789",
  "ownerId": "550e8400-e29b-41d4-a716-446655440000",
  "ownerType": "USER",
  "nom": "mon-document.pdf",
  "typeMime": "application/pdf",
  "tailleOctets": 102400,
  "hashSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "createdAt": "2026-03-23T00:00:00Z"
}
```

**Erreurs**
- `404` : Document non trouvé

---

### 3. Générer URL Présignée
```http
GET /api/v1/documents/3f2504e0-4f89-41d3-9a0c-0305e8f7f789/download
```

**Response (200 OK)**
```json
{
  "url": "http://minio:9000/al-mizan-docs/USER/550e8400.../3f2504e0-mon-document.pdf?X-Amz-Signature=...",
  "expiresAt": 1700000300,
  "ttlSeconds": 300,
  "fromCache": false
}
```

**Cache Redis**
- Premier appel : URL générée, mise en cache (300s)
- Appels suivants : URL depuis cache (`fromCache: true`)
- Si Redis down : URL générée directement (graceful degradation)

**Erreurs**
- `404` : Document non trouvé

---

## 🔐 Sécurité

### Validation Fichiers (3 couches)

```
COUCHE 1 → Extension (.pdf, .jpg, .jpeg, .png)
  ↓
COUCHE 2 → Magic bytes réels (file-type package)
  ↓
COUCHE 3 → Taille < 50 MB
  ↓
✅ Accepté | ❌ 422 Unprocessable Entity
```

### Anti-Doublon
```
SHA-256(file.buffer) → Recherche @unique en DB
Si trouvé → 409 Conflict
```

### Chemin MinIO Sécurisé
```
Format: {OWNER_TYPE}/{ownerId}/{uuid}-{sanitized-name}
- Pas de path traversal
- Caractères spéciaux supprimés
- Longueur max 150 chars
```

### Rollback Transactionnel
```
Upload MinIO → Succès
  ↓
Insert PostgreSQL → Échoue
  ↓
Rollback MinIO (deleteObject)
  ↓
Erreur retournée au client
```

---

## 📊 Schéma Données

### Document (documents table)
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownerId UUID NOT NULL,
  ownerType ENUM('USER', 'ORGANISATION') NOT NULL,
  nom VARCHAR(255) NOT NULL,
  typeMime VARCHAR(100) NOT NULL,
  tailleOctets BIGINT,
  fichierUrl VARCHAR(500) NOT NULL,
  hashSha256 VARCHAR(64) UNIQUE NOT NULL,
  createdAt TIMESTAMP DEFAULT now(),
  INDEX (ownerId, ownerType)
);
```

### Relations
```
Document
├─ PieceAdministrative[] (1-to-many)
│  └─ type: NIF, NIS, REGISTRE_COMMERCE, etc.
│  └─ designaton, isValide, dateExpiration
│
└─ OcrAnalyse[] (1-to-many)
   ├─ typeAnalyse: OCR, NLP, COMPLETUDE
   ├─ texteExtrait, scoreConfiance
   └─ anomalies (JSON)
```

---

## 🧪 Tests

### Jest + Supertest

```bash
# Tests unitaires
npm run test

# Tests avec coverage
npm run test:cov

# Tests E2E
npm run test:e2e

# Watch mode
npm run test:watch
```

---

## 📝 Commandes

```bash
# Développement
npm run start:dev      # Hot-reload

# Production
npm run build          # Compiler TypeScript
npm run start:prod     # Lancer dist/main.js

# Prisma
npm run prisma:generate    # Générer types
npm run prisma:migrate     # Exécuter migrations
npm run prisma:studio      # UI Prisma

# Linting
npm run lint           # ESLint check
npm run format         # Prettier format
```

---

## 🐛 Troubleshooting

### "MinIO is not reachable"
```bash
# Vérifier que MinIO est lancé
docker ps | grep minio

# Vérifier la santé
curl http://localhost:9000/minio/health/live

# Redémarrer
docker-compose restart minio
docker-compose logs minio
```

### "PostgreSQL connection failed"
```bash
# Vérifier que PostgreSQL est lancé
docker ps | grep postgres

# Tester la connexion
psql -h localhost -U postgres -d document_db

# Vérifier la migration
npm run prisma:migrate
```

### "Redis connection failed"
```bash
# Vérifier que Redis est lancé
docker ps | grep redis

# Tester la connexion
redis-cli ping
```

### "Bucket not found" à la création
```bash
# Redémarrer MinIO pour créer le bucket
docker-compose restart minio
sleep 15

# Ou créer manuellement le bucket
mc alias set minio http://localhost:9000 minioadmin minioadmin
mc mb minio/al-mizan-docs --ignore-existing
```

---

## 📈 Performance

### Optimisations implémentées

- ✅ **Cache Redis** : URLs présignées cachées 5 min
- ✅ **Index Prisma** : (ownerId, ownerType) + unique sur hashSha256
- ✅ **Streaming MinIO** : Buffer → stream pour les uploads
- ✅ **Graceful Degradation** : Redis down ne bloque pas l'app
- ✅ **Connection Pooling** : Prisma 9 connexions par défaut

### Benchmarks estimés

- Upload 50 MB : ~2-3 secondes (réseau + MinIO)
- Génération URL présignée : ~50 ms (cache hit ~5 ms)
- Métadonnées document : ~10 ms (DB index)

---

## 🔄 CI/CD

### Jenkinsfile fourni
```groovy
pipeline {
  stages {
    Build { npm run build }
    Test  { npm run test:cov }
    Push  { docker push registry/al-mizan-documents:latest }
    Deploy { helm upgrade ... }
  }
}
```

---

## 📄 Documentation

- **API Swagger** : http://localhost:8005/api/docs
- **Full Report** : Voir `ANALYSIS_REPORT.md`
- **Phases** : Voir dossier `phases/`

---

## 👥 Support

Pour toute question : [support@klodit.com](mailto:support@klodit.com)

---

**Status** : ✅ Production Ready (avec infrastructure)
