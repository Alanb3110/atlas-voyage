# Comparateur d’accès aéroport depuis Reims

## Objectif

Comparer les aéroports réellement pertinents pour un voyage en raisonnant **porte-à-porte depuis Reims**, et non uniquement sur le prix du billet.

Le comparateur est indépendant du renderer principal :

- interface : `assets/js/airport-access.js` ;
- style : `assets/css/airport-access.css` ;
- données : `data/airport-access/<trip-id>.json`.

Si le fichier d’un voyage est absent, la section est masquée automatiquement.

## Données d’une option

Chaque aéroport doit contenir au minimum :

```json
{
  "id": "cdg",
  "airport": {
    "code": "CDG",
    "name": "Paris-Charles-de-Gaulle"
  },
  "access": {
    "mode": "train / voiture / navette",
    "durationMin": 0,
    "costEUR": 0,
    "parkingEUR": 0,
    "overnightEUR": 0
  },
  "flight": {
    "priceEUR": 0,
    "durationMin": 0,
    "stops": 0,
    "quality": 0
  },
  "doorToDoorMin": 0,
  "fatigue": 1,
  "advantages": [],
  "compromises": [],
  "status": "estimated",
  "checkedAt": "YYYY-MM-DD"
}
```

`flight.priceEUR` et les autres coûts doivent suivre la convention du voyage, généralement **coût total pour les deux adultes**.

## Coût porte-à-porte

Le coût utilisé pour le classement est :

```text
C_total = C_access + C_parking + C_hotel_aeroport + C_vol
```

Tous les termes sont en EUR pour le groupe de voyageurs.

## Temps porte-à-porte

`doorToDoorMin` représente le temps total pratique entre le départ de Reims et l’arrivée utile à destination, incluant autant que possible :

- pré-acheminement depuis Reims ;
- marge avant vol ;
- vols ;
- escales ;
- temps d’arrivée raisonnable ;
- transfert terminal lorsque celui-ci est significatif.

Il ne doit pas être confondu avec `flight.durationMin`, qui concerne uniquement la chaîne aérienne.

## Score

Quatre composantes sont comparées :

1. **prix total** ;
2. **temps porte-à-porte** ;
3. **qualité du vol** ;
4. **fatigue**.

Les pondérations par défaut sont stockées dans `defaultWeights` :

```json
{"cost": 35, "time": 25, "flight": 20, "fatigue": 20}
```

L’utilisateur peut les modifier dans l’interface. Les poids sont normalisés automatiquement et mémorisés localement pour le voyage dans `localStorage`.

### Normalisation prix et temps

Pour une métrique `x` à minimiser :

```text
score_min(x) = 1 - (x - x_min) / (x_max - x_min)
```

Si tous les aéroports ont la même valeur, le score vaut 1 pour tous.

### Qualité du vol

`flight.quality` est défini de 0 à 5 :

```text
score_flight = quality / 5
```

Ce score doit synthétiser explicitement les éléments qui comptent pour le voyage : horaires, nombre d’escales, qualité de la correspondance, bagages, compagnie et robustesse de l’itinéraire.

### Fatigue

`fatigue` est défini de 1 à 5, où 1 est le moins fatigant :

```text
score_fatigue = (6 - fatigue) / 5
```

### Score final

Après normalisation des poids :

```text
Score = 100 × (
  w_cost × score_cost
+ w_time × score_time
+ w_flight × score_flight
+ w_fatigue × score_fatigue
)
```

L’implémentation stocke les poids sur une base 100 ; le résultat final est donc directement compris entre 0 et 100.

## Limites

Le classement est relatif aux options comparées. Ajouter ou retirer un aéroport peut donc modifier les scores normalisés prix/temps.

Le score ne remplace pas le jugement : les avantages et compromis doivent toujours être affichés, notamment lorsqu’un itinéraire aérien est fragile, lorsqu’une nuit d’hôtel est nécessaire ou lorsqu’un vol économise du temps malgré un pré-acheminement plus long.

Les fichiers `*-demo.json` contiennent des valeurs fictives et ne doivent jamais être utilisés pour une décision de réservation.
