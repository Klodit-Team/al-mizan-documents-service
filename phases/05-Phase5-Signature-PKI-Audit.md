# Phase 5 : Signature Pki & PKI / OCSP (S11)

## Résumé
Les Procès-Verbaux de Commissions et les éléments de la commande Algérienne sont des fichiers juridiques contraignants. Il faut s'assurer des signatures via des certificats cryptographiques à clés publiques avec Node-Forge (PKI/OCSP). 

## User Stories associées (issues du Backlog) :
* [`DOC-07`] **Vérifier certificats PKI** : En tant que système, je veux vérifier automatiquement la validité des certificats de signature (OCSP) sur les documents critiques (soumissions, PV).

## Tâches Techniques & Étapes :
- [ ] 1. Mettre sur pied avec `node-forge` (et d’autres librairies type X509 si besoin) l'extraction d’une signature de base PAdES ou similaire à partir des "magic bytes" et des entêtes PDF signés.
- [ ] 2. Produire `POST /api/v1/documents/:id/verify-certificate`. Ce Endpoint devra charger à nouveau le fichier depuis MinIo, extraire ces métadonnées et faire une requête HTTP vers un serveur OCSP potentiel.
- [ ] 3. Consigner cette validation via *Logging* ou persisté pour conformité réglementaire.
- [ ] 4. Faire l’assemblage final : Nettoyage global, Test Intégration à de fortes exigences (> 95%), vérification du document JSON openAPI (Swagger) produit. Test ZAP OWASP.
- [ ] 5. Révision de la Matrice de Conformité Réglementaire.

---
**Points d’attention :** Ne pas se tromper avec les types de fichiers lors de la lecture des PKI. Seulement les documents signés comportent une base exploitable par Node-Forge.
