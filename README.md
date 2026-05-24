# al-mizan-documents-service

> **Service de Gestion des Documents** — Upload sécurisé, stockage MinIO (S3), chiffrement PKI, OCR et validation des pièces administratives pour la plateforme Al-Mizan.

---

## Table des matières

1. [Aperçu](#aperçu)
2. [Technologies](#technologies)
3. [Architecture & Réseau](#architecture--réseau)
4. [Base de données](#base-de-données)
5. [Variables d'environnement](#variables-denvironnement)
6. [API REST](#api-rest)
7. [Messagerie RabbitMQ](#messagerie-rabbitmq)
8. [Commandes utiles](#commandes-utiles)
9. [Docker](#docker)

---

## Aperçu

`al-mizan-documents-service` est le service centralisé de gestion documentaire de la plateforme Al-Mizan. Il couvre :

- **Upload de fichiers** : validation du type MIME, déduplication par hash SHA-256, stockage sur MinIO (S3-compatible).
- **PKI / Chiffrement** : chiffrement des pièces sensibles via `node-forge`, gestion des enveloppes chiffrées.
- **Pièces administratives** : attachement de documents à une soumission (NIF, NIS, RC, CNAS, CASNOS, bilans...) avec validation.
- **OCR** : déclenchement automatique d'une analyse OCR via événement RabbitMQ (`document.ocr.requested`), consommation du résultat (`ocr.result.processed`).
- **Documents d'organisation** : upload des pièces lors de l'inscription (NIF, NIS, DENOMINATION), retour asynchrone via RabbitMQ vers `users-service`.
- **Rate Limiting** & **Helmet** pour la sécurité HTTP.

---

## Technologies

| Technologie         | Version  | Rôle                                             |
|---------------------|----------|--------------------------------------------------|
| Node.js             | 18 LTS   | Runtime                                          |
| TypeScript          | ^5.1     | Langage                                          |
| NestJS              | ^11.0    | Framework (modules, DI, guards, microservices)   |
| Prisma ORM          | ^5.21    | ORM + migrations MySQL                           |
| MySQL               | 8.x      | Base de données principale                       |
| MinIO (client SDK)  | ^8.0     | Stockage objet S3-compatible                     |
| Redis (ioredis)     | ^5.10    | Cache applicatif                                 |
| node-forge          | ^1.3     | PKI / Chiffrement RSA                            |
| multer              | ^2.1     | Gestion des uploads multipart                    |
| file-type           | ^16.5    | Détection MIME réelle (sécurité)                 |
| amqplib             | ^0.10    | Client RabbitMQ                                  |
| amqp-connection-manager | ^5.0 | Reconnexion automatique RabbitMQ               |
| @nestjs/throttler   | ^6.5     | Rate Limiting                                    |
| helmet              | ^8.1     | Sécurité HTTP (headers)                          |
| @nestjs/swagger     | ^11.2    | Documentation OpenAPI                            |
| express-rate-limit  | ^8.3     | Limitation de requêtes supplémentaire            |
| Jest                | ^29.5    | Tests unitaires & e2e                            |

---

## Architecture & Réseau

```
API Gateway (:3000) ──► documents-service (:8005)
                                │
                                ├── MySQL    (mysql:3306 → document_db)
                                ├── Redis    (redis:6379)
                                ├── MinIO    (minio:9000 — bucket: al-mizan-docs)
                                └── RabbitMQ (rabbitmq:5672)
```

- **Port exposé** : `8005`
- **Réseau Docker** : `al-mizan-network`
- **Nom du conteneur** : `documents-service`
- **Swagger UI** : `http://localhost:8005/api`

---

## Base de données

**Moteur** : MySQL 8 · **Schema** : `document_db`

### Modèles Prisma

#### `Document`
| Champ          | Type      | Description                                      |
|----------------|-----------|--------------------------------------------------|
| `id`           | String    | PK, UUID                                         |
| `ownerId`      | String    | ID du propriétaire (User ou Organisation)        |
| `ownerType`    | OwnerType | `USER` ou `ORGANISATION`                         |
| `nom`          | String    | Nom du fichier                                   |
| `typeMime`     | String    | Type MIME détecté                                |
| `tailleOctets` | BigInt?   | Taille en octets                                 |
| `fichierUrl`   | String    | Chemin de stockage MinIO                         |
| `hashSha256`   | String    | UNIQUE — déduplication                           |
| `createdAt`    | DateTime  | Date d'upload                                    |

#### `PieceAdministrative`
| Champ          | Type      | Description                                       |
|----------------|-----------|---------------------------------------------------|
| `id`           | String    | PK, UUID                                          |
| `soumissionId` | String    | ID de la soumission (réf. soumission-service)     |
| `documentId`   | String    | FK → Document                                     |
| `type`         | PieceType | NIF, NIS, RC, CNAS, CASNOS, ATTESTATION_FISCALE...|
| `designation`  | String?   | Libellé personnalisé                              |
| `isValide`     | Boolean?  | Résultat de validation OCR                        |
| `dateExpiration`| DateTime?| Date d'expiration (attestation fiscale, etc.)    |

#### `OcrAnalyse`
| Champ          | Type        | Description                              |
|----------------|-------------|------------------------------------------|
| `id`           | String      | PK, UUID                                 |
| `documentId`   | String      | FK → Document                            |
| `pieceId`      | String?     | FK → PieceAdministrative (optionnel)     |
| `typeAnalyse`  | TypeAnalyse | `OCR`, `NLP`, ou `COMPLETUDE`            |
| `texteExtrait` | String?     | Texte extrait par OCR                    |
| `scoreConfiance`| Decimal?   | Score de confiance (0.0000 à 1.0000)     |
| `isConforme`   | Boolean?    | Conformité du document                   |
| `anomalies`    | Json?       | Liste des anomalies détectées            |

---

## Variables d'environnement

```env
PORT=8005

# MySQL
DATABASE_URL=mysql://root:password@localhost:3306/document_db

# MinIO (S3-compatible)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=al-mizan-docs

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Redis
REDIS_URL=redis://localhost:6379
```

> ⚠️ En production (Docker), remplacer `localhost` par les noms de conteneurs : `mysql`, `minio`, `rabbitmq`, `redis`.

> ⚠️ `openssl` est requis sur Alpine (`apk add --no-cache openssl`) — inclus dans le Dockerfile.

---

## API REST

Base URL (via Gateway) : `http://localhost:3000/documents`  
Base URL (directe) : `http://localhost:8005`  
Swagger : `http://localhost:8005/api`

### Documents

| Méthode | Endpoint                        | Auth | Description                                         |
|---------|---------------------------------|------|-----------------------------------------------------|
| `POST`  | `/documents/upload`             | Oui  | Upload d'un document (multipart/form-data)          |
| `GET`   | `/documents/:id`                | Oui  | Récupérer les métadonnées d'un document             |
| `GET`   | `/documents/:id/download`       | Oui  | Télécharger un document depuis MinIO               |
| `DELETE`| `/documents/:id`                | Oui  | Supprimer un document                               |

### Pièces Administratives

| Méthode | Endpoint                            | Auth | Description                                          |
|---------|-------------------------------------|------|------------------------------------------------------|
| `POST`  | `/pieces-administratives`           | Oui  | Attacher un document à une soumission (par type)     |
| `GET`   | `/pieces-administratives/:soumissionId` | Oui | Lister les pièces d'une soumission               |
| `PATCH` | `/pieces-administratives/:id/valider`| Oui | Valider / rejeter une pièce administrative          |

### Documents d'organisation (inscription)

| Méthode | Endpoint                                 | Auth | Description                                        |
|---------|------------------------------------------|------|----------------------------------------------------|
| `POST`  | `/documents/organisation/:orgId/upload`  | Non  | Upload NIF, NIS, DENOMINATION pour une organisation|

### OCR & PKI

| Méthode | Endpoint                        | Auth | Description                             |
|---------|---------------------------------|------|-----------------------------------------|
| `GET`   | `/documents/:id/ocr`            | Oui  | Résultat de l'analyse OCR d'un document |
| `POST`  | `/pki/encrypt`                  | Oui  | Chiffrer un document (PKI)              |
| `POST`  | `/pki/decrypt`                  | Oui  | Déchiffrer un document (PKI)            |

#### Exemple `POST /documents/upload`

```
Content-Type: multipart/form-data
Authorization: Bearer <access_token>

file: <fichier binaire>
ownerType: "ORGANISATION"
ownerId: "uuid-org-xxx"
```

Réponse `201 Created` :
```json
{
  "id": "uuid-doc-xxx",
  "nom": "nif_document.pdf",
  "typeMime": "application/pdf",
  "tailleOctets": 245760,
  "hashSha256": "a3f5...",
  "fichierUrl": "al-mizan-docs/organisations/uuid-org-xxx/nif_document.pdf"
}
```

---

## Messagerie RabbitMQ

**Exchange** : `al-mizan.events` (type: `topic`, durable: `true`)

### Événements publiés

| Routing Key                                        | Déclencheur                              | Payload clés                                                  |
|----------------------------------------------------|------------------------------------------|---------------------------------------------------------------|
| `documentation.organisation.documents.uploaded`    | Upload réussi des docs d'organisation    | `organisation_id`, `uploaded_documents`, `status: success`    |
| `documentation.organisation.documents.failed`      | Échec upload docs d'organisation         | `organisation_id`, `failed_documents`, `status: failed`       |
| `document.uploaded`                                | Upload d'un document générique           | `documentId`, `hash`, `mimeType`, `entityType`, `entityId`    |
| `document.administrative.attached`                 | Pièce admin attachée à une soumission    | `documentId`, `submissionId`, `pieceType`, `ownerId`          |
| `document.ocr.requested`                           | Déclenchement OCR automatique            | `documentId`, `storagePath`, `mimeType`, `pieceType`          |
| `document.validated`                               | Validation/rejet d'une pièce            | `documentId`, `submissionId`, `isValid`, `rejectionReason`    |

### Événements consommés

| Routing Key                                        | Source           | Action réalisée                                  |
|----------------------------------------------------|------------------|--------------------------------------------------|
| `ocr.result.processed`                             | OCR Service      | Mise à jour `OcrAnalyse` avec résultats OCR      |
| `user.organisation.documents.upload.response`      | users-service    | ACK des références de documents traités          |
| `user.organisation.documents.uploaded`             | users-service    | Confirmation finale des uploads                  |
| `user.organisation.documents.upload.failed`        | users-service    | Log d'échec de traitement par users-service      |

#### Flux d'upload lors de l'inscription :

```
auth-service ──[user.registered]──► users-service
                                        │
                                        └── [tâche asynchrone]──► documents-service
                                                                          │
                                                           [documentation.organisation.documents.uploaded]
                                                                          │
                                                                    users-service
                                                           [user.organisation.documents.upload.response]
```

---

## Commandes utiles

### Développement local

```bash
npm install --legacy-peer-deps
npm run start:dev       # Hot-reload NestJS
npm run build           # Compilation TypeScript
npm run start:prod      # Production
```

### Base de données

```bash
npx prisma db push          # Appliquer le schéma
npm run prisma:generate     # Générer le client Prisma
npm run prisma:migrate      # Créer une migration versionnée
npm run db:seed             # Seeder les données initiales
npm run prisma:studio       # Interface graphique Prisma
```

### Tests

```bash
npm test                # Tests unitaires
npm run test:e2e        # Tests end-to-end
npm run test:cov        # Couverture de code
```

---

## Docker

### Build de l'image

```bash
docker build -t al-mizan-documents-service .
```

### Notes importantes sur le Dockerfile

- Image de base : `node:18-alpine`
- **`openssl` installé explicitement** (`apk add --no-cache openssl`) car Prisma sur Alpine le nécessite (`libssl.so.1.1`).
- L'install des dépendances utilise `--legacy-peer-deps` pour la compatibilité.
- Au démarrage : `npx prisma db push && node dist/main`

### Déploiement via docker-compose

```bash
docker-compose up -d documents-service
docker-compose logs -f documents-service
```

---

*Maintenu par l'équipe Al-Mizan — voir `al-mizan-deployments` pour la configuration de déploiement complète.*
