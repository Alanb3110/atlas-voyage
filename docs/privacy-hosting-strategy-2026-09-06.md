# Confidentialité et hébergement — stratégie cible

Date de vérification : 2026-09-06.

## État actuel confirmé

- Le dépôt `Alanb3110/atlas-voyage` est actuellement **public**.
- Le site GitHub Pages associé est destiné, dans cette phase, à ne contenir que des données de recherche voyage non sensibles.
- Aucune référence de réservation, donnée d'identité voyageur ou donnée de paiement ne doit être ajoutée au dépôt public.

## Frontière de phase

La bascule d'hébergement doit être réalisée **avant** l'introduction de données telles que :

- PNR / record locator / référence de réservation ;
- numéro de billet ;
- passeport, date de naissance ou identifiant national ;
- coordonnées personnelles utilisées pour les réservations ;
- numéro de police d'assurance ou dossier de sinistre ;
- données de paiement ;
- documents de voyage personnels.

La CI `validate:privacy` bloque les clés JSON correspondantes dans `data/` et `.gitignore` exclut les emplacements destinés aux données privées locales.

## Architecture recommandée

### 1. Dépôt GitHub privé

Passer le dépôt en privé au moment de la transition vers les réservations réelles.

Point important : rendre le **dépôt** privé ne suffit pas à rendre un site GitHub Pages privé. GitHub documente un contrôle d'accès Pages privé pour les organisations GitHub Enterprise Cloud. Pour un projet personnel, cette solution est donc disproportionnée si l'objectif est simplement de partager l'application entre deux adultes.

### 2. Cloudflare Pages connecté au dépôt privé

Cloudflare Pages supporte les dépôts GitHub publics **et privés** via son intégration Git. Cette couche conserve un workflow simple : push/PR GitHub → preview → déploiement production.

### 3. Cloudflare Access devant l'application

Déployer le site sur un domaine ou sous-domaine géré/proxyfié par Cloudflare, puis créer une application Access de type web/self-hosted sur ce hostname.

Politique cible minimale :

- deny by default ;
- allow uniquement les deux comptes autorisés ;
- authentification par fournisseur d'identité ou code à usage unique selon le choix au moment du déploiement ;
- durée de session raisonnable ;
- MFA si le fournisseur choisi le permet simplement.

Pour un domaine personnalisé, Cloudflare précise qu'une politique Access doit être configurée spécifiquement pour ce hostname. Les preview deployments Pages doivent également être protégés : ils sont publics par défaut tant que la politique dédiée n'est pas activée.

### 4. Ne pas confondre authentification et cache client

Cloudflare Access protège l'accès HTTP au site, mais ne change pas le comportement du service worker ou du stockage navigateur après authentification.

Conséquence : les données contenant des références de réservation doivent rester **hors du shell CacheStorage**. La politique actuelle du service worker est compatible avec cette cible : seules les ressources statiques et les données de longlist explicitement publiques sont cachées.

Lors de la phase `booked`, conserver par défaut les données sensibles :

- network-only / `no-store` si elles viennent d'un fichier privé servi par l'application ; ou
- dans un stockage local explicitement conçu pour cela si une vraie fonction offline devient nécessaire.

Ne pas étendre automatiquement l'allowlist du service worker aux fichiers de réservation.

## Options écartées ou secondaires

### GitHub Pages privé

Techniquement possible avec le contrôle d'accès Pages de GitHub Enterprise Cloud pour une organisation, mais excessif pour ce projet personnel. Un dépôt privé sur un compte individuel peut être utilisé avec Pages selon le plan GitHub, mais cela ne constitue pas le modèle de site privé authentifié recherché ici.

### Conserver le site public et stocker les réservations uniquement en local

Possible pour minimiser l'infrastructure, mais moins robuste pour le partage entre deux appareils, les sauvegardes et la récupération après éviction du stockage iOS. À réserver à des données secondaires ou à un mode de secours, pas comme source unique des réservations.

## Séquence de migration proposée

1. Conserver l'état actuel public tant qu'aucune donnée personnelle/réservation n'est stockée.
2. Valider la CI de confidentialité et le comportement du service worker.
3. Créer le projet Cloudflare Pages à partir du dépôt actuel pour tester le déploiement sans données sensibles.
4. Configurer Access sur production **et previews** et tester depuis un navigateur non authentifié.
5. Passer le dépôt GitHub en privé.
6. Vérifier que GitHub Pages public n'est plus utilisé / retirer son DNS éventuel.
7. Revalider le site Cloudflare depuis les deux appareils autorisés.
8. Seulement ensuite autoriser le lifecycle `bookable → booked` à recevoir des références de réservation.

## Sources officielles vérifiées

- Cloudflare Pages — Git integration, dépôts privés supportés : https://developers.cloudflare.com/pages/get-started/git-integration/
- Cloudflare Pages — preview deployments et Access : https://developers.cloudflare.com/pages/configuration/preview-deployments/
- Cloudflare Pages — known issues / Access sur domaine personnalisé : https://developers.cloudflare.com/pages/platform/known-issues/
- Cloudflare One — Access pour application web publique/self-hosted : https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- GitHub — changement de visibilité du dépôt : https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- GitHub Enterprise Cloud — contrôle d'accès GitHub Pages privé : https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site
