# Phase 4 : RabbitMQ, Asynchronisme & Événements (S10)

## Résumé
Pour faire correspondre notre logique de Marchés Publics aux services environnants (Audit Inaltérable, AI Service (OCR/NLP), Notification), nous allons lier notre service aux files d'attentes via **RabbitMQ**.

## User Stories associées (issues du Backlog) :
* [`DOC-05`] **Déclencher pipeline OCR/NLP** : En tant que système, je veux publier un événement après upload afin que l'IA Service (8011) analyse la conformité de la pièce.
* [`DOC-06`] **Consulter résultats OCR** : En tant que membre de commission, je veux consulter le score de confiance, la conformité et les anomalies OCR afin de prendre une décision éclairée.

## Tâches Techniques & Étapes :
- [ ] 1. Préparer le Setup `@nestjs/microservices` + un `RabbitMQ Client` et gérer les connexions via le `.env` de production. Configurer l'exchange `documents.exchange` avec la directive `topic`.
- [ ] 2. Générer les *Emiters* d'évenements quand l'upload a fini (depuis la phase 1): `document.uploaded` au format `{documentId, hash, mimeType, size}`.
- [ ] 3. Générer les *Emiters* lors de modifications métier (depuis la phase 3): `document.administrative.attached` et `document.ocr.requested`, à la validation `document.validated`, ou si un téléchargement d’URL Minio à lieu `document.downloaded` pour un track d'audit.
- [ ] 4. Mettre en place les *Consumers* pour réagir au fil OCR.
     * Ecouter la queue RabbitMQ locale : `documents.ocr.results`.
     * Recevoir la spec Json : `{documentId, pieceId, typeAnalyse, texteExtrait, scoreConfiance, isConforme, anomalies[]}`
     * Enregistrer dans table `OcrAnalyse`.
- [ ] 5. Mettre à disposition le endpoint `GET /api/v1/documents/:id/ocr` pour que la Commission vienne y consulter la donnée.

---
**Points d’attention :** Art. 7 du règlement oblige un enregistrement d’information à l’Audit, cette étape avec Exchange Topic permet d'emettre tout ce qui peut être récupéré sans attrait en backend par `Audit Service`. Ne jamais bloquer le fil d’exécution du contrôleur originel (`Async`).
