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
- `data/airport-access/*.json` : comparateurs porte-à-porte lorsqu'ils existent ;
- `data/booking-status/*.json` : états abstraits de préparation, sans références personnelles ;
- `assets/js/` : chargement, navigation et rendu ;
- `assets/css/` : design commun ;
- `scripts/validate-data.mjs` : contrôle de cohérence ;
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

Un gate bloquant en `hold` ou `fail` suspend le rang normal de la destination.

Les plages affichées ne sont pas des intervalles de confiance statistiques.

### Filtres et shortlist

Les préférences suivantes agissent comme contraintes explicites et ne réécrivent pas le score :

- budget Confort maximal ;
- porte-à-porte maximal ;
- nature ;
- faune terrestre ;
- faune marine ;
- plage ;
- culture ;
- météo robuste.

Les facettes sont qualitatives : `high / medium / low / none`. Un filtre qualitatif sélectionné demande actuellement `high`.

La shortlist de l'interface est locale à l'appareil via `localStorage`. Elle n'altère pas le lifecycle versionné. Le top 3 compact est recalculé après les filtres et exclut les candidates en `hold` ou `fail`.

## Valeurs traçables longlist

Le budget Confort et le porte-à-porte utilisent des objets contenant au minimum :

- `value` ;
- `status` (`confirmed`, `observed`, `estimated`, `hypothesis`, `to_recheck`) ;
- `checkedAt` ;
- `source` ;
- `confidence` (`high`, `medium`, `low`).

Le budget porte en plus `currency: EUR` et le porte-à-porte `unit: min`.

Les budgets actuels restent des **estimations** ; aucune valeur longlist n'est présentée comme réservable.

## Renderer détaillé V2

Le renderer `trip.html` continue d'afficher les dossiers existants pendant la migration v3 :

1. couverture et KPI ;
2. synthèse ;
3. comparateur des variantes ;
4. comparateur aéroports lorsqu'un fichier existe ;
5. carte Leaflet avec étapes et liaisons typées ;
6. fiches d'étapes dépendantes du budget ;
7. faune ;
8. cuisine ;
9. météo ;
10. santé et sécurité ;
11. règles/interdictions ;
12. trois budgets et décomposition ;
13. préparation/réservation abstraite ;
14. programme ;
15. sources et traçabilité.

## Cartographie

Chaque variante peut porter `routes[]` avec :

- `type`: `air`, `sea`, `road`, `rail` ;
- `label` ;
- `points` ;
- `real`.

`real:false` signifie que la liaison est schématique ; elle est affichée en pointillé.

## Validation

Depuis la racine :

```bash
npm run validate
```

Le contrôle couvre notamment :

- cohérence catalogue/fichiers ;
- lifecycle ;
- profondeur de recherche ;
- variantes/budgets par défaut ;
- coordonnées et routes ;
- cohérence des totaux ;
- comparateur aéroports ;
- scores longlist ;
- incertitudes ;
- confiance ;
- gates ;
- facettes ;
- valeurs traçables ;
- statuts de préparation ;
- syntaxe JavaScript et service worker.

## PWA et cache

Le service worker utilise un cache versionné `atlas-v8-shell` avec une politique restrictive.

Il ne met en cache par défaut que :

- le shell HTML/CSS/JS local ;
- le manifest ;
- `data/catalog.json` ;
- `data/destination-comparison.json`.

Il n'intercepte pas les ressources externes et ne met pas automatiquement en cache :

- `data/trips/*.json` ;
- `data/airport-access/*.json` ;
- `data/booking-status/*.json` ;
- tuiles OpenStreetMap ;
- images/CDN tiers.

Lors de l'activation, il ne purge que les caches dont le nom commence par `atlas-`, afin de ne pas supprimer les caches d'autres projets hébergés sur la même origine GitHub Pages.

Le mode hors-ligne reste volontairement limité au shell et à la longlist tant que la politique de confidentialité n'est pas finalisée.

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
2. refondre le vrai porte-à-porte Reims avec ORY/FRA et décomposition train/voiture/péages/carburant/parking/hôtel ;
3. propager le modèle tarifaire structuré aux budgets détaillés ;
4. rendre les pondérations ajustables si utile ;
5. n'approfondir ensuite que les destinations réellement short-listées.
