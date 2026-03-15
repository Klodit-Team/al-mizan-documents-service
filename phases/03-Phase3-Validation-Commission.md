# Phase 3 : Validation de la Commission (S9)

## Résumé
Création des interfaces permettant au processus métier de décider si oui ou non, les soumissions envoyées avec des documents sont valides d'un point de vue administratif (Ex: Date de validité de CNAS dépassée = Rejet, sinon = Acceptation). Il s'agit d'appliquer les contraintes de rôles (RBAC).

## User Stories associées
* [`DOC-04`] **Valider / Invalider une pièce** : En tant que membre de commission, je veux valider ou invalider une pièce afin de statuer sur l'éligibilité.
* [`DOC-10`] **Lister les pièces d'une soumission** : En tant que membre de commission, je veux consulter la liste complète des pièces d'une soumission.

## Structure de Fichiers à Créer (src/)
```
src/
├── common/
│   ├── guards/
│   │   ├── roles.guard.ts               # Guard NestJS classique interceptant JWT
│   │   └── roles.decorator.ts           # Decorator personnalisée @Roles('COMMISSION_OUVERTURE')
│   └── interfaces/                      # Typage structure JWT local
└── documents/
    └── administrative-pieces/
        ├── ...existant...
        └── dto/
            └── validate-piece.dto.ts    # DTO: { isValid: boolean, designation/reason?: string }
```

## Tâches Techniques & Détails d'Implémentation :

### 1. Guards de Rôles et Identification Gateway (RBAC)
*   **Mise en contexte** : L'API Gateway située avant nous injecte le JWT de l'utilisateur (ou nous transmet directement les claims décodés du header HTTP selon votre architecture microservice `x-user-roles`).
*   Créer le décorateur `Roles(...roles: string[])`.
*   Créer le service `RolesGuard` : Il extrait le header passé, vérifie s'il comporte un des rôles du décorateur injecté. Lever une `UnauthorizedException` (401) ou `Forbidden` (403) le cas échéant.

### 2. Consultation : Endpoint `GET /api/v1/documents/administrative/:submissionId`
*   **Contrôleur** : Verrouillé par `@Roles('COMMISSION_OUVERTURE', 'EVALUATEUR', 'SERVICE_CONTRACTANT')` (selon la matrice du Readme Section 9).
*   **Service** :
    *   Faire une requête Prisma `findMany` où la clé complexe de tri est le `soumissionId`.
    *   Exemple: `this.prisma.pieceAdministrative.findMany({ where: { soumissionId }, include: { document: true } })`.
    *   Important : Formater intelligemment la réponse pour ne retourner que des URLs présignées générées au vol ou cacher les ID internes inutiles (map final des objets pour le front).

### 3. Workflow de Validation : `PATCH /api/v1/documents/administrative/piece/:pieceId/validate`
*   **Contrôleur** : Verrouillé par `@Roles('COMMISSION_OUVERTURE', 'EVALUATEUR', 'SERVICE_CONTRACTANT')`.
*   **DTO** (`ValidatePieceDto`) : Expecte la clé `action` ou de manière plus basique le booléen `isValide`. Ajouter `reason` optionnel (utilisé s'il y a un refus métier ou juridique).
*   **Service** :
    *   Vérifier que la pièce existe via `this.prisma.pieceAdministrative.findUnique`.
    *   S'il y a une `dateExpiration` dans le Document original (ou la pièce), et qu'elle est < `new Date()`, forcer la validation `isValide=false` d'office, l'humain ne pouvant valider un document légalement expiré.
    *   Updater l'enregistrement : `this.prisma.pieceAdministrative.update({ where: { id }, data: { isValide: true|false } })`.
    *   Si le `isValide` devient `false` et qu'une `reason` est donnée, préparer conceptuellement l'envoi d'alerte à l'Oe (notification service).
