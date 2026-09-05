# Architecture Atlas Voyage

## Objectif

Application statique, mobile-first, sans framework ni étape de build obligatoire. Le site est une **GitHub Project Page** publiée sous `/atlas-voyage/` : tous les chemins applicatifs restent relatifs (`./...`).

## Hiérarchie de navigation

```text
Catalogue
└── Voyage
    ├── Variante d’itinéraire
    │   ├── Essentiel
    │   ├── Confort recommandé
    │   └── Premium
    └── Variante suivante
        └── ...
```

Les trois sélections sont encodées dans l’URL :

`trip.html?trip=bali-komodo-demo&variant=balanced&budget=comfort`

Cela permet de partager exactement le voyage, l’option et le niveau de budget affichés.

## Séparation données / interface

- `index.html` : catalogue de voyages ;
- `trip.html` : renderer générique ;
- `data/catalog.json` : index des voyages ;
- `data/trips/*.json` : données propres à chaque voyage ;
- `assets/js/` : chargement, navigation et rendu ;
- `assets/css/` : design commun ;
- `scripts/validate-data.mjs` : contrôle de cohérence sans dépendance ;
- `.github/workflows/validate-data.yml` : validation automatique à chaque push/PR.

Aucune donnée de voyage ne doit être codée en dur dans `trip.html`.

## Renderer V2

Le renderer affiche désormais :

1. couverture et KPI ;
2. synthèse ;
3. comparateur des variantes ;
4. carte Leaflet avec étapes et liaisons typées ;
5. fiches d’étapes dépendantes du budget ;
6. faune ;
7. cuisine ;
8. météo ;
9. santé et sécurité ;
10. règles/interdictions avec niveau de statut ;
11. trois budgets et décomposition ;
12. programme ;
13. sources et traçabilité.

La navigation de section est sticky et suit la section visible.

## Cartographie

Chaque variante peut porter `routes[]` avec :

- `type`: `air`, `sea`, `road`, `rail` ;
- `label` ;
- `points` ;
- `real`.

`real:false` signifie que la liaison est schématique ; elle est affichée en pointillé. Un tracé schématique ne doit jamais être décrit comme un vrai itinéraire routier ou maritime.

## Modèle de données

Le schéma courant est `schemaVersion: 2`.

Voir `docs/data-model-v2.md` pour le détail des champs.

Principaux blocs :

- `meta` ;
- `variants[]` avec `scores`, `tradeoff`, `routes`, `steps`, `days` ;
- `wildlife` ;
- `food` ;
- `weather` ;
- `practical` ;
- `budgets[]` ;
- `traceability` ;
- `sources[]`.

Chaque étape peut définir un hébergement différent pour chaque budget dans `lodging`.

## Validation

Depuis la racine :

```bash
node scripts/validate-data.mjs
```

Le contrôle couvre notamment : catalogue, variantes/budgets par défaut, coordonnées, routes, hébergements et cohérence des totaux.

## PWA

Le service worker utilise un cache versionné (`atlas-v2`) et fonctionne en stratégie network-first avec repli cache. Le shell applicatif comprend les CSS/JS du renderer V2 ; les JSON consultés sont ensuite mis en cache lors des requêtes normales.

## Confidentialité

Le site GitHub Pages actuel est public. Le code reste portable vers une architecture protégée ultérieure :

`GitHub privé → Cloudflare Pages → Cloudflare Access`

Aucun secret ni donnée personnelle sensible ne doit être stocké dans les JSON publics.

## Évolutions prévues

Sans refonte de l’architecture :

- données réellement réservables avec statut confirmé/estimé/à revérifier ;
- comparateur des aéroports depuis Reims ;
- cartes de transferts plus précises ;
- checklist de réservation ;
- favoris/notes locales ;
- export PDF ;
- hébergement privé ;
- fonctions serveur sans exposition de secrets.
