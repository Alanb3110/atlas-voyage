# Modèle de données Atlas Voyage — v2

Le renderer `trip.html` est générique : un voyage doit être décrit principalement dans `data/trips/<id>.json`.

## Racine

Champs principaux :

- `schemaVersion`: version du modèle, actuellement `2` ;
- `id`: identifiant stable du voyage ;
- `defaultVariant`: variante ouverte par défaut ;
- `defaultBudget`: budget ouvert par défaut ;
- `meta`: titre, dates, durée, origine, image ;
- `variants[]`: plusieurs itinéraires possibles ;
- `wildlife[]`: faune et potentiel d’observation ;
- `food`: cuisine et vigilance alimentaire ;
- `weather`: météo/saisonnalité ;
- `practical`: santé, sécurité, règles ;
- `budgets[]`: Essentiel, Confort recommandé, Premium ;
- `traceability`: dates de recherche et niveau de confiance ;
- `sources[]`: sources datées.

## Variante

Chaque élément de `variants[]` peut contenir :

- `id`, `label`, `subtitle`, `rhythm` ;
- `overviewIntro` et `summary[]` ;
- `scores` sur 5 : `wildlife`, `relaxation`, `culture`, `beach`, `logistics` ;
- `tradeoff`: compromis principal ;
- `routes[]`: liaisons utilisées sur la carte ;
- `steps[]`: étapes ;
- `days[]`: programme ;
- `mapNote`: précision sur la nature réelle ou schématique des tracés.

Les scores servent à comparer les variantes d’un même voyage. Ils ne doivent pas être interprétés comme une échelle universelle entre destinations sans méthode de scoring commune.

## Route cartographique

```json
{
  "type": "road",
  "label": "Ubud → Sanur",
  "real": false,
  "points": [[-8.50, 115.26], [-8.70, 115.26]]
}
```

Types actuellement gérés : `air`, `sea`, `road`, `rail`.

- `real: true` : géométrie documentée suffisamment précisément ;
- `real: false` : liaison schématique ; le renderer l’affiche en pointillé.

Ne jamais présenter une droite entre deux villes comme un vrai itinéraire routier ou maritime.

## Étape

Champs de base :

- `name` ;
- `nights` ;
- `coords` ;
- `image` optionnelle ;
- `summary` ;
- `transfer` ;
- `fatigue` ;
- `tags[]` ;
- `lodging` par budget.

Champs détaillés optionnels :

- `wildlife` ;
- `beach` ;
- `culture` ;
- `food` ;
- `activity` ;
- `crowding` ;
- `weather` ;
- `safety` ;
- `signature`.

Pour un voyage final, ces champs doivent être renseignés lorsque pertinents afin de couvrir le cahier des charges complet.

## Hébergements

```json
"lodging": {
  "essential": "Hôtel 3★ ...",
  "comfort": "Hôtel 4★ ...",
  "premium": "Resort 5★ ..."
}
```

Après passage du voyage au stade réellement réservable, il est préférable d’évoluer vers des objets structurés contenant au minimum : nom, prix, statut, date de vérification, conditions d’annulation et source.

## Budgets

Chaque budget contient :

- `id` ;
- `label` ;
- `recommended` optionnel ;
- `total` en EUR pour les deux voyageurs ;
- `items[]` : résumé du niveau de prestation ;
- `breakdown[]` : détail poste par poste.

Exemple :

```json
{
  "label": "Vols internationaux",
  "amount": 2200,
  "status": "estimé"
}
```

La somme des postes doit correspondre au `total` à ±1 EUR, sauf justification explicite.

## Santé, sécurité et règles

Structure recommandée :

```json
"practical": {
  "intro": "...",
  "healthSafety": [
    {"title": "Santé", "items": [["Moustiques", "Protection nécessaire"]]}
  ],
  "rules": [
    {"label": "Drones", "value": "À vérifier", "level": "check"}
  ]
}
```

`level` peut être :

- `law` : loi / interdiction juridique ;
- `regulation` : réglementation ou règle locale ;
- `culture` : usage ou norme culturelle ;
- `check` : information restant à vérifier.

## Traçabilité

`traceability` doit distinguer au minimum :

- `researchDate` ;
- `priceDate` ;
- `lastChecked` ;
- `budgetConfidence`.

Les sources évolutives doivent également porter leur propre `checkedAt`.

## Validation

Exécuter depuis la racine :

```bash
node scripts/validate-data.mjs
```

Le validateur contrôle notamment :

- cohérence catalogue/fichiers ;
- présence des variantes et budgets par défaut ;
- coordonnées ;
- géométries de routes ;
- hébergements par budget ;
- cohérence des totaux budgétaires.
