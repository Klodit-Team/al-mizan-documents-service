## Intégration Documentation-Service ↔ Users-Service (RabbitMQ)

Ce document décrit les étapes pour configurer, démarrer, tester et déboguer l'intégration entre `documentation-service` et `users-service` via RabbitMQ (exchange topic : `al-mizan.events`).

Il couvre :
- les événements publiés par `documentation-service` (format et routing keys)
- les événements ACK consommés par `documentation-service`
- variables d'environnement importantes
- procédure de test (mock + réel)
- vérifications RabbitMQ & dépannage

## Contexte rapide

- Exchange canonical : `al-mizan.events` (type `topic`)
- Routing keys à PUBLIER depuis `documentation-service` :
  - `documentation.organisation.documents.uploaded`
  - `documentation.organisation.documents.failed`
- Routing keys attendus / CONSOMMÉS par `documentation-service` pour les ACKs :
  - `user.organisation.documents.upload.response` (optionnel)
  - `user.organisation.documents.uploaded`
  - `user.organisation.documents.upload.failed`

Les messages publiés par `documentation-service` sont envoyés en JSON, persistent=true et contentType=application/json.

## Payloads exigés

Exemple payload `documentation.organisation.documents.uploaded` :

```json
{
  "event_id": "uuid",
  "correlation_id": "uuid",
  "organisation_id": "uuid",
  "user_id": "uuid-optionnel",
  "status": "success",
  "uploaded_documents": [
    {
      "type": "NIF",
      "document_id": "id-document-unique",
      "storage_key": "bucket/path/file.pdf",
      "file_name": "file.pdf",
      "url": "https://...",
      "status": "uploaded"
    }
  ],
  "failed_documents": [],
  "processed_at": "2026-04-17T15:00:00Z"
}
```

Exemple payload `documentation.organisation.documents.failed` :

```json
{
  "event_id": "uuid",
  "correlation_id": "uuid",
  "organisation_id": "uuid",
  "user_id": "uuid-optionnel",
  "status": "failed",
  "uploaded_documents": [],
  "failed_documents": [
    {
      "type": "NIF",
      "file_name": "file.pdf",
      "reason": "validation error"
    }
  ],
  "error": "raison globale optionnelle",
  "processed_at": "2026-04-17T15:00:00Z"
}
```

Contraintes importantes :
- `type` doit être exactement `NIF`, `NIS` ou `DENOMINATION`.
- Pour chaque document réussi, fournir en priorité `document_id`, sinon `storage_key`, sinon `url`.
- `correlation_id` doit rester identique sur tout le flux.
- Les messages doivent être idempotents (le consommateur doit gérer la duplication métier).

## Variables d'environnement utiles

- `RABBITMQ_URL` (ex: `amqp://localhost:5672`)
- `RABBITMQ_EXCHANGE` (défaut : `al-mizan.events`)
- `RABBITMQ_USER_ACK_QUEUE` (défaut : `documents.user.acks`) — queue dédiée pour les ACKs reçus du users-service
- `PORT` (défaut : `8005`)
- MINIO_*, POSTGRES_*, REDIS_* (comme dans `.env`) — voir le `.env.example` du repo

Placez ces variables dans `.env` (ou exportez-les en shell) avant de démarrer le service.

## Démarrage local (prérequis)

Prérequis : RabbitMQ (Management UI activée sur 15672), MinIO, PostgreSQL, Redis.

1) Installer dépendances

```bash
npm install
```

2) Construire (optionnel en dev)

```bash
# build & watch
npm run build
```

3) Démarrer `documentation-service` en mode développement

```bash
npm run start:dev
```

Si le port 8005 est occupé, exporter `PORT` :

```bash
PORT=8006 npm run start:dev
```

## Tester l'intégration — méthode simple (mock)

1) Lancer le mock users-service (fourni) pour simuler la réception et l'ACK :

```bash
node scripts/users-mock-service.js
```

2) Ouvrir Swagger : http://localhost:8005/api/docs
3) Envoyer un `POST /api/documents/upload` avec un body valide (type NIF/NIS/DENOMINATION si ownerType ORGANISATION).

4) Vérifier logs :
- `AmqpPublisherService` : "AMQP publisher connected and exchange asserted: al-mizan.events"
- Publication : "Published documentation.organisation.documents.uploaded to exchange al-mizan.events"
- Mock consumer : logs de réception et ACK (ou si users-service réel, logs du users-service)
- `documentation-service` : "ACK received — correlation_id=... organisation_id=... status=... references_processed=[...]"

## Tester l'intégration — avec users-service réel

1) Démarrer users-service localement (assurez-vous qu'il se bind sur `al-mizan.events` — si non, ajuster `RABBITMQ_EXCHANGE`).
2) Refaire un upload depuis Swagger ou curl.
3) Vérifier que users-service consomme l'événement et publie la réponse sur la routing key attendue (`user.organisation.documents.uploaded` / `.upload.failed` / `.upload.response`).
4) `documentation-service` devrait consommer l'ACK et logger le résumé.

## Vérifications RabbitMQ (management API)

Lister bindings (utile pour valider exchange→queue)

```bash
curl -u guest:guest http://localhost:15672/api/bindings | jq '.[] | {source:.source, destination:.destination, routing_key:.routing_key, destination_type:.destination_type}'
```

Lister queues et consommateurs

```bash
curl -u guest:guest http://localhost:15672/api/queues | jq '.[] | {name:.name, consumers:.consumers, vhost:.vhost}'
```

Vérifier que `al-mizan.events` → `users-service.documentation.organisation.documents.uploaded` (ou vers votre queue d'ACK `documents.user.acks`) est bien configuré.

## Dépannage courant

- EADDRINUSE: Le port 8005 est occupé → arrêter l'autre process ou lancer sur un autre port : `PORT=8006 npm run start:dev`.
- Pas d'ACK reçu :
  - vérifier que `users-service` est démarré et bind l'exchange `al-mizan.events`.
  - vérifier que `users-service` publie l'ACK sur `al-mizan.events` avec la routing key correcte (ex: `user.organisation.documents.uploaded`).
  - vérifier les bindings dans l'UI RabbitMQ (vérifier que les queues ont `consumers > 0`).
- Publish OK mais pas de consumer : vérifier exchange name (mismatch d'exchange est la cause la plus fréquente).
- Payload mal formé : vérifier `type` exact (NIF/NIS/DENOMINATION) et la présence de `document_id`/`storage_key`/`url` pour chaque document.

## Recommandations / améliorations possibles

- Ajouter un champ AMQP property `correlationId` (en plus du champ payload `correlation_id`) si vous voulez tracer au niveau broker.
- Ajouter un middleware de validation JSON Schema pour les événements publiés (schéma partagé avec users-service) pour éviter les régressions.
- Ajouter des tests e2e qui démarrent RabbitMQ (docker-compose) + MinIO et vérifient le flux complet.

## Foire aux questions rapide

- Q: Pourquoi avons-nous deux connexions RMQ ?
  - R: On conserve la connexion existante pour `documents.ocr.results` (pas toucher aux autres intégrations). On ajoute une seconde connexion (ou client publisher + microservice ACK queue) pour publier/consommer les événements organisation afin d'éviter d'impacter d'autres queues.

- Q: Le message est-il durable ?
  - R: Oui — `persistent: true` est utilisé pour les événements publiés par `AmqpPublisherService`.

## Récapitulatif rapide des commandes utiles

```bash
# démarrer le service
npm run start:dev

# démarrer le mock users-service
node scripts/users-mock-service.js

# inspecter bindings
curl -u guest:guest http://localhost:15672/api/bindings | jq '.[] | {source:.source, destination:.destination, routing_key:.routing_key, destination_type:.destination_type}'

# lister queues
curl -u guest:guest http://localhost:15672/api/queues | jq '.[] | {name:.name, consumers:.consumers, vhost:.vhost}'
```

---

Si tu veux, je peux :
- ajouter un `.env.example` avec les variables essentielles,
- ajouter un petit script `scripts/publish-sample.js` qui publie un événement de test via AMQP,
- ou créer les tests e2e automatisés pour couvrir le flux (avec docker-compose pour RabbitMQ/MinIO/Postgres).

Dis-moi ce que tu veux en suite.
