# Atlas Voyage

Application web statique pour préparer, comparer et partager des voyages nature, animaux et détente pour deux adultes au départ réel de Reims.

## Déploiement actuel

Le site est publié avec **GitHub Pages** depuis la branche `main`, à la racine du dépôt.

URL : `https://alanb3110.github.io/atlas-voyage/`

> ⚠️ La version actuelle est publique. Ne pas stocker dans le dépôt de références de réservation, données de passeport, informations médicales, moyens de paiement, clés API ou autres données sensibles.

## Lifecycle v3

Atlas Voyage distingue désormais la maturité réelle des dossiers :

```text
Longlist
→ Shortlist
→ Destination sélectionnée
→ Itinéraire détaillé
→ Voyage réservable
→ Voyage réservé
```

Les 12 destinations de novembre 2026 sont actuellement en **longlist**, même lorsque des anciens fichiers `data/trips/*.json` contiennent déjà beaucoup de détails. Cela évite de donner l'impression que toutes les candidates ont été recherchées avec la même profondeur.

Le comparateur de longlist affiche maintenant :

- score central ;
- plage d'incertitude méthodologique ;
- confiance A–D ;
- gates `pass / watch / hold / fail` ;
- budget Confort estimé ;
- temps porte-à-porte estimé depuis Reims ;
- avantages et compromis.

Un gate bloquant suspend le classement normal ; le score ne peut pas compenser un critère éliminatoire.

Voir `docs/data-lifecycle-v3.md`.

## Fonctionnalités

Le renderer générique gère :

- plusieurs dossiers ;
- plusieurs variantes par voyage détaillé ;
- Essentiel / Confort recommandé / Premium ;
- partage d'une sélection précise via l'URL ;
- comparateur de variantes avec scores relatifs ;
- carte Leaflet, étapes cliquables et types de liaison ;
- distinction tracé réel / schématique ;
- fiches étapes avec hébergement dépendant du budget ;
- faune ;
- cuisine ;
- météo ;
- santé et sécurité ;
- règles locales avec statut loi/réglementation/usage/à vérifier ;
- budgets détaillés avec contrôle de cohérence ;
- programme jour par jour ;
- sources et traçabilité ;
- comparateur aéroports lorsqu'un fichier existe ;
- suivi abstrait de préparation/réservation ;
- mode Auto / Clair / Sombre ;
- PWA avec cache restrictif.

## Démarrage local

Le navigateur ne doit pas ouvrir les fichiers directement en `file://` car l'application charge des JSON avec `fetch()`.

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Navigation des dossiers détaillés

L'état reste encodé dans l'URL :

`trip.html?trip=bali-komodo-demo&variant=balanced&budget=comfort`

## Validation

```bash
npm run validate
```

La validation est lancée automatiquement par GitHub Actions sur `main` et sur les pull requests.

Elle contrôle notamment :

- cohérence catalogue/fichiers ;
- lifecycle ;
- scores et pondérations ;
- plages d'incertitude ;
- confiance A–D ;
- gates ;
- variantes, coordonnées et routes ;
- cohérence des budgets ;
- comparateurs aéroports lorsqu'ils existent ;
- états de préparation ;
- syntaxe JavaScript et service worker.

## PWA / cache

Le service worker met en cache uniquement le shell applicatif local et les deux fichiers explicitement publics nécessaires à la longlist :

- `data/catalog.json` ;
- `data/destination-comparison.json`.

Il ne met plus automatiquement en cache les dossiers détaillés, comparateurs aéroports, états de réservation, tuiles OpenStreetMap, images ou CDN externes.

Lors de l'activation, il ne supprime que les anciens caches `atlas-*`, sans toucher aux caches d'autres projets partageant l'origine `alanb3110.github.io`.

Le mode hors-ligne est donc volontairement limité tant que la future politique de confidentialité n'est pas finalisée.

## Modèle de données

Voir :

- `docs/data-lifecycle-v3.md` ;
- `docs/data-model-v2.md` pour le renderer détaillé hérité ;
- `docs/architecture.md` ;
- `instructions_projet_atlas_voyage.md`.

Le prochain chantier de données est la migration des 12 candidates vers un niveau longlist homogène et l'introduction du modèle tarifaire structuré `confirmed / observed / estimated / hypothesis / to_recheck`.

## Démonstrations

`bali-komodo-demo.json` et `costa-rica-demo.json` restent archivés et servent uniquement à tester d'anciens chemins de navigation.

## Confidentialité

Le code reste portable vers une architecture protégée ultérieure :

```text
GitHub privé
→ GitHub Pages désactivé
→ Cloudflare Pages ou Workers
→ Cloudflare Access
```

Aucune donnée personnelle sensible ne doit être versionnée. Un état abstrait `booked: true` est acceptable ; un PNR, numéro de billet nominatif, passeport ou information bancaire ne l'est pas.
