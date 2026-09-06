# Méthode — coûts terrestres depuis Reims

Date de contrôle : 2026-09-06.

## Principe

Les accès aux aéroports sont décomposés en postes indépendants afin d'éviter les anciens montants agrégés impossibles à auditer :

- route A/R hors parking ;
- parking pour un voyage de référence de 20 jours ;
- rail ;
- hôtel éventuel, uniquement lorsqu'un horaire de vol l'impose réellement.

Un poste inconnu reste `null` avec un statut `to_recheck` ou `dynamic`. Il n'est jamais remplacé par zéro.

## Route

Les plages `roundTripRouteEUR` proviennent des plages aller simple publiées par Mappy et sont calculées par :

`C_route,A/R = 2 × (C_carburant,aller + C_peage,aller)`

Le validateur CI recalcule cette relation et refuse toute divergence supérieure à 0,02 €.

Ces montants utilisent le profil véhicule/carburant du planificateur ; ils sont donc des benchmarks observés et non le coût exact du véhicule des voyageurs.

## Parking

Un total 20 jours n'est calculé que lorsque le barème public permet une dérivation reproductible.

Exemples actuellement calculables :

- LUX Parking E : `57,50 + 51,50 + 6 × 11,50 = 178 €` ;
- AMS P3 Long Term Unsheltered : `95 + 18 × 15 = 365 €`.

Lorsqu'un opérateur ne publie qu'un prix « à partir de » pour 7 ou 14 jours, le prix 20 jours reste `dynamic` et le total voiture + parking reste incomplet.

## Rail

Un tarif public « à partir de » n'est présenté que comme borne basse. Pour deux adultes aller-retour :

`C_rail,min = 4 × prix_aller_par_personne_min`

Les segments additionnels nécessaires pour atteindre l'aéroport sont explicitement exclus lorsqu'ils ne sont pas inclus dans le tarif source.

## Usage décisionnel

Ces données alimentent la couverture d'accès aéroport mais ne remplacent pas encore les calculs porte-à-porte sur horaires exacts. La décision finale doit utiliser le vol choisi, une marge aéroport explicite et le coût exact du pré-acheminement correspondant.
