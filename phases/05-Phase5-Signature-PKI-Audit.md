# Phase 5 : Signature PKI, Exigences Audit & Nettoyage (S11)

## Résumé
Puisque le projet s'adresse aux commandes publiques d'États, certains types de document doivent garantir une protection cryptographique via Certificat signature PKI X.509. C'est le bloc "Légal". On s'attelle également à parfaire la couverture de tests E2E.

## User Stories associées
* [`DOC-07`] **Vérifier certificats PKI** : En tant que système, je veux vérifier automatiquement la validité des certificats de signature (OCSP)...

## Structure de Fichiers à Créer (src/)
```
src/
├── crypto/
│   ├── pki.module.ts
│   ├── pki.controller.ts              # Endpoint de demande force (verify)
│   └── pki.service.ts                 # Interaction API avec Node-forge / PDF parser
└── [...existant]
```

## Tâches Techniques & Détails d'Implémentation :

### 1. `CryptoModule/PkiService` (Traitement Node-forge)
*   Implémenter un parser de signature cryptographique (Ex: PDF PAdES).
*   *Note Technique* : NodeJs ne supporte pas nativement la structure PAdES complète directement sans libraries tierces. Le `node-forge` s'utilise pour manipuler les certificats ASN.1, PKCS#7 et signatures X.509.
*   Logique du service `verifyCertificate(documentId)`:
    1. Charger le Buffer du PDF concerné depuis Minio en Ram (Limiter les tailles acceptées de PDF à vérifier, pour ne pas saturer le service Node.Js).
    2. Utiliser un Parser regex PDF/PKCS ou node-forge pour isoler le dictionnaire `ByteRange`.
    3. Hacher la portion du fichier signée originellement (Sha256).
    4. Vérifier que ce Hash matche le chiffrage par la clef publique trouvée dans le PKCS#7 du document.
    5. *(Bonus)* : Faire un appel réseau HTTPS court vers le relai OCSP du validateur indiqué dans le certificat pour savoir s'il n'est pas révoqué (Optionnel selon niveau de rigueur de validation CSL).
    6. Retourner `{ isValid, issuer, subject, notAfter, isRevoked }`

### 2. Contrôleur de Déclenchement (`POST /api/v1/documents/:id/verify-certificate`)
*   Appelle le PkiService asynchrone.
*   Si un document n'a aucune signature cryptée valide ou visible, lever une Erreur 400 personnalisée "Aucune signature Pades trouvée dans les octets".

### 3. Sécurisation OWASP Finale & Audit
*   Gérer `express-rate-limit` dans `app.module.ts` via le pattern `ThrottlerModule` sur les uploads (limiter à 10 fichiers/minute par UserId pour ne pas sursaturer Minio et l'E/S DDOS).
*   Injecter le module middleware `helmet()` dans `main.ts` pour chiffrer les requêtes Header.
*   Produire les tests E2E complexes finaux `(test/app.e2e-spec.ts)` décrivant le parcours entier mocké.

### 4. Lancement et Vérification du Swagger (OpenAPI 3.0)
*   Insérer massivement des Décorateurs `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` dans chaque route du document.
*   Assurer un `npm run build` total et la passation complète du CI/CD `GitHub Actions` sur Node.js 18 100% au Vert avant achèvement formel du service P5.
