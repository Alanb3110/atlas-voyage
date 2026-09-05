# Architecture Atlas Voyage

## Objectif

Application statique, mobile-first, sans framework ni étape de build obligatoire. La V1 est une **GitHub Project Page** publiée sous `/atlas-voyage/` : tous les chemins applicatifs doivent rester relatifs (`./...`).

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

- `index.html` : catalogue de voyages.
- `trip.html` : renderer générique d’un voyage.
- `data/catalog.json` : index des voyages.
- `data/trips/*.json` : données propres à chaque voyage.
- `assets/js/` : chargement, navigation et rendu.
- `assets/css/` : design commun.

Aucune donnée de voyage ne doit être codée en dur dans `trip.html`.

## Modèle de données

Un voyage contient notamment :

- `meta` : titre, dates, durée, origine, image ;
- `variants[]` : plusieurs circuits possibles avec leurs propres étapes et programme ;
- `budgets[]` : Essentiel / Confort / Premium ;
- `traceability` : dates et niveau de confiance ;
- `sources[]` : sources datées.

Chaque étape peut définir un hébergement différent pour chaque budget dans `lodging`.

## Évolution prévue

L’architecture autorise sans refonte :

- comparateur de variantes côte à côte ;
- favoris et notes locales ;
- checklist de réservation ;
- statut des prestations (estimé / vérifié / réservé) ;
- sections faune, cuisine, météo, santé et règles ;
- export PDF ;
- passage vers un hébergement privé ;
- fonctions serveur sans exposer de secrets.
