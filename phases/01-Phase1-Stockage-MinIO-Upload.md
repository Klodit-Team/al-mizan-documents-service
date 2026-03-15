# Phase 1 : Configuration et Stockage de Base (S6)

Cette phase est critique, car le Document Service gère le stockage centralisé des pièces. Sans cette étape, le blocage est absolu.

## Résumé
Pendant cette phase, nous allons configurer l'upload via **Multer**, l'interface avec le stockage objet **MinIO**, et le calcul sécurisé du Hash **SHA-256** au vol permettant par la suite le stockage des métadonnées dans la DB locale PostgreSQL.

## User Stories associées (issues du Backlog) :
* [`DOC-01`] **Upload document sécurisé** : En tant qu'utilisateur, je veux uploader un document avec calcul automatique du hash SHA-256 afin de le stocker de manière sécurisée sur MinIO.

## Tâches Techniques & Étapes :
- [ ] 1. Configurer/Installer un Driver et un module Minio dans NestJS (`@minio/minio-js`).
- [ ] 2. Créer un middleware de sécurité avec `file-type` pour inspecter au niveau binaire (Magic Bytes) l'extension des fichiers (prévention Spoofing).
- [ ] 3. Configurer `Multer` à l'intérieur de routes NestJS en tant qu'upload *stream-based* uniquement, et bloquer toute utilisation en Buffer.
- [ ] 4. Bâtir le service de Hashing `SHA-256` qui viendra lire le Node Stream.
- [ ] 5. Concevoir le contrôleur `POST /api/v1/documents/upload`.
     * Recevoir l'Entité : entityType (USER, ORGANISATION), le context ID.
     * Uploader via MinIo vers : `/{entityType}/{id}/{uuid}.{ext}`.
     * Calculer le SHA256 à la volée pendant le streaming sans saturation mémoire.
- [ ] 6. Sauvegarder les données (`nom, typeMime, URL minio, hash, id`) dans la table Prisma `Document`.
- [ ] 7. Mettre en place un jeu de tests unitaires pour validation `multer`, hachage et `MinIoService`. Couverture > 80%.

---
**Points d’attention (CSL M6) :**
- L'intégrité (Hash) et Minio on-Premise sont des obligations de l'OWASP et de la loi 18-07 Algérienne.
- Sécuriser l'extension et la taille maximale pour prévenir n'importe quelle attaque locale.
