# Atlas Voyage — contrat métier du lifecycle

## Source de vérité

Le lifecycle versionné d'une destination est porté **uniquement** par `data/catalog.json > trips[].status`.

Cycle actif :

```text
longlist → shortlist → selected → detailed → bookable → booked
```

`archived` est un état hors cycle actif pour les démonstrations ou dossiers abandonnés.

Le champ `data/destination-comparison.json > destinations[].stage` est un reliquat du schéma v3. Il n'est pas autoritaire et doit être supprimé lors d'une migration dédiée du comparateur.

## Pourquoi ce contrat existe

Une destination exploratoire ne doit pas fabriquer un faux itinéraire, trois faux budgets ou des journées fictives uniquement pour satisfaire le renderer `trip.html`.

Le contrat distingue donc :

- la **maturité métier** du dossier ;
- la **présence éventuelle** d'un ancien fichier `data/trips/*.json` ;
- les jeux de données réellement requis pour prendre la décision correspondant à chaque stade.

Un fichier détaillé historique peut rester présent à un stade exploratoire pendant la migration, mais sa présence ne promeut jamais automatiquement la destination.

## Exigences minimales par stade

| Stade | Minimum métier requis | Dossier `data/trips/*.json` |
| --- | --- | --- |
| `longlist` | entrée catalogue, comparaison destination, registre de preuves | optionnel |
| `shortlist` | longlist + scan marché + géométrie gateway + scénario porte-à-porte + readiness structurée | optionnel |
| `selected` | shortlist + décision explicite portée par `status=selected` | optionnel ; peut servir de brouillon |
| `detailed` | selected + itinéraire détaillé + trois budgets + contenu pratique/traçabilité | obligatoire |
| `bookable` | detailed + readiness sans bloqueur et `booking_ready` | obligatoire |
| `booked` | bookable + readiness `booked` | obligatoire |
| `archived` | identité catalogue minimale | optionnel, uniquement pour compatibilité/archives |

### Longlist

Données minimales :

- catalogue : `id`, `title`, `status` ;
- une ligne dans `data/destination-comparison.json` ;
- une entrée dans `data/longlist-evidence.json`.

Le comparateur porte notamment les scores, incertitudes, gates, facettes, climat, budget Confort indicatif et porte-à-porte indicatif.

**Non requis :** variante, étapes, programme jour par jour, trois budgets détaillés, hôtels, activité ou fichier `data/trips/*.json`.

### Shortlist

La shortlist ajoute un niveau de recherche permettant de comparer sérieusement les options depuis Reims :

- entrée dans `data/shortlist-market-scan.json` ;
- entrée dans `data/shortlist-gateway-geometry.json` ;
- au moins un scénario dans `data/shortlist-door-to-door.json` ;
- `data/booking-status/<id>.json` en `schemaVersion: 2` avec readiness `blocked` ou `decision_ready`.

Un dossier détaillé reste facultatif.

### Selected

`selected` signifie que la destination a été choisie, pas que l'itinéraire est déjà construit.

Il conserve les exigences de shortlist. Aucun faux itinéraire ni faux budget détaillé n'est exigé. Un `dataFile` partiel peut exister comme brouillon, mais le renderer détaillé ne doit être ouvert que si les métadonnées de détail nécessaires sont présentes.

### Detailed

À partir de `detailed`, `dataFile`, `defaultVariant`, `defaultBudget` et `variantCount` sont obligatoires.

Le fichier de voyage doit alors fournir au minimum :

- `id`, `meta`, `traceability` ;
- au moins une variante, avec étapes et programme ;
- trois budgets `essential`, `comfort`, `premium` ;
- un budget par défaut et une variante par défaut valides ;
- coordonnées/liaisons cohérentes lorsqu'elles sont présentes ;
- contenu faune, cuisine, météo et pratique ;
- sources datées.

Les champs plus fins restent optionnels lorsqu'ils ne sont pas pertinents pour une étape donnée. Le renderer doit afficher une absence légitime comme telle plutôt que fabriquer une valeur.

### Bookable

`bookable` hérite du contrat `detailed` et exige en plus :

- `booking-status` schema v2 ;
- `readiness.state = booking_ready` ;
- aucun bloqueur actif.

Le statut signifie que la recherche des prestations a atteint un niveau exploitable pour réserver. Il ne signifie pas que toutes les prestations sont déjà achetées.

### Booked

`booked` hérite de `bookable` et exige :

- `readiness.state = booked`.

Aucune donnée personnelle sensible ne doit être versionnée : PNR, billet nominatif, passeport, information bancaire, donnée médicale ou secret restent hors Git.

## Champs catalogue

### Obligatoires à tous les stades actifs

- `id` ;
- `title` ;
- `status`.

### Optionnels généraux

- `subtitle` ;
- `coverImage` ;
- `tags` ;
- `researchDepth`.

### Métadonnées de détail

- `dataFile` ;
- `defaultVariant` ;
- `defaultBudget` ;
- `variantCount`.

Avant `detailed`, ces champs sont facultatifs pour compatibilité avec les anciens dossiers. À partir de `detailed`, ils sont obligatoires.

Une combinaison comme `defaultVariant` ou `defaultBudget` sans `dataFile` est incohérente et doit être rejetée.

## Transitions valides

Les promotions et retours se font par stade adjacent afin de garder une décision explicite :

- `longlist ↔ shortlist` ;
- `shortlist ↔ selected` ;
- `selected ↔ detailed` ;
- `detailed ↔ bookable` ;
- `bookable ↔ booked`.

Tout stade actif peut être archivé. Une archive ne peut être réactivée directement qu'en `longlist`, puis repromue normalement.

Le validateur d'un snapshot Git ne peut pas connaître l'ancien état. La fonction `canTransitionLifecycle(from, to)` constitue donc le contrat réutilisable pour tout futur outil de promotion/mutation.

## Responsabilités des validateurs

### `scripts/validate-lifecycle.mjs`

Responsable des invariants **inter-jeux de données** :

- statut autorisé ;
- exigences minimales par stade ;
- présence des entrées comparison/evidence ;
- couverture shortlist marché/gateway/porte-à-porte ;
- existence du readiness requis ;
- cohérence lifecycle ↔ readiness ;
- obligation de `dataFile` à partir de `detailed`.

### `scripts/validate-data.mjs`

Responsable de la structure et de la qualité des données **présentes** :

- identité catalogue ↔ fichier ;
- nombres, budgets et totaux ;
- variantes, étapes, coordonnées et routes lorsqu'elles existent ;
- contrat détaillé renforcé uniquement à partir de `detailed`.

Avant `detailed`, l'absence d'un fichier de voyage, d'une variante ou de trois budgets ne doit pas être bloquante.

### `scripts/validate-booking.mjs`

Responsable de la structure de readiness :

- statuts des items ;
- bloqueurs ;
- références ;
- cohérence `booking_ready` / `booked` avec le lifecycle.

Les validateurs spécialisés marché, géométrie et porte-à-porte gardent leurs responsabilités numériques et méthodologiques actuelles.

## Comportement du rendu

Le catalogue et le comparateur doivent toujours pouvoir afficher une destination à partir des données de décision.

Le renderer `trip.html` est un renderer de **dossier détaillé/hérité**, pas une condition d'existence d'une destination.

Règles :

- si un dossier possède `dataFile + defaultVariant + defaultBudget`, les liens détaillés restent disponibles, y compris pendant la période de migration ;
- si ces métadonnées n'existent pas, le catalogue et le comparateur n'inventent ni option ni budget et n'affichent pas de lien vers `trip.html` ;
- une URL directe vers un dossier sans payload détaillé retourne vers le comparateur plutôt que de tenter de charger un faux schéma ;
- le bloc readiness n'est rendu que pour les stades qui l'exigent ;
- les sections internes du voyage continuent d'utiliser des valeurs absentes/vides de façon défensive sans créer de contenu fictif.

## Migration des stubs pré-`detailed`

Le nettoyage des anciens dossiers artificiellement détaillés a été appliqué aux destinations actives qui restent en `longlist` ou `shortlist`.

Ces destinations ne déclarent plus `dataFile`, `variantCount`, `defaultVariant` ni `defaultBudget` et leurs anciens fichiers `data/trips/*.json` ont été supprimés :

- `south-africa-nov-2026` ;
- `seychelles-nov-2026` ;
- `thailand-khao-sok-andaman-nov-2026` ;
- `sri-lanka-yala-south-nov-2026` ;
- `india-tiger-goa-nov-2026` ;
- `raja-ampat-nov-2026` ;
- `galapagos-nov-2026` ;
- `australia-queensland-nov-2026` ;
- `oman-nov-2026` ;
- `costa-rica-nov-2026` ;
- `madagascar-nov-2026` ;
- `philippines-palawan-bohol-nov-2026` ;
- `namibia-botswana-nov-2026` ;

Les informations réellement utiles au stade de décision restent portées par `destination-comparison.json`, `longlist-evidence.json` et, pour les shortlist, par les jeux marché/gateway/porte-à-porte et le readiness. Les estimations de budget et de temps restent explicitement marquées comme telles. Aucun détail absent n'a été remplacé par une valeur inventée.

Deux sources officielles uniques qui restaient uniquement dans les anciens stubs ont été conservées dans le registre de preuves : la saison de South Goa pour l'Inde et Ras Al Jinz pour la faune à Oman. Les anciens signaux tarifaires non exacts ou dépassés n'ont pas été promus en données de référence.

### Dossier détaillé conservé

- `data/trips/komodo-flores-nov-2026.json` : statut `detailed`, donc payload détaillé requis et conservé sans modification de fond.

### Archives

- `bali-komodo-demo` ;
- `costa-rica-demo`.

Les archives restent disponibles pour compatibilité/démonstration et ne servent pas de modèle obligatoire aux destinations actives.

### Champ legacy du comparateur

Supprimer `destinations[].stage` lors du passage du comparateur à un nouveau schemaVersion. Tant qu'il existe, il reste toléré et non autoritaire.
