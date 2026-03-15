# Phase 3 : Validation de la Commission (S9)

## Résumé
Maintenant que les pièces ont été chargées et attachées à des soumissions, la **Commission de l’Administration (Service Contractant)** doit pouvoir statuer dessus : sont-elles conformes ? Sont-elles en date de validité légale ? Mettre en œuvre le workflow de PENDING, VALID, INVALID.

## User Stories associées (issues du Backlog) :
* [`DOC-04`] **Valider / Invalider une pièce** : En tant que membre de commission, je veux valider ou invalider une pièce (conformité, date d'expiration) afin de statuer sur l'éligibilité.
* [`DOC-10`] **Lister les pièces d'une soumission** : En tant que membre de commission, je veux consulter la liste complète des pièces d'une soumission avec statut de validation afin de préparer l'évaluation.

## Tâches Techniques & Étapes :
- [ ] 1. Développer l'API `GET /api/v1/documents/administrative/:submissionId` pour récupérer *la liste agrégée* (jointure) avec le statut du document (Minio URL), ses métadonnées et sa date d'expiration légale.
- [ ] 2. Implémenter le rôle d'autorisation : Ce endpoint doit obligatoirement vérifier que le JWT comporte le rôle `COMMISSION_OUVERTURE`, `EVALUATEUR` ou `SERVICE_CONTRACTANT` (RBAC).
- [ ] 3. Implémenter le processus de Validation métier `PATCH /api/v1/documents/administrative/piece/:pieceId/validate`.
     * Accepter `{ action: "VALIDATE" | "REJECT", reason?: "string" }`.
     * Modifier l'objet lié en BDD.
     * Envoyer un évenement conditionnel interne pour notifier l'OE si refus ou pour signaler au service soumission. (Le flux RabbitMQ sera codé plus tard mais préparer le service `EventPublisher`).

---
**Points d’attention :** Les rôles associés à cette partie doivent tous garantir le RGPD complet. On ne supprime que logiquement ou on préserve l'état pour les traçages métiers.
