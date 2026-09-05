# Suivi de préparation et réservation

## Objectif

Le bloc `Préparation` permet de suivre l’avancement d’un voyage sans transformer Atlas Voyage en gestionnaire de données personnelles.

Données : `data/booking-status/<trip-id>.json`  
Renderer : `assets/js/booking-readiness.js`

## Statuts

- `research` — à rechercher ;
- `shortlisted` — présélectionné ;
- `verified` — prix/disponibilité/conditions vérifiés ;
- `booked` — réservé ;
- `recheck` — information à revérifier ;
- `not_needed` — non nécessaire.

## Indicateur d’avancement

L’indicateur est volontairement simple. Chaque statut actif reçoit un coefficient :

```text
research      = 0,15
shortlisted   = 0,45
recheck       = 0,50
verified      = 0,75
booked        = 1,00
not_needed    = exclu du calcul
```

L’avancement affiché est la moyenne des coefficients des éléments actifs, multipliée par 100.

Ce pourcentage est un indicateur de préparation, pas une métrique contractuelle.

## Données autorisées tant que GitHub Pages est public

On peut stocker :

- catégorie de prestation ;
- nom public d’un hôtel, vol ou prestataire ;
- statut de recherche/réservation ;
- prix publics ;
- politique d’annulation ;
- date de vérification ;
- source publique ;
- notes non sensibles.

## Données à ne pas stocker publiquement

Ne pas mettre dans le dépôt public :

- numéro de réservation ;
- numéro de billet ;
- référence PNR ;
- numéro de passeport ;
- date de naissance complète ;
- adresse privée ;
- informations médicales personnelles ;
- données bancaires ;
- QR codes ou cartes d’embarquement ;
- identifiants de connexion ;
- clés API ou secrets.

Après migration vers un hébergement protégé, cette politique pourra être réévaluée, mais les secrets techniques devront rester côté serveur ou dans des variables d’environnement.

## Workflow cible

```text
research
   ↓
shortlisted
   ↓
verified
   ↓
booked
```

`recheck` peut intervenir à n’importe quel moment lorsqu’un prix, une formalité, une règle locale ou une disponibilité devient obsolète.

Le passage à `booked` ne doit se faire que lorsque la réservation est réellement effectuée ; Atlas Voyage ne doit jamais déduire automatiquement qu’un élément est réservé à partir d’une simple recherche.
