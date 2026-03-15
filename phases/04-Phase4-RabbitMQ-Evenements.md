# Phase 4 : Asynchronisme structuré (RabbitMQ & IA OCR) (S10)

## Résumé
Ce module gère le raccordement du microservice Document avec tout le reste de l'écosystème asynchrone de `Al-Mizan`. Nous publions et souscrivons à une messagerie basée sur AMQP via RabbitMQ, particulièrement concernant le pipeline d'analyses IA (OCR) exigé par l'Art. 73.

## User Stories associées
* [`DOC-05`] **Déclencher pipeline OCR/NLP** : ... publier un événement après upload afin que l'IA Service analyse la conformité.
* [`DOC-06`] **Consulter résultats OCR** : ... membre de commission veut consulter le score de confiance OCR ...

## Structure de Fichiers à Créer (src/)
```
src/
├── messaging/
│   ├── messaging.module.ts             # Module global RabbitMQ
│   ├── messaging.service.ts            # ClientProxy NestJS pour l'EventEmitter
│   └── event.interfaces.ts             # Typages stricts des Payload échangés
├── ocr/
│   ├── ocr.module.ts
│   ├── ocr.controller.ts               # Listener Rabbit (@MessagePattern / @EventPattern) ET Http endpoint
│   └── ocr.service.ts                  # Requête Prisma vers table OcrAnalyse
└── [...existant]
```

## Tâches Techniques & Détails d'Implémentation :

### 1. Intégration AMQP Microservices (@nestjs/microservices)
*   **`main.ts`** : En plus du démarrage classique HTTP `app.listen(8005)`, lier le microservice TCP/RabbitMQ en hybrid app (`app.connectMicroservice({...RabbitMQ Options})` -> `app.startAllMicroservices()`).
*   **`MessagingModule`** : Enregistrer un module utilisant la directive `ClientsModule.register([{ name: 'RABBITMQ_CLIENT', transport: Transport.RMQ, options: { urls: [process.env.RABBITMQ_URL], queue: 'documents.exchange', noAck: false } }])`.

### 2. Publication d'Événements (Producers)
*   Créer le wrapper `MessagingService.publishToQueue(routingKey, pattern, data)` qui invoque localement `this.rabbitmqClient.emit(pattern, data)`.
*   Modifier `DocumentsService` (Phase 1) pour qu'à la fin de la fonction `upload`, il lance (sans variable d'attente `await`, c'est asynchrone non-blocant) `MessagingService.publishToQueue('document.uploaded', payload)`.
*   Idem dans l'Administrative Service (Phase 2), lancer `document.administrative.attached` et surtout `document.ocr.requested` selon les Payloads stricts de la matrice dans le ReadMe section 7.

### 3. Écouteurs de Message (Consumers OCR - IA Service)
*   Créer le Contrôleur RabbitMQ de l'OCR (`OcrController`). Il ne réagit pas à HTTP mais via `@EventPattern('documents.ocr.results')` ou sur la file déclarée localement.
*   **Logique Consumer (`OcrService`)** : 
    1. Récupérer le Payload entrant `Json`.
    2. Valider le schéma du Dto (car cela provient d'un autre microservice non-typé : sécurité stricte).
    3. Exécuter un `upsert` ou `create` Prisma de table `OcrAnalyse`.
    4. Enregistrer la conformité ou les anomalies OCR fournies.

### 4. Visualisation `GET /api/v1/documents/:id/ocr` & `GET /api/v1/documents/administrative/piece/:pieceId/ocr`
*   Concevoir deux endpoints http classiques HTTP GET : (REST). Leurs rôles est uniquement d'exécuter Prisma `findMany` filtré sur un `documentId` ou un `pieceId`, et de rapporter ce format en JSON clair avec HTTP 200 à la commission de Marché Publics front-end. Mettre derrière une sécurité `@Roles('ADMIN', 'SERVICE_CONTRACTANT', 'COMMISSION_OUVERTURE', 'CONTROLEUR')`.
