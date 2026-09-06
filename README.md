# Atlas Voyage

Application web statique pour préparer, comparer et partager des voyages nature, animaux et détente pour deux adultes au départ réel de Reims.

## Déploiement actuel

Le site est publié avec **GitHub Pages** depuis la branche `main`, à la racine du dépôt.

URL : `https://alanb3110.github.io/atlas-voyage/`

> ⚠️ La version actuelle est publique. Ne pas stocker dans le dépôt de références de réservation, données de passeport, informations médicales, moyens de paiement, clés API ou autres données sensibles.

## Lifecycle v3

Atlas Voyage distingue la maturité réelle des dossiers :

```text
Longlist
→ Shortlist
→ Destination sélectionnée
→ Itinéraire détaillé
→ Voyage réservable
→ Voyage réservé
```

Les 12 destinations de novembre 2026 restent en **longlist** tant qu'elles n'ont pas été explicitement retenues. Les anciens fichiers riches `data/trips/*.json` ne suffisent pas à promouvoir automatiquement leur maturité.

Le comparateur affiche score central, plage d'incertitude méthodologique, confiance A–D, gates `pass / watch / hold / fail`, budget Confort estimé, porte-à-porte indicatif depuis Reims, avantages et compromis. Les rangs sont marqués non robustes lorsque les plages de voisins se recouvrent.

### Filtres et shortlist

La longlist peut être filtrée sans modifier le score par budget Confort maximal, porte-à-porte maximal, nature, faune terrestre, faune marine, plage, culture et météo robuste.

Le top 3 central est recalculé après ces contraintes. Une shortlist locale peut être créée sur l'appareil ; elle est stockée dans `localStorage` et ne modifie pas le lifecycle Git.

Voir `docs/data-lifecycle-v3.md`.

## Revue homogène des preuves longlist

`data/longlist-evidence.json` constitue le registre de preuves commun aux 12 candidates. Chaque destination documente les cinq mêmes dimensions : saison/météo, faune, sécurité, formalités et santé.

Chaque dimension porte un statut (`verified`, `supported`, `to_recheck`, `unresolved`), une confiance, une synthèse et au moins une source datée. Les sujets évolutifs comportent une échéance de revérification lorsque nécessaire.

La qualité des preuves est séparée du score : une destination mieux documentée ne gagne pas automatiquement des points. Les observations d'animaux sauvages ne sont jamais garanties.

## Comparateur aéroports depuis Reims

L'accès terrestre et la recherche de vols sont séparés.

`data/airport-access/reims-airports.json` couvre systématiquement CDG, ORY, BRU, LUX, AMS et FRA, avec benchmarks voiture et rail. Les temps ferroviaires privilégient désormais des horaires/opérateurs officiels lorsqu'ils sont disponibles ; ils restent des benchmarks tant que l'horaire du vol de novembre n'est pas fixé.

Carburant, péages, parking, billets de train et hôtel éventuel restent `to_recheck` jusqu'à ce que le vol exact permette un calcul porte-à-porte honnête.

Une destination sans recherche de vols affiche tout de même les six accès avec **Vol à rechercher**. Pour les dossiers déjà étudiés, le comparateur n'affiche plus de score aéroport `/100` artificiellement précis.

## Scan marché de la shortlist provisoire

`data/shortlist-market-scan.json` suit les signaux tarifaires actuels pour le top 3 central provisoire :

- Komodo + Flores + Bali ;
- Afrique du Sud ;
- Seychelles.

La fenêtre de travail commune est actuellement **05/11/2026 → 24/11/2026**. Chaque observation tarifaire distingue strictement :

- `exact` : mêmes dates que la cible ;
- `nearby` : dates proches mais différentes ;
- `month` : minimum/signal mensuel sans couple de dates cible vérifié.

Un prix `observed` doit porter sa compagnie, sa source HTTPS et sa date de contrôle. Un prix `nearby` ou `month` n'est jamais injecté automatiquement dans un budget détaillé.

L'accueil expose une synthèse compacte : prix aérien observé, qualité temporelle de l'observation et benchmarks d'accès depuis Reims. Tant que les billets terrestres/parking et l'horaire précis du vol ne sont pas ouverts, Atlas Voyage ne présente pas de faux total porte-à-porte.

## Fonctionnalités

Le renderer générique gère plusieurs dossiers et variantes, trois budgets, URL partageables, comparateurs, carte Leaflet, étapes, faune, cuisine, météo, santé/sécurité, règles locales, budgets détaillés, programme, sources/traçabilité, accès aéroports depuis Reims, préparation/réservation abstraite, mode Auto/Clair/Sombre et PWA à cache restrictif.

## Démarrage local

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Navigation des dossiers détaillés

L'état reste encodé dans l'URL :

`trip.html?trip=bali-komodo-demo&variant=balanced&budget=comfort`

## Données longlist traçables

Les valeurs évolutives utilisent des objets structurés avec valeur, unité/devise, statut, `checkedAt`, source et confiance.

Statuts prévus : `confirmed`, `observed`, `estimated`, `hypothesis`, `to_recheck`.

Les valeurs longlist et scan marché restent des données de comparaison, pas des prestations réservées.

## Validation

```bash
npm run validate
```

La validation GitHub Actions contrôle notamment catalogue/lifecycle, scores/incertitudes, confiance/gates/facettes, valeurs traçables, variantes/routes/budgets, base des six accès Reims, 12 dossiers de preuves × 5 dimensions, provenance/dateMatch du scan tarifaire, préparation et syntaxe JavaScript/service worker.

## PWA / cache

Le service worker met en cache uniquement le shell applicatif local, le manifest et les deux fichiers explicitement publics nécessaires au rendu courant de la longlist :

- `data/catalog.json` ;
- `data/destination-comparison.json`.

Le registre de preuves, le scan tarifaire, les dossiers détaillés, données `airport-access`, états de réservation, tuiles OpenStreetMap, images et CDN externes ne sont pas mis automatiquement en cache. Les tarifs périssables restent donc network-only au niveau du service worker applicatif.

Le mode hors-ligne est volontairement limité tant que la future politique de confidentialité n'est pas finalisée.

## Modèle de données

Voir :

- `docs/data-lifecycle-v3.md` ;
- `docs/data-model-v2.md` pour le renderer détaillé hérité ;
- `docs/architecture.md` ;
- `docs/score-review-2026-09-06.md` ;
- `instructions_projet_atlas_voyage.md`.

Le prochain niveau de précision consiste à ouvrir les **mêmes dates exactes** sur les options aériennes les plus prometteuses, puis à chiffrer le pré-acheminement réel correspondant : billets de train ou voiture + carburant + péages + parking + hôtel éventuel + marge aéroport.

## Démonstrations

`bali-komodo-demo.json` et `costa-rica-demo.json` restent archivés et servent uniquement à tester d'anciens chemins de navigation.

## Confidentialité

Architecture cible :

```text
GitHub privé
→ GitHub Pages désactivé
→ Cloudflare Pages ou Workers
→ Cloudflare Access
```

Aucune donnée personnelle sensible ne doit être versionnée. Un état abstrait `booked: true` est acceptable ; un PNR, numéro de billet nominatif, passeport ou information bancaire ne l'est pas.
