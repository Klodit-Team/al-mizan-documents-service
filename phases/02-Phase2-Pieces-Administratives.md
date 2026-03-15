# Phase 2 : Pièces Administratives & URL Présignées (S7-S8)

## Résumé
Pendant cette phase, nous relions l'application au concept spécifique des Marchés Publics : joindre les "Pièces Administratives" à une "Soumission" via l'Operateur Economique (OE). Nous implémenterons aussi le contrôle et la génération de liens présignés afin que ces pièces puissent être consultées depuis le flux front, sans jamais que le flux métier ne s'occupe de faire *Passe-Plat* de documents.

## User Stories associées (issues du Backlog) :
* [`DOC-03`] **Joindre les pièces administratives** : En tant qu'OE, je veux joindre mes pièces (NIF, NIS, RC, Casier, CNAS, CASNOS, Att. fiscale, Bilan) à ma soumission afin de justifier mon éligibilité.
* [`DOC-02`] **Consulter / Télécharger un document** : En tant qu'utilisateur, je veux consulter ou télécharger un document via URL présignée MinIO afin d'accéder à son contenu sans exposer le stockage direct.
* [`DOC-08`] **Générer URL présignée temporaire** : En tant que système, je veux générer une URL présignée MinIO (TTL configurable) afin de permettre le téléchargement direct sans double transit serveur.
* [`DOC-09`] **Vérifier intégrité d'un document** : En tant que système, je veux recalculer et comparer le hash SHA-256 d'un document stocké afin de détecter toute altération post-upload.

## Tâches Techniques & Étapes :
- [ ] 1. Mettre en place la mécanique de téléchargement `GET /api/v1/documents/:id/download`.
     * Configurer Redis (`ioredis`).
     * Vérifier si la clé de cache `presignedUrl:{documentId}` existe et n'est pas expirée (TTL).
     * S'il y a un `MISS`, appeler le service Minio (méthode de hash URL expirable) en définissant un délai métier.
- [ ] 2. Paramétrer et vérifier les ACL. Seul le propriétaire ou le comité des Marchés doit avoir le droit de téléchargement.
- [ ] 3. Créer le endpoint `POST /api/v1/documents/administrative/:submissionId`.
     * Recevoir l'ID Document (récemment uploadé lors de la Phase 1) et le type de pièce parmi un Enum `[NIF, NIS, ... ]`.
     * Associer les éléments dans la table `PieceAdministrative` avec son paramètrage métier.
- [ ] 4. Ajouter le support de requete vers la verification de Hash externe (SHA-256). Il faut implémenter `GET /api/v1/documents/:id/integrity` : Recupérer en flux le document de Minio, calculer un hachage en live, le comparer avec le hachage sécurisé persisté dans DB.

---
**Points d’attention :** Ne jamais générer une URL expirant dans > 5 min pour les contrats confidentiels. Il est indispensable de cachetiser la clé de l'URL Minio dans Redis pour minimiser les appels réseaux.
