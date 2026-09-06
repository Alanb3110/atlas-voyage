# Architecture Atlas Voyage

## Objectif

Application statique, mobile-first, sans framework ni étape de build obligatoire. Le site actuel est une **GitHub Project Page** publiée sous `/atlas-voyage/` : tous les chemins applicatifs restent relatifs (`./...`).

## Lifecycle v3

Le cycle de maturité est :

```text
Longlist
→ Shortlist
→ Destination sélectionnée
→ Itinéraire détaillé
→ Voyage réservable
→ Voyage réservé
```

Le catalogue porte le statut de maturité réel de chaque dossier. Une destination peut encore posséder un ancien fichier `data/trips/*.json` riche sans être considérée comme détaillée ou réservable.

Voir `docs/data-lifecycle-v3.md`.

## Navigation des voyages détaillés

Pour un dossier au stade détaillé ou supérieur :

```text
Destination
└── Variante d'itinéraire
    ├── Essentiel
    ├── Confort recommandé
    └── Premium
```

Les trois sélections sont encodées dans l'URL :

`trip.html?trip=bali-komodo-demo&variant=balanced&budget=comfort`

## Séparation données / interface

- `index.html` : catalogue et comparateur de longlist ;
- `trip.html` : renderer générique des dossiers détaillés/hérités ;
- `data/catalog.json` : index et maturité des dossiers ;
- `data/destination-comparison.json` : longlist, scores, incertitudes, gates, facettes et valeurs traçables ;
- `data/trips/*.json` : données détaillées/héritées ;
- `data/airport-access/reims-airports.json` : accès terrestres partagés depuis Reims ;
- `data/airport-access/<tripId>.json` : recherche aérienne propre à une destination lorsqu'elle existe ;
- `data/booking-status/*.json` : états abstraits de préparation, sans références personnelles ;
- `assets/js/` : chargement, navigation et rendu ;
- `assets/css/` : design commun ;
- `scripts/validate-data.mjs` et `scripts/validate-airport-origins.mjs` : contrôles de cohérence ;
- `.github/workflows/validate-data.yml` : validation automatique à chaque push/PR.

Aucune donnée de voyage ne doit être codée en dur dans `trip.html`.

## Comparateur de destinations

Le comparateur utilise huit critères pondérés et affiche :

- score central ;
- plage d'incertitude méthodologique ;
- niveau de confiance A–D ;
- gates de décision ;
- budget Confort traçable ;
- porte-à-porte traçable depuis Reims ;
- avantages et compromis.

Un gate bloquant en `hold` ou `fail` suspend le rang normal de la destination. Les plages affichées ne sont pas des intervalles de confiance statistiques.

### Filtres et shortlist

Les préférences suivantes agissent comme contraintes explicites et ne réécrivent pas le score : budget Confort maximal, porte-à-porte maximal, nature, faune terrestre, faune marine, plage, culture et météo robuste.

Les facettes sont qualitatives : `high / medium / low / none`. La shortlist de l'interface est locale à l'appareil via `localStorage`. Elle n'altère pas le lifecycle versionné. Le top 3 compact est recalculé après les filtres et exclut les candidates en `hold` ou `fail`.

## Valeurs traçables longlist

Le budget Confort et le porte-à-porte utilisent des objets contenant au minimum `value`, `status`, `checkedAt`, `source` et `confidence`. Le budget porte en plus `currency: EUR` et le porte-à-porte `unit: min`.

Les budgets actuels restent des **estimations** ; aucune valeur longlist n'est présentée comme réservable.

## Accès aéroports depuis Reims

L'accès terrestre est maintenant séparé de la recherche de vols.

`data/airport-access/reims-airports.json` contient les six aéroports à considérer systématiquement :

- CDG ;
- ORY ;
- BRU ;
- LUX ;
- AMS ;
- FRA.

Pour chacun, la base commune stocke au minimum :

- voiture : durée et distance ;
- rail : durée indicative ;
- statut ;
- date de vérification ;
- source ;
- confiance ;
- coûts encore à recalculer (`fuel`, `tolls`, `parking`, `hotel`, `tickets`).

Les coûts sont volontairement laissés `to_recheck` tant que les horaires exacts et la durée du voyage ne permettent pas de chiffrer honnêtement le parking, une éventuelle nuit d'hôtel ou le billet ferroviaire.

Les anciens fichiers par destination conservent temporairement leur `access.costEUR` agrégé comme benchmark hérité. Le renderer le signale explicitement et ne le présente pas comme une décomposition finalisée.

Une destination sans fichier `data/airport-access/<tripId>.json` n'efface plus la section : les six accès terrestres sont affichés, avec le statut **Vol à rechercher**.

### Classement provisoire des aéroports

Le score `/100` a été supprimé du rendu. Le rang ne compare que les options aériennes déjà recherchées.

La normalisation min-max précédente, sensible à l'ajout d'un simple outlier, est remplacée par un modèle de regret :

- coût : écart au moins cher, saturation à +1 500 EUR ;
- temps : écart au plus rapide, saturation à +480 min ;
- qualité de vol : distance à 5/5 ;
- fatigue : distance à 1/5.

Les pondérations utilisateur restent appliquées à ces regrets. Les seuils sont des paramètres méthodologiques provisoires destinés uniquement au tri des options recherchées ; ils ne constituent pas une mesure absolue de valeur.

Le modèle final devra remplacer les enveloppes d'accès héritées par :

```text
train OU voiture
+ carburant
+ péages
+ parking
+ hôtel éventuel
+ marge aéroport
+ vol
+ correspondances
= coût et temps porte-à-porte
```

## Renderer détaillé V2

Le renderer `trip.html` continue d'afficher les dossiers existants pendant la migration v3 : couverture/KPI, synthèse, variantes, aéroports, carte, étapes, faune, cuisine, météo, santé/sécurité, règles, budgets, préparation, programme et sources.

## Cartographie

Chaque variante peut porter `routes[]` avec `type`, `label`, `points` et `real`. `real:false` signifie que la liaison est schématique ; elle est affichée en pointillé.

## Validation

Depuis la racine :

```bash
npm run validate
```

Le contrôle couvre notamment : catalogue, lifecycle, variantes, budgets, coordonnées, routes, comparateurs aéroports existants, base commune des six aéroports depuis Reims, scores longlist, incertitudes, confiance, gates, facettes, valeurs traçables, préparation et syntaxe JavaScript/service worker.

## PWA et cache

Le service worker utilise un cache versionné `atlas-v9-shell` avec une politique restrictive.

Il ne met en cache par défaut que le shell HTML/CSS/JS local, le manifest, `data/catalog.json` et `data/destination-comparison.json`.

Il n'intercepte pas les ressources externes et ne met pas automatiquement en cache `data/trips/*.json`, `data/airport-access/*.json`, `data/booking-status/*.json`, les tuiles OpenStreetMap ni les images/CDN tiers.

Lors de l'activation, il ne purge que les caches dont le nom commence par `atlas-`.

## Confidentialité

Le site GitHub Pages actuel est public.

Architecture cible :

```text
GitHub privé
→ GitHub Pages désactivé
→ Cloudflare Pages ou Workers
→ Cloudflare Access
```

Aucun secret ni donnée personnelle sensible ne doit être stocké dans les JSON versionnés.

## Migration suivante

La prochaine phase doit :

1. homogénéiser factuellement les 12 candidates au niveau longlist ;
2. rechercher des vols sur des dates strictement comparables pour les destinations short-listées ;
3. chiffrer réellement train/voiture/péages/carburant/parking/hôtel pour les aéroports pertinents ;
4. propager le modèle tarifaire structuré aux budgets détaillés ;
5. n'approfondir ensuite que les destinations réellement short-listées.
