# Architecture Atlas Voyage

## Objectif

Application statique, mobile-first, sans framework ni étape de build obligatoire. Le site actuel est une **GitHub Project Page** publiée sous `/atlas-voyage/` : tous les chemins applicatifs restent relatifs (`./...`).

## Lifecycle v3

La hiérarchie de décision n'est plus seulement `Voyage → Variante → Budget`.

Le cycle de maturité est désormais :

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

Cela permet de partager exactement le voyage, l'option et le niveau de budget affichés.

## Séparation données / interface

- `index.html` : catalogue et comparateur de longlist ;
- `trip.html` : renderer générique des dossiers détaillés/hérités ;
- `data/catalog.json` : index et maturité des dossiers ;
- `data/destination-comparison.json` : longlist, scores, incertitudes et gates ;
- `data/trips/*.json` : données détaillées/héritées ;
- `data/airport-access/*.json` : comparateurs porte-à-porte lorsqu'ils existent ;
- `data/booking-status/*.json` : états abstraits de préparation, sans références personnelles ;
- `assets/js/` : chargement, navigation et rendu ;
- `assets/css/` : design commun ;
- `scripts/validate-data.mjs` : contrôle de cohérence ;
- `.github/workflows/validate-data.yml` : validation automatique à chaque push/PR.

Aucune donnée de voyage ne doit être codée en dur dans `trip.html`.

## Comparateur de destinations

Le comparateur utilise huit critères pondérés et affiche désormais :

- score central ;
- plage d'incertitude méthodologique ;
- niveau de confiance A–D ;
- gates de décision ;
- budget Confort estimé ;
- porte-à-porte estimé depuis Reims ;
- avantages et compromis.

Un gate bloquant en `hold` ou `fail` suspend le rang normal de la destination.

Les plages affichées ne sont pas des intervalles de confiance statistiques.

Le coût et le porte-à-porte restent visibles séparément tant qu'aucune cible utilisateur explicite ne permet de les transformer honnêtement en contrainte ou critère pondéré.

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

`real:false` signifie que la liaison est schématique ; elle est affichée en pointillé. Un tracé schématique ne doit jamais être décrit comme un vrai itinéraire routier ou maritime.

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
- coordonnées ;
- routes ;
- cohérence des totaux ;
- comparateur aéroports ;
- scores longlist ;
- incertitudes ;
- confiance ;
- gates ;
- statuts de préparation ;
- syntaxe JavaScript et service worker.

## PWA et cache

Le service worker utilise un cache versionné `atlas-v7-shell` avec une politique restrictive.

Il ne met en cache par défaut que :

- le shell HTML/CSS/JS local ;
- `data/catalog.json` ;
- `data/destination-comparison.json`.

Il n'intercepte pas les ressources externes et ne met pas automatiquement en cache :

- `data/trips/*.json` ;
- `data/airport-access/*.json` ;
- `data/booking-status/*.json` ;
- tuiles OpenStreetMap ;
- images/CDN tiers.

Lors de l'activation, il ne purge que les caches dont le nom commence par `atlas-`, afin de ne pas supprimer les caches d'autres projets hébergés sur la même origine GitHub Pages.

Le mode hors-ligne est donc volontairement limité au shell et à la longlist tant que la politique de confidentialité n'est pas finalisée.

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

Le stade `booked` doit rester abstrait dans Git : `booked: true` est acceptable, un PNR ou numéro de billet nominatif ne l'est pas.

## Migration suivante

La prochaine phase doit :

1. homogénéiser les 12 candidates au niveau longlist ;
2. séparer faune terrestre et marine ;
3. introduire le modèle tarifaire `confirmed / observed / estimated / hypothesis / to_recheck` ;
4. refondre le porte-à-porte Reims avec ORY/FRA et décomposition train/voiture/péages/carburant/parking/hôtel ;
5. ajouter shortlist, filtres et top 3 compact sur iPhone ;
6. n'approfondir ensuite que les destinations réellement short-listées.
