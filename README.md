# Al-Mizan — Microservice Documents (`document-service`)

> **Plateforme Intelligente et Souveraine de Gestion des Marchés Publics**
> Équipe KLODIT · Projet 2CSSIL 2025–2026 · Version 1.0

---

## Table des Matières

1. [Présentation](#1-présentation)
2. [Stack Technologique](#2-stack-technologique)
3. [Architecture Interne](#3-architecture-interne)
4. [Schéma de Base de Données](#4-schéma-de-base-de-données)
5. [Backlog Priorisé](#5-backlog-priorisé)
6. [Processus Métier](#6-processus-métier)
7. [Événements RabbitMQ](#7-événements-rabbitmq)
8. [Matrice de Conformité Réglementaire](#8-matrice-de-conformité-réglementaire)
9. [RBAC — Contrôle d'Accès](#9-rbac--contrôle-daccès)
10. [API Endpoints](#10-api-endpoints)
11. [Sécurité](#11-sécurité)
12. [Tests & Qualité](#12-tests--qualité)
13. [Déploiement](#13-déploiement)
14. [Estimation de Charge (CAPEX M6)](#14-estimation-de-charge-capex-m6)

---

## 1. Présentation

Le **Document Service** est le microservice n°5 de la plateforme Al-Mizan. Il est
responsable de la **gestion complète du cycle de vie des fichiers** : upload sécurisé,
stockage souverain MinIO, vérification d'intégrité, jonction des pièces
administratives aux soumissions, validation par la commission, et orchestration du
pipeline OCR/NLP asynchrone.

| Attribut             | Valeur                              |
|----------------------|-------------------------------------|
| **Port**             | `8005`                              |
| **Base de données**  | `document_db` (PostgreSQL 16, isolée) |
| **Stockage objet**   | MinIO souverain (S3-compatible)     |
| **Messaging**        | RabbitMQ (producer + consumer)      |
| **Framework**        | NestJS (TypeScript)                 |
| **Documentation API**| Swagger UI — `/api/docs`            |

### Périmètre fonctionnel

- Upload de documents avec calcul automatique du hash **SHA-256**
- Stockage objet souverain via **MinIO** (aucun cloud étranger — Loi 18-07 Art. 44)
- Génération d'**URL présignées** temporaires pour téléchargement direct
- Gestion des **pièces administratives** (NIF, NIS, RC, Casier judiciaire, CNAS,
  CASNOS, Attestation fiscale, Bilan) liées aux soumissions
- **Validation manuelle** des pièces par la commission (conformité, date d'expiration)
- Vérification de l'**intégrité** des documents (recalcul SHA-256)
- Vérification des **certificats de signature électronique** (PKI/OCSP)
- Consommation et stockage des **résultats OCR/NLP** produits par l'IA Service (8011)
- Publication d'**événements RabbitMQ** vers Audit, Notification et IA Services

---

## 2. Stack Technologique

```
┌──────────────────────────────────────────────────────────────────┐
│              DOCUMENT SERVICE — Stack Complète                   │
├──────────────────────────────────────────────────────────────────┤
│  Framework          NestJS (TypeScript)          Port: 8005      │
│  ORM                Prisma ORM + PostgreSQL 16                   │
│  Validation         class-validator + class-transformer          │
│  Documentation API  @nestjs/swagger (OpenAPI 3.0)                │
├──────────────────────────────────────────────────────────────────┤
│  Stockage           MinIO SDK (@minio/minio-js)                  │
│  Upload             Multer (streaming, sans buffer mémoire)      │
│  Hashing            Node.js crypto native (SHA-256)              │
│  PKI / Certs        node-forge + OCSP                            │
├──────────────────────────────────────────────────────────────────┤
│  Messaging          @nestjs/microservices + amqplib (RabbitMQ)   │
│  Cache              ioredis (URL présignées TTL 30 min)          │
├──────────────────────────────────────────────────────────────────┤
│  Sécurité           Helmet, CORS, express-rate-limit             │
│                     file-type (validation magic bytes)           │
│                     HashiCorp Vault SDK (chiffrement PII)        │
├──────────────────────────────────────────────────────────────────┤
│  Tests              Jest (unitaires ≥ 80%) + Supertest           │
│  CI/CD              Jenkins + Docker multi-stage                 │
│  Linting            ESLint + Prettier                            │
└──────────────────────────────────────────────────────────────────┘
```

### Justification du choix NestJS

| Critère                             | NestJS ✅        | Django    | Laravel   |
|-------------------------------------|-----------------|-----------|-----------|
| Streaming upload fichiers (MinIO)   | Natif (Multer)  | Lourd     | Correct   |
| I/O non-bloquant (async/await)      | Natif (Node.js) | Threads   | Correct   |
| Intégration RabbitMQ                | `@nestjs/microservices` natif | Celery séparé | Queue |
| TypeScript (type-safety)            | ✅ Full          | ❌         | ❌         |
| Cohérence écosystème (Next.js front)| ✅               | ❌         | ❌         |
| MinIO SDK mature                    | `@minio/minio-js` | `minio` Python | Basique |
| Swagger auto-généré                 | `@nestjs/swagger`| `drf-spectacular` | `l5-swagger` |
| ORM type-safe avec migrations       | Prisma (type-safe, migrations auto) | Django ORM | Eloquent |
| Performance upload/download         | Très haute (streams) | Moyenne | Moyenne |

---

## 3. Architecture Interne

```
                    ┌─────────────────────────────────────────┐
                    │           API GATEWAY (Redis session)   │
                    │   Validation session · RBAC · Rate limit│
                    └────────────────┬────────────────────────┘
                                     │ HTTP (port 8005)
                    ┌────────────────▼────────────────────────┐
                    │         DOCUMENT SERVICE                 │
                    │                                          │
                    │  ┌──────────────────────────────────┐   │
                    │  │  Middleware (Input Validation)    │   │
                    │  │  class-validator · MIME check     │   │
                    │  │  file-type (magic bytes)          │   │
                    │  └──────────────┬───────────────────┘   │
                    │                 │                        │
                    │  ┌──────────────▼───────────────────┐   │
                    │  │  Controllers (REST /api/v1/...)   │   │
                    │  │  Swagger annotations · DTO        │   │
                    │  └──────────────┬───────────────────┘   │
                    │                 │                        │
                    │  ┌──────────────▼───────────────────┐   │
                    │  │  Service Layer (Business Logic)  │   │
                    │  │  Upload · Validation · OCR mgmt  │   │
                    │  │  Hash · Presigned URL · PKI      │   │
                    │  └──┬───────────────────┬───────────┘   │
                    │     │                   │                │
                    │  ┌──▼──────────┐  ┌────▼─────────────┐  │
                    │  │  Repository │  │ Event Publisher  │  │
                    │  │  (Prisma)   │  │ (RabbitMQ)       │  │
                    │  └──┬──────────┘  └────┬─────────────┘  │
                    │     │                   │                │
                    └─────┼───────────────────┼────────────────┘
                          │                   │
               ┌──────────▼──────┐   ┌────────▼────────────────┐
               │  PostgreSQL     │   │  RabbitMQ Exchange       │
               │  document_db    │   │  documents.exchange      │
               └─────────────────┘   └─────────────────────────┘
                          │
               ┌──────────▼──────┐
               │  MinIO          │
               │  (Stockage S3)  │
               └─────────────────┘
```

**Couches internes :**
- **Middleware** : Validation MIME réelle (magic bytes), taille max, structure DTO
- **Controllers** : Points d'entrée HTTP, Swagger, délégation au Service Layer
- **Service Layer** : Logique métier (upload, hash, validation, URL présignées, PKI)
- **Repository Layer** : Accès données via Prisma Client (type-safe), migrations gérées par `prisma migrate`
- **Event Publisher/Consumer** : Communication asynchrone via RabbitMQ

---

## 4. Schéma de Base de Données

### 4.1 Service Documents (`document_db`)

> Schéma officiel issu de la Figure 4.7 du CSL KLODIT v1.0
> Géré via **Prisma ORM** — fichier source : `prisma/schema.prisma`

#### Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────
// Enum types
// ─────────────────────────────────────────────────────────────

enum OwnerType {
  USER
  ORGANISATION
}

enum PieceType {
  NIF
  NIS
  REGISTRE_COMMERCE
  CASIER_JUDICIAIRE
  CNAS
  CASNOS
  ATTESTATION_FISCALE
  BILAN
  AUTRE
}

enum TypeAnalyse {
  OCR
  NLP
  COMPLETUDE
}

// ─────────────────────────────────────────────────────────────
// Model: Document
// Stocke les métadonnées de chaque fichier uploadé
// Le fichier physique est dans MinIO (fichierUrl = chemin objet)
// ─────────────────────────────────────────────────────────────
model Document {
  id            String    @id @default(uuid()) @db.Uuid
  ownerId       String    @db.Uuid                        // userId ou organisationId
  ownerType     OwnerType
  nom           String    @db.VarChar(255)                // nom lisible du fichier
  typeMime      String    @db.VarChar(100)                // ex: application/pdf
  tailleOctets  BigInt?
  fichierUrl    String    @db.VarChar(500)                // chemin MinIO
  hashSha256    String    @unique @db.VarChar(64)         // intégrité SHA-256
  createdAt     DateTime  @default(now())

  piecesAdministratives PieceAdministrative[]
  ocrAnalyses           OcrAnalyse[]

  @@index([ownerId, ownerType])
  @@map("documents")
}

// ─────────────────────────────────────────────────────────────
// Model: PieceAdministrative
// Pièces justificatives liées à une soumission OE
// ─────────────────────────────────────────────────────────────
model PieceAdministrative {
  id             String    @id @default(uuid()) @db.Uuid
  soumissionId   String    @db.Uuid                      // référence vers Soumission Service
  documentId     String    @db.Uuid
  type           PieceType
  designation    String?   @db.VarChar(255)              // libellé libre complémentaire
  isValide       Boolean?                                // null = non encore validée
  dateExpiration DateTime?                               // date d'expiration de la pièce
  createdAt      DateTime  @default(now())

  document    Document     @relation(fields: [documentId], references: [id])
  ocrAnalyses OcrAnalyse[]

  @@index([soumissionId])
  @@index([type])
  @@map("pieces_administratives")
}

// ─────────────────────────────────────────────────────────────
// Model: OcrAnalyse
// Résultats d'analyse OCR/NLP produits par l'IA Service (8011)
// ─────────────────────────────────────────────────────────────
model OcrAnalyse {
  id              String       @id @default(uuid()) @db.Uuid
  documentId      String       @db.Uuid
  pieceId         String?      @db.Uuid
  typeAnalyse     TypeAnalyse
  texteExtrait    String?      @db.Text                  // texte OCR extrait
  scoreConfiance  Decimal?     @db.Decimal(5, 4)         // 0.0000 à 1.0000
  isConforme      Boolean?
  anomalies       Json?                                  // tableau JSON des anomalies
  analysedAt      DateTime     @default(now())

  document Document            @relation(fields: [documentId], references: [id])
  piece    PieceAdministrative? @relation(fields: [pieceId], references: [id])

  @@index([documentId])
  @@index([pieceId])
  @@map("ocr_analyses")
}
```

#### Commandes Prisma

```bash
# Générer le client Prisma après modification du schéma
npx prisma generate

# Créer et appliquer une migration
npx prisma migrate dev --name init

# Appliquer les migrations en production
npx prisma migrate deploy

# Visualiser la BDD
npx prisma studio
```

---

## 5. Backlog Priorisé

> Phase M6 — Sprints S6 à S11 | 36 j/h | 167 000 DZD

| # | ID | Fonctionnalité | Acteur(s) | User Story | Priorité |
|---|-----|----------------|-----------|-----------|---------|
| 1 | `DOC-01` | **Upload document sécurisé** | Tous | En tant qu'utilisateur, je veux uploader un document avec calcul automatique du hash SHA-256 afin de le stocker de manière sécurisée sur MinIO. | 🔴 **Haute** |
| 2 | `DOC-02` | **Consulter / Télécharger un document** | Tous | En tant qu'utilisateur, je veux consulter ou télécharger un document via URL présignée MinIO afin d'accéder à son contenu sans exposer le stockage direct. | 🔴 **Haute** |
| 3 | `DOC-03` | **Joindre les pièces administratives** | Opérateur Économique | En tant qu'OE, je veux joindre mes pièces (NIF, NIS, RC, Casier, CNAS, CASNOS, Att. fiscale, Bilan) à ma soumission afin de justifier mon éligibilité. | 🔴 **Haute** |
| 4 | `DOC-04` | **Valider / Invalider une pièce** | SC / Commission | En tant que membre de commission, je veux valider ou invalider une pièce (conformité, date d'expiration) afin de statuer sur l'éligibilité. | 🔴 **Haute** |
| 5 | `DOC-05` | **Déclencher pipeline OCR/NLP** | Système | En tant que système, je veux publier un événement après upload afin que l'IA Service (8011) analyse la conformité de la pièce. | 🟡 **Moyenne** |
| 6 | `DOC-06` | **Consulter résultats OCR** | SC / Commission | En tant que membre de commission, je veux consulter le score de confiance, la conformité et les anomalies OCR afin de prendre une décision éclairée. | 🟡 **Moyenne** |
| 7 | `DOC-07` | **Vérifier certificats PKI** | Système | En tant que système, je veux vérifier automatiquement la validité des certificats de signature (OCSP) sur les documents critiques (soumissions, PV). | 🔴 **Haute** |
| 8 | `DOC-08` | **Générer URL présignée temporaire** | Système | En tant que système, je veux générer une URL présignée MinIO (TTL configurable) afin de permettre le téléchargement direct sans double transit serveur. | 🔴 **Haute** |
| 9 | `DOC-09` | **Vérifier intégrité d'un document** | Système / Admin | En tant que système, je veux recalculer et comparer le hash SHA-256 d'un document stocké afin de détecter toute altération post-upload. | 🔴 **Haute** |
| 10 | `DOC-10` | **Lister les pièces d'une soumission** | SC / Commission | En tant que membre de commission, je veux consulter la liste complète des pièces d'une soumission avec statut de validation afin de préparer l'évaluation. | 🔴 **Haute** |

---

## 6. Processus Métier

### PM-01 — Upload & Stockage Sécurisé (`DOC-01`)

```
Acteur → POST /api/v1/documents/upload (multipart/form-data)
│
├─ [Middleware] Validation MIME réelle (magic bytes via file-type)
├─ [Middleware] Vérification taille max (configurable, ex: 50 MB)
├─ [Middleware] Validation DTO (entityType, entityId, nom)
│
├─ [Service] Streaming upload vers MinIO
│            Bucket: al-mizan-docs
│            Path: /{entity_type}/{entity_id}/{uuid}.{ext}
│
├─ [Service] Calcul hash SHA-256 (stream pipeline, sans buffer complet)
│
├─ [Repository] INSERT INTO documents {...}
│
├─ [EventPublisher] → documents.exchange :: document.uploaded
│                    payload: {documentId, hash, mimeType, size, uploadedBy, entityType, entityId}
│
└─ Réponse 201: {id, hash_sha256, fichier_url, created_at}
```

### PM-02 — Jonction Pièces Administratives (`DOC-03`)

```
OE → POST /api/v1/documents/administrative/{submissionId}
│
├─ [RBAC] Vérification rôle: OPERATEUR_ECONOMIQUE
├─ [Service] Vérification ownership: la soumission appartient à l'OE
├─ [Service] Vérification délai de dépôt (appel REST → Soumission Service 8004)
│            Si délai dépassé → 422 Unprocessable Entity
│
├─ [Repository] INSERT INTO pieces_administratives
│               {soumission_id, document_id, type, designation, date_expiration}
│
├─ [EventPublisher] → documents.exchange :: document.administrative.attached
│                    payload: {documentId, submissionId, pieceType, ownerId}
│
├─ [EventPublisher] → documents.exchange :: document.ocr.requested
│                    payload: {documentId, storagePath, mimeType, pieceType, submissionId}
│
└─ Réponse 201: {pieceId, status: "PENDING", ocrTrigger: true}
```

### PM-03 — Validation Manuelle par la Commission (`DOC-04`)

```
Membre Commission → PATCH /api/v1/documents/administrative/{pieceId}/validate
│
├─ [RBAC] Vérification rôle: COMMISSION_OUVERTURE | EVALUATEUR | SERVICE_CONTRACTANT
├─ [Service] Vérification date_expiration de la pièce (si expirée → forcer INVALID)
│
├─ [Repository] UPDATE pieces_administratives
│               SET is_valide = true|false, validated_by, validated_at, rejection_reason
│
├─ [EventPublisher] → documents.exchange :: document.validated
│                    payload: {documentId, submissionId, isValid, validatedBy, reason}
│
├─ [EventPublisher] → audit via document.validated (consommé par Audit Service 8009)
│
└─ Réponse 200: {pieceId, is_valide, validated_at}
```

### PM-04 — Réception Résultats OCR/NLP (`DOC-05`, `DOC-06`)

```
[Consumer RabbitMQ] queue: documents.ocr.results
│
├─ payload: {documentId, pieceId, typeAnalyse, texteExtrait, scoreConfiance,
│            isConforme, anomalies[]}
│
├─ [Repository] INSERT INTO ocr_analyses {...}
│
├─ Si anomalie critique détectée:
│  └─ [EventPublisher] → notification.alert.send (Notification Service 8010)
│
└─ Mise à jour de la pièce: is_valide peut être suggéré par l'IA mais reste
   soumis à validation humaine finale (Art. 73 Loi 23-12)
```

### PM-05 — Téléchargement Sécurisé via URL Présignée (`DOC-02`, `DOC-08`)

```
Acteur → GET /api/v1/documents/{id}/download
│
├─ [RBAC] Vérification ownership OU permissions publiques (CDC = PUBLIC)
├─ [Service] Vérification que le document existe (404 sinon)
│
├─ [Redis] Lookup cache: presignedUrl:{documentId}
│   ├─ HIT: retourner directement l'URL (TTL restant)
│   └─ MISS: générer nouvelle URL présignée MinIO
│            TTL: 30 min pour CDC / 5 min pour pièces sensibles
│            SET cache avec TTL correspondant
│
├─ [EventPublisher] → documents.exchange :: document.downloaded
│                    payload: {documentId, downloadedBy, timestamp}
│                    (consommé par Audit Service 8009)
│
└─ Réponse 200: {presignedUrl, expiresAt}
```

### PM-06 — Vérification Intégrité (`DOC-09`)

```
[Job périodique / Trigger manuel] → GET /api/v1/documents/{id}/integrity
│
├─ [Service] Téléchargement stream depuis MinIO
├─ [Service] Recalcul SHA-256 en stream
├─ [Repository] Comparaison avec hash_sha256 stocké
│
├─ Si hash différent:
│  ├─ [EventPublisher] → documents.exchange :: document.integrity.failed
│  │                     payload: {documentId, expectedHash, actualHash}
│  └─ Alerte CRITIQUE vers Admin (via Notification Service)
│
└─ Réponse 200: {documentId, integrityOk: true|false, checkedAt}
```

### PM-07 — Vérification Certificat PKI (`DOC-07`)

```
[Déclenché à la validation définitive d'une soumission ou génération PV]
→ POST /api/v1/documents/{id}/verify-certificate
│
├─ [Service] Extraction signature électronique (node-forge)
├─ [Service] Appel OCSP / vérification CRL
│
├─ [Repository] INSERT INTO certificate_verifications
│               {documentId, isValid, issuer, subject, notBefore, notAfter, isRevoked}
│
└─ Réponse 200: {isValid, issuer, subject, notAfter, isRevoked}
```

---

## 7. Événements RabbitMQ

> Exchange principal : `documents.exchange` (type: `topic`)

### Événements PUBLIÉS (Producer)

| Routing Key | Déclencheur | Payload | Consommateurs |
|-------------|-------------|---------|---------------|
| `document.uploaded` | Upload réussi | `{documentId, hash, mimeType, size, uploadedBy, entityType, entityId}` | Audit Service (8009), IA OCR (8011) |
| `document.administrative.attached` | Pièce jointe à soumission | `{documentId, submissionId, pieceType, ownerId}` | IA OCR (8011), Notification (8010) |
| `document.ocr.requested` | Auto-déclenché après attachment | `{documentId, storagePath, mimeType, pieceType, submissionId}` | IA OCR/NLP Service (8011) |
| `document.validated` | Validation/invalidation pièce | `{documentId, submissionId, isValid, validatedBy, rejectionReason}` | Notification (8010), Audit (8009), Soumission (8004) |
| `document.downloaded` | Téléchargement d'un document | `{documentId, downloadedBy, timestamp}` | Audit Service (8009) |
| `document.integrity.failed` | Altération détectée | `{documentId, expectedHash, actualHash, detectedBy}` | Audit (8009), Notification Admin (8010) |

### Événements CONSOMMÉS (Consumer)

| Queue | Source | Payload | Action locale |
|-------|--------|---------|---------------|
| `documents.ocr.results` | IA OCR Service (8011) | `{documentId, pieceId, typeAnalyse, texteExtrait, scoreConfiance, isConforme, anomalies[]}` | `INSERT INTO ocr_analyses` ; alerte si anomalie critique |
| `documents.submission.context` | Soumission Service (8004) | `{submissionId, aoId, deadline, status}` | Enrichir le contexte de validation des pièces |

---

## 8. Matrice de Conformité Réglementaire

> **Clause critique** : Toute modification fonctionnelle du service Documents doit être
> re-vérifiée contre cette matrice avant déploiement en production.

### Loi n°23-12 (Marchés Publics)

| Réf. | Exigence Légale | Implémentation Document Service | Impact | Statut |
|------|----------------|----------------------------------|--------|--------|
| **Art. 56** | Contenu obligatoire du dossier candidature (RC, NIF, CNAS, CASNOS, Casier judiciaire) | Enum `type` dans `pieces_administratives` couvrant tous les types requis ; validation exhaustivité avant soumission définitive | 🔴 BLOQUANT | À implémenter |
| **Art. 56** | Vérification OCR automatique des pièces | Publication `document.ocr.requested` → IA Service 8011 ; stockage résultats dans `ocr_analyses` | 🔴 BLOQUANT | À implémenter |
| **Art. 57** | Séparation offre technique / offre financière | `owner_type` + gestion via Soumission Service ; accès conditionnel aux documents financiers | 🔴 BLOQUANT | À coordonner avec Soumission Service |
| **Art. 59** | Horodatage certifié des dépôts | `created_at` serveur sur Upload ; intégré à `soumissions.horodatage_serveur` dans Soumission Service | 🔴 BLOQUANT | Délégué à Soumission Service |
| **Art. 73** | Vérification conformité administrative par IA (OCR + NLP) | Champ `is_conforme`, `score_confiance`, `anomalies` dans `ocr_analyses` ; exposition via `GET /administrative/{id}/ocr` | 🔴 BLOQUANT | À implémenter |
| **Art. 7** | Journalisation inaltérable de toutes les opérations | Chaque action publie un événement consommé par Audit Service (SHA-256 chaîné) | 🟠 OBLIGATOIRE | À implémenter |
| **Art. 42** | Export PDF avis BOMOP | Documents PDF des avis stockés dans MinIO et gérés via ce service | 🟡 Haute | À coordonner avec AO Service |
| **Art. 71** | PV d'ouverture horodaté | URL du PV dans `seances_ouverture.pv_url` ; fichier dans MinIO | 🟠 OBLIGATOIRE | À coordonner avec Commission Service |
| **Art. 78** | Notification attribution provisoire | Déclenché par événements consommés | Haute | Via Notification Service |

### Loi n°18-07 (Protection des Données Personnelles)

| Réf. | Exigence Légale | Implémentation | Impact |
|------|----------------|----------------|--------|
| **Art. 38** | Sécurité des données au repos et en transit | AES-256 via HashiCorp Vault pour les PII ; TLS 1.3 obligatoire sur tous les endpoints | 🔴 BLOQUANT |
| **Art. 44** | Hébergement exclusif sur territoire algérien | Stockage MinIO souverain On-Premise ; aucune donnée vers cloud étranger | 🔴 BLOQUANT |
| **Art. 12** | Droit à l'effacement (droit à l'oubli) | Cron job d'anonymisation des documents après expiration des délais légaux de conservation | 🟡 Haute |
| **Art. 7** | Consentement préalable au traitement | Géré par User Service lors de l'inscription ; Document Service respecte les restrictions | Normale |

### OWASP Top 10 (2021)

| Risque OWASP | Contrôle implémenté |
|-------------|---------------------|
| **A01 Broken Access Control** | RBAC via session Gateway ; vérification ownership sur chaque document ; accès public uniquement sur CDC publiés |
| **A03 Injection** | Prisma Client (requêtes paramétrées, aucun SQL brut) ; class-validator sur tous les DTOs |
| **A04 Insecure Design** | Validation magic bytes (file-type) en plus du MIME déclaré ; MinIO bucket isolé |
| **A05 Security Misconfiguration** | Helmet (headers HTTP) ; CORS strict ; TLS 1.3 only |
| **A07 Auth Failures** | Authentification déléguée au Gateway ; sessions Redis côté serveur |
| **A08 Data Integrity Failures** | Hash SHA-256 sur chaque fichier ; vérification PKI sur documents critiques |
| **A10 SSRF** | Aucun téléchargement depuis URL externe ; MinIO uniquement interne ; URLs présignées générées côté serveur |

---

## 9. RBAC — Contrôle d'Accès

| Endpoint | ADMIN | SERVICE_CONTRACTANT | OPERATEUR_ECONOMIQUE | COMMISSION | CONTROLEUR | PUBLIC |
|----------|:-----:|:-------------------:|:--------------------:|:----------:|:----------:|:------:|
| `POST /documents/upload` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `GET /documents/{id}` | ✅ | ✅ (si lié à ses AO) | ✅ (ses propres docs) | ✅ | ✅ | CDC uniquement |
| `GET /documents/{id}/download` | ✅ | ✅ | ✅ (ses docs) | ✅ | ✅ | CDC publiés |
| `POST /documents/administrative/{subId}` | ✅ | ❌ | ✅ (ses soumissions) | ❌ | ❌ | ❌ |
| `GET /documents/administrative/{subId}` | ✅ | ✅ | ✅ (ses soumissions) | ✅ | ✅ | ❌ |
| `PATCH /documents/administrative/{id}/validate` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `GET /documents/{id}/ocr` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `GET /documents/{id}/integrity` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `POST /documents/{id}/verify-certificate` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## 10. API Endpoints

> Base URL : `http://document-service:8005/api/v1`
> Documentation Swagger : `/api/docs`

### Documents

```
POST   /documents/upload                          Upload d'un document (multipart)
GET    /documents/:id                             Métadonnées d'un document
GET    /documents/:id/download                    URL présignée pour téléchargement
GET    /documents/:id/integrity                   Vérification intégrité SHA-256
POST   /documents/:id/verify-certificate          Vérification certificat PKI
DELETE /documents/:id                             Suppression logique (soft delete)
```

### Pièces Administratives

```
POST   /documents/administrative/:submissionId    Joindre une pièce à une soumission
GET    /documents/administrative/:submissionId    Lister les pièces d'une soumission
GET    /documents/administrative/piece/:pieceId   Détail d'une pièce
PATCH  /documents/administrative/piece/:pieceId/validate   Valider/invalider une pièce
```

### Analyses OCR

```
GET    /documents/:id/ocr                         Résultats OCR d'un document
GET    /documents/administrative/piece/:pieceId/ocr   Résultats OCR d'une pièce
```

### Health

```
GET    /health                                    Health check (liveness)
GET    /health/ready                              Readiness check (PostgreSQL + MinIO + RabbitMQ)
```

---

## 11. Sécurité

### Sécurité des fichiers uploadés

```typescript
// Validation en 3 couches
// 1. Extension autorisée
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

// 2. MIME type déclaré (Content-Type header)
// 3. Magic bytes réels via file-type (protection contre spoofing)
import { fileTypeFromStream } from 'file-type';
// Ex: un .pdf renommé en .jpg sera rejeté
```

### Chiffrement

| Donnée | Mécanisme | Notes |
|--------|-----------|-------|
| PII au repos | AES-256 via HashiCorp Vault Transit Engine | `nom`, `owner_id` si PII |
| Transport | TLS 1.3 obligatoire | TLS 1.0/1.1 désactivés |
| Inter-services K8s | mTLS (Mutual TLS) | Network Policies Kubernetes |
| Hash fichier | SHA-256 (Node.js crypto) | Intégrité uniquement, pas chiffrement |

### URL Présignées MinIO

```
TTL par type de document:
  - Cahier des Charges (CDC) public   : 30 min  (cache Redis)
  - Pièces administratives            : 5 min   (pas de cache)
  - Offres techniques                 : 5 min   (COMMISSION only)
  - PV d'ouverture                    : 15 min  (après séance)
```

---

## 12. Tests & Qualité

### Couverture cible : ≥ 80% (lignes backend)

| Type | Outil | Périmètre | Seuil |
|------|-------|-----------|-------|
| Unitaires | Jest | Service Layer, hashing, validation MIME, URL présignée | ≥ 80% |
| Intégration | Jest + Supertest | Upload → MinIO → BDD → Événement | ≥ 80% |
| E2E | Playwright | Flux OE: upload pièce → validation commission → résultat OCR | Scénarios critiques |
| Charge | Gatling | 5 000 uploads simultanés (pic fin de délai) | 0% erreurs 5xx, P95 < 3s |
| Sécurité | OWASP ZAP | Injection, upload malveillant, SSRF, auth bypass | 0 vulnérabilité critique |

### Scénarios de tests d'intégration prioritaires

```
1. Upload PDF valide → hash calculé → stocké MinIO → événement publié → audit log créé
2. Upload fichier MIME spoofé (.exe renommé .pdf) → rejeté 422
3. OE joint pièce NIF → OCR déclenché → résultats stockés → commission consulte score
4. Commission invalide pièce → notification OE → statut mis à jour
5. Vérification intégrité → hash tampered → alerte critique levée
6. Téléchargement CDC public sans auth → URL présignée (30 min) retournée
7. Téléchargement pièce sensible par unauthorized user → 403 Forbidden
```

### Critères d'acceptation Service Documents

| Critère | Seuil attendu |
|---------|--------------|
| Couverture code | ≥ 80% lignes |
| Bugs critiques | 0 |
| Vulnérabilités OWASP critiques/hautes | 0 |
| Précision OCR (IA Service) | ≥ 90% |
| Latence upload P95 | < 3s |
| Disponibilité | ≥ 99,5% |
| Intégrité SHA-256 | 100% vérifiable |

---

## 13. Déploiement

### Docker Compose (DEV)

```yaml
services:
  document-service:
    build: .
    ports:
      - "8005:8005"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres-document:5432/document_db
      MINIO_ENDPOINT: minio:9000
      RABBITMQ_URL: amqp://rabbitmq:5672
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres-document
      - minio
      - rabbitmq
      - redis

  postgres-document:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: document_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - doc-postgres-data:/var/lib/postgresql/data

volumes:
  doc-postgres-data:
```

### Kubernetes (PROD) — Namespace `core`

```yaml
# Ressources minimales
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "512Mi"

# Auto-scaling
hpa:
  minReplicas: 2
  maxReplicas: 8
  targetCPUUtilizationPercentage: 70
```

### Pipeline CI/CD (Jenkins)

```
push feature/* → Lint (ESLint) → Tests unitaires (Jest, ≥80% cov)
             → Build Docker (multi-stage) → Tests intégration
             → Push Harbor On-Premise → Deploy STAGING (auto)
             → Tests E2E (Playwright) → [Manuel] Deploy PROD
```

---

## 14. État d'Avancement

### Backlog Réalisé (Suivi DEV)

| Statut | ID | Fonctionnalité | Acteur(s) | User Story | Priorité |
|:---:|-----|----------------|-----------|-----------|---------|
| [ ] | `DOC-01` | **Upload document sécurisé** | Tous | En tant qu'utilisateur, je veux uploader un document avec calcul automatique du hash SHA-256 afin de le stocker de manière sécurisée sur MinIO. | 🔴 **Haute** |
| [ ] | `DOC-02` | **Consulter / Télécharger un document** | Tous | En tant qu'utilisateur, je veux consulter ou télécharger un document via URL présignée MinIO afin d'accéder à son contenu sans exposer le stockage direct. | 🔴 **Haute** |
| [x] | `DOC-03` | **Joindre les pièces administratives** | Opérateur Économique | En tant qu'OE, je veux joindre mes pièces (NIF, NIS, RC, Casier...) à ma soumission afin de justifier mon éligibilité. | 🔴 **Haute** |
| [x] | `DOC-04` | **Valider / Invalider une pièce** | SC / Commission | En tant que membre de commission, je veux valider ou invalider une pièce (conformité, date d'expiration) afin de statuer sur l'éligibilité. | 🔴 **Haute** |
| [x] | `DOC-05` | **Déclencher pipeline OCR/NLP** | Système | En tant que système, je veux publier un événement après upload afin que l'IA Service (8011) analyse la conformité de la pièce. | 🟡 **Moyenne** |
| [x] | `DOC-06` | **Consulter résultats OCR** | SC / Commission | En tant que membre de commission, je veux consulter le score de confiance, la conformité et les anomalies OCR afin de prendre une décision éclairée. | 🟡 **Moyenne** |
| [x] | `DOC-07` | **Vérifier certificats PKI** | Système | En tant que système, je veux vérifier automatiquement la validité des certificats de signature (OCSP) sur les documents critiques. | 🔴 **Haute** |
| [x] | `DOC-08` | **Générer URL présignée temporaire** | Système | En tant que système, je veux générer une URL présignée MinIO (TTL configurable) afin de permettre le téléchargement direct. | 🔴 **Haute** |
| [x] | `DOC-09` | **Vérifier intégrité d'un document** | Système / Admin | En tant que système, je veux recalculer et comparer le hash SHA-256 d'un document stocké afin de détecter toute altération. | 🔴 **Haute** |
| [x] | `DOC-10` | **Lister les pièces d'une soumission** | SC / Commission | En tant que membre de commission, je veux consulter la liste complète des pièces d'une soumission afin de préparer l'évaluation. | 🔴 **Haute** |

### Détails des Tests Unitaires (DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10)

La stratégie de test mise en place couvre **46 tests unitaires** répartis sur **14 suites**, toutes passant à 100% au green avec `npm run test`. L'approche isole chaque couche via un double mocking complet (NestJS `TestingModule` + `jest.fn()`).

*   **Tests de conformité de l'API (Contrôleurs) :**
    *   Toutes les routes (`attachPiece`, `getPiecesBySubmission`, `validatePiece`, `verifyCertificate`, `download`, `integrity`) délèguent vers le service mock et transmettent les DTOs et Params intacts.

*   **Tests Métier et Juridiques (Services) :**
    *   **Anti-Fraude et Doublon (DOC-03)** : `NotFoundException` si le document physique `documentId` est absent ; `ConflictException` si le même type de pièce a déjà été déposé.
    *   **Contrôle Automatique Art. 73 (DOC-04)** : Les timestamps sont construits dynamiquement (**zéro hardcoding**). Le système force `isValide: false` si la pièce est expirée, même si la commission a demandé `true`.
    *   **Souveraineté des Données (DOC-10)** : Certifie que Prisma exécute `include: { document: true }` pour récupérer les URL MinIO.
    *   **PKI & Cryptographie (DOC-07)** : Valide les 3 chemins métier : `NotFoundException`, `BadRequestException` (non-PDF / pas de PAdES), et succès avec structure `{ isValid, issuer, subject, notBefore, notAfter, isRevoked }`.
    *   **URL Présignée (DOC-08)** : Test du cache Redis HIT (retour direct sans appel MinIO) et MISS (génération + mise en cache avec bon TTL). Vérifie également `NotFoundException` si document absent.
    *   **Intégrité SHA-256 (DOC-09)** : Test du recalcul en streaming via un `Readable` factice. Certifie que `integrityOk: true` si les hashs correspondent, `integrityOk: false` + publication d'événement d'alerte `SYSTEM` si altération détectée.

*   **Tests de la couche Messaging RabbitMQ (DOC-05, DOC-06) :**
    *   **`DocumentEventPublisher`** : Vérifie l'émission correcte des 4 événements métier. Atteste la conversion sécurisée `BigInt → String` pour la taille des fichiers.
    *   **`OcrResultConsumer`** : La persistance des résultats OCR et la résilience en cas de panne BDD sont validées.

*   **Tests d'Infrastructure (Storage & Cache) :**
    *   **`StorageService`** : Mock MinIO SDK complet — vérifie `presignedGetObject()` et `getObject()` avec le bon bucket et les bons paramètres.
    *   **`CachingService`** : Mock `ioredis` via `jest.mock()` — vérifie `get()`, `set()` avec `EX TTL`, et `del()`.

---

## Références

- Loi n°23-12 du 5 août 2023 — Règles générales relatives aux marchés publics
- Loi n°18-07 du 10 juin 2018 — Protection des personnes physiques dans le traitement des données
- OWASP Top 10 (2021)
- CSL Al-Mizan v1.0 — Équipe KLODIT — Année universitaire 2025–2026
- OpenAPI 3.0 Specification
- AsyncAPI 2.0 Specification (contrats événements RabbitMQ)

---

*Document Service — Al-Mizan Platform · Port 8005 · document_db · MinIO Souverain*
