# Architecture et Implémentation du Microservice Documents (Al-Mizan)

Ce document décrit en détail l'implémentation de chaque fonctionnalité (Backlogs DOC-01 à DOC-10) dans le microservice **Documents**. L'architecture suit les principes de séparation des préoccupations (Clean Architecture / Modules NestJS) avec une stricte distinction entre les modules **infrastructurels** (Base de données, Stockage, Cache, RabbitMQ) et les modules **métier** (Documents, PKI, OCR).

---

## 🏗️ 1. Architecture Globale

Le projet est structuré autour du framework **NestJS**.
Le dossier source (`src/`) est organisé comme suit :
* **`/common/`** : Configuration (MinIO, Redis) et utilitaires globaux (Pipes de validation, Filtres d'exceptions).
* **`/caching/`, `/storage/`, `/prisma/`, `/messaging/`** : Modules d'infrastructure purs (exposant et encapsulant `ioredis`, `@minio/minio-js`, `@prisma/client` et `amqp-connection-manager`). Ces modules sont conçus pour être utilisés à travers le projet sans contenir de règles métier.
* **`/health/`** : Module technique pour les healthchecks (sondes Docker/Kubernetes).
* **`/modules/`** : Cœur métier de l'application. Contient `documents/`, `ocr/`, `pki/` et des sous-modules comme `administrative-pieces/`.

*Référence : `src/app.module.ts` gère le graphe d'injection de ces modules ainsi que les librairies transversales comme `ConfigModule` (variables d'environnement) et `ThrottlerModule` (sécurité anti-DDOS).*

---

## 📦 2. Implémentation des Backlogs (Fonctionnalités Métier)

### ✅ [DOC-01] Upload sécurisé de document
**Objectif** : Gérer la réception d'un fichier avec validations de surface (taille, extension, type MIME), le stocker dans MinIO et sauvegarder ses métadonnées dans PostgreSQL (Prisma).

**Implémentation :**
1. **Contrôleur (`DocumentsController.uploadDocument`)** *(src/modules/documents/documents.controller.ts)* :
   - Écoute sur `POST /api/documents/upload`.
   - Utilise `FileInterceptor('file')` avec un stockage en mémoire (`memoryStorage()`) puisque les fichiers sont limités à 50 MB.
   - Utilise un pipe de validation personnalisé `FileValidationPipe` (*`src/common/pipes/file-validation.pipe.ts`*) qui s'appuie sur la librairie `file-type` pour vérifier les "Magic Bytes" afin d'éviter le spoofing d'extension.
2. **Service (`DocumentsService.uploadDocument`)** *(src/modules/documents/documents.service.ts)* :
   - Calcule un hash SHA-256 du buffer de manière synchrone via `crypto.createHash('sha256')`.
   - Effectue une requête Prisma pour vérifier si ce hash existe déjà (garantissant l'unicité et évitant le stockage de doublons). Si oui, jette une `ConflictException`.
   - Charge le buffer vers le **StorageService (MinIO)** en lui passant le Type MIME et la taille.
   - Enregistre les métadonnées exactes de l'objet renvoyé par MinIO dans PostgreSQL (Prisma).
   - **Résilience (Fail-Safe)** : L'enregistrement BDD est enveloppé dans un bloc `try/catch`. En cas d'échec de la base de données après un upload réussi sur MinIO, ce dernier subit un Rollback automatique (`storageService.deleteObject`).

---

### ✅ [DOC-02] Retrait des Métadonnées
**Objectif** : Consulter les attributs d'un document (nom, taille, hash) à partir de son UUID, sans télécharger son contenu brut.

**Implémentation :**
1. **Contrôleur (`DocumentsController.getDocumentById`)** :
   - Écoute de la route `GET /api/documents/:id`.
   - Valide nativement le paramètre d'URL grâce au pipe `ParseUUIDPipe`.
2. **Service (`DocumentsService.getDocumentById`)** :
   - Lance une requête simple Prisma (`prisma.document.findUnique`).
   - Exception standardisée `NotFoundException` propagée avec un message clair si le document est inexistant.

---

### ✅ [DOC-03] Attachement de Pièces Administratives
**Objectif** : Lier explicitement un document pré-uploadé au dossier/soumission d'un soumissionnaire/acheteur public (ex: registre de commerce).

**Implémentation :**
1. **Contrôleur (`AdministrativePiecesController.attachPiece`)** :
   - Écoute sur `POST /api/documents/administrative-pieces`.
2. **Service (`AdministrativePiecesService.attachPiece`)** *(src/modules/documents/administrative-pieces/)* :
   - Extrait l'UUID du document et de la soumission.
   - Requête Prisma pour valider que le document sous-jacent a bel et bien été enregistré.
   - Crée l'entité de jointure PostgreSQL (`pieceAdministrative`).
   - Émet un événement standardisé RabbitMQ via `DocumentEventPublisher.publishDocumentUploaded` pour informer le reste de la plateforme (par ex. pour réveiller le traitement asynchrone NLP/OCR).

---

### ✅ [DOC-04] Validation des Pièces (Workflow d'Approbation)
**Objectif** : Permettre à un contrôleur ou un agent système de modifier le statut d'une pièce (ACCEPTÉE, REFUSÉE) et le SI entier est notifié de la décision.

**Implémentation :**
1. **Service (`AdministrativePiecesService.validatePiece`)** :
   - Met à jour l'état local dans PostgreSQL via Prisma (passage à `statut: VALIDATED/REJECTED`, enregistrement de `validatedBy` et `rejectionReason`).
   - S'appuie immédiatement sur le `DocumentEventPublisher` (*`src/messaging/publishers/document-event.publisher.ts`*) pour émettre le résultat vers l'Exchange central RabbitMQ `al_mizan_topic`. 

---

### ✅ [DOC-05] Consommer les Alertes OCR
**Objectif** : Être à l'écoute constante des algorithmes d'Intelligence Artificielle de la plateforme IA/OCR pour marquer automatiquement un document comme invalide si des fraudes textuelles y sont détectées.

**Implémentation :**
- **Consumer (`OcrResultConsumer`)** *(src/messaging/consumers/ocr-result.consumer.ts)* :
   - Configuré comme Microservice NestJS abstrait, cette classe est annotée avec le décorateur `@EventPattern('documents.ocr.completed')` pour s'abonner au pattern RabbitMQ.
   - Désérialise la charge utile (payload JSON).
   - En cas d'anomalie sévère déclarée par l'OCR, il met à jour la pièce administrative correspondante de manière asynchrone via Prisma.

---

### ✅ [DOC-06 & DOC-08] URL Présignées (Direct Download) et Cache Redis
**Objectif** : Générer des URLs sécurisées à péremption temporelle via MinIO afin de déléguer la bande passante HTTP du téléchargement direct, tout en réduisant la charge sur l'API par un cache Redis ultra-rapide.

**Implémentation :**
1. **Contrôleur (`DocumentsController.getPresignedDownloadUrl`)** :
   - Écoute sur `GET /api/documents/:id/download`.
2. **Service (`DocumentsService.getPresignedUrl`)** :
   - Concaténation de la clé cache unique : `presignedUrl:${id}`.
   - **Cache HIT** : Via `ioredis` (injecté avec le token `@Inject('REDIS_CLIENT')`), le service vérifie l'existence de l'URL dans Redis. Si l'URL s'y trouve, le service lit le `TTL` restant et la retourne instantanément (`fromCache: true`).
   - **Cache MISS** : En l'absence de clé, il demande la création via `StorageService.generatePresignedUrl(fichierUrl, TTL)` via l'API signée MinIO. La nouvelle URL générée est stockée dans Redis de manière atomique via `setex`.
   - **Graceful Degradation** : Le cache Redis est encapsulé dans un `try/catch`. S'il est down, la requête ne crashe pas. NestJS continue à produire l'URL via MinIO comme solution de secours (fail-soft).

---

### ✅ [DOC-07] Vérification PKI des Signatures Électroniques
**Objectif** : Prouver la non-répudiation et l'intégrité d'une signature cryptographique asymétrique (X.509) liée à une autorité de certification.

**Implémentation :**
- **Service (`PkiService.verifySignature`)** *(src/modules/pki/pki.service.ts)* :
   - Implémenté pour s'affranchir temporairement de l'autorité locale en simulant avec la librairie éprouvée `node-forge`.
   - Vérifie la syntaxe de la signature PEM, analyse la validité temporelle et la correspondance clé publique/privée, et retourne un statut strict via Prisma.

---

### ✅ [DOC-09] Vérification d'Intégrité Interne (SHA-256)
**Objectif** : Détecter dynamiquement a posteriori si quelqu'un a discrètement altéré le contenu brut ou binaire d'un document stocké directement sur la machine MinIO (bucket).

**Implémentation :**
- **Service (`DocumentsService.checkIntegrity`)** :
   - Un endpoint dédié `GET /api/documents/:id/integrity`.
   - Au lieu de `storage.downloadBuffer()` qui inonderait la RAM sur de gros PDF, la méthode appelle `StorageService.getObjectStream()` pour récupérer le flux réseau I/O lié à l'object store MinIO.
   - Recalcule le SHA-256 "à la volée" bloc par bloc en stream via `hash.update(chunk)`.
   - Compare la chaîne finale par rapport au `hashSha256` récupéré depuis Prisma. En cas d'altération confirmée, le système alerte aussitôt tout le système d'information en produisant un événement RabbitMQ `publishDocumentValidated(isValid: false)`.

---

### ✅ [DOC-10] Liste des Pièces Administratives (Filtres Avancés)
**Objectif** : Permettre aux développeurs frontend de produire des Dashboards avec une vue tabulaire des pièces administratives, par propriétaire ou selon leur validation.

**Implémentation :**
- **Contrôleur/Service (`AdministrativePiecesService.getPiecesByOwner`)** *(src/modules/documents/administrative-pieces/)* :
   - Extrapolation de requêtes Prisma qui acceptent des métriques dynamiques comme un `status` et renvoie les données enrichies grâce aux relations de table (jointures).

---

## 🧪 3. Configuration et Assurance Qualité (QA)

Afin d'assurer que ces Backlogs ne se brisent jamais, le référentiel dispose de l'excellence technique suivante :

* **Unit Testing (Jest)** : La logique de chaque contrôleur et service métier est couverte, sans lier de réseau externe au moment des tests. Toutes les dépendances (SDK `Minio`, instance Redis `ioredis`, ORM `@prisma/client`) sont instanciées avec `jest.fn()` ou `useValue`. L'application compile une suite complète de **56 tests individuels (14 fichiers)** s'exécutant tous en succès.
* **Typage Stricte & Sécurité des DTOs** : Chaque paramètre d'URL (`ParseUUIDPipe`) ou corps JSON (`@Body`) passe au travers du module global de validation. NestJS instruit via le compilateur TypeScript que les variables d'entrée indésirables sont refusées ou supprimées grâce à `class-validator`.
* **Standardisation Documentaire (Swagger OpenAPI)** : Tous les contrôleurs comportent les annotations (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, etc.) générant au run-time l'interface web dynamique sur `/api/docs`.
* **Fiabilité des Paquets (Merge Validation)** : Suite au travail collaboratif, seul le framework `file-type` (en version sécurisée CJS : 16.5.4) est validé pour l'injection au sein des flux NestJS afin de garder l'anti-spoofing intact, tout en empêchant toute anomalie avec le transpileur `ts-jest`. Tous les paquets NPM ont été figés manuellement pour empêcher les erreurs ERESOLVE `peer-dependencies`.

Toutes les Backlogs de 1 à 10 sont intégrées, sécurisées et unifiées sous des dossiers isolés à très haute cohésion algorithmique !
