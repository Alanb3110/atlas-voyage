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

Les 12 destinations de novembre 2026 sont actuellement en **longlist**, même lorsque des anciens fichiers `data/trips/*.json` contiennent déjà beaucoup de détails. Cela évite de donner l'impression que toutes les candidates ont été recherchées avec la même profondeur.

Le comparateur de longlist affiche score central, plage d'incertitude méthodologique, confiance A–D, gates `pass / watch / hold / fail`, budget Confort estimé et traçable, porte-à-porte estimé depuis Reims, avantages et compromis.

Un gate bloquant suspend le classement normal ; le score ne peut pas compenser un critère éliminatoire.

### Filtres et shortlist

La longlist peut être filtrée sans modifier le score par budget Confort maximal, porte-à-porte maximal, nature, faune terrestre, faune marine, plage, culture et météo robuste.

Le **top 3** est recalculé après ces contraintes. Une shortlist locale peut être créée sur l'appareil ; elle est stockée dans `localStorage` et ne modifie pas le lifecycle Git.

Voir `docs/data-lifecycle-v3.md`.

## Comparateur aéroports depuis Reims

L'accès terrestre et la recherche de vols sont séparés.

`data/airport-access/reims-airports.json` couvre systématiquement :

- CDG ;
- ORY ;
- BRU ;
- LUX ;
- AMS ;
- FRA.

Pour chaque aéroport, le site affiche les benchmarks voiture et rail depuis Reims. Les durées/distances sont datées et sourcées ; carburant, péages, parking, billets de train et hôtel éventuel restent `to_recheck` jusqu'à ce que les horaires et la durée réelle du voyage permettent un calcul honnête.

Une destination sans recherche de vols affiche tout de même ces six accès avec **Vol à rechercher**. Pour les destinations déjà étudiées, le classement ne porte que sur les vols effectivement recherchés et n'affiche plus de score `/100` artificiellement précis.

Les anciens `access.costEUR` des trois dossiers historiques restent temporairement visibles comme enveloppes comparatives agrégées et sont explicitement signalés comme tels.

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

Les valeurs évolutives de la longlist utilisent un objet structuré plutôt qu'un simple nombre : `value`, unité/devise, `status`, `checkedAt`, `source` et `confidence`.

Statuts prévus : `confirmed`, `observed`, `estimated`, `hypothesis`, `to_recheck`.

Les valeurs actuelles restent des **estimations de comparaison**, pas des offres réservables.

## Validation

```bash
npm run validate
```

La validation GitHub Actions contrôle notamment catalogue/lifecycle, scores et incertitudes, confiance/gates/facettes, valeurs traçables, variantes/routes/budgets, anciens comparateurs aéroports, base commune des six accès depuis Reims, préparation et syntaxe JavaScript/service worker.

## PWA / cache

Le service worker met en cache uniquement le shell applicatif local, le manifest et les deux fichiers explicitement publics nécessaires à la longlist :

- `data/catalog.json` ;
- `data/destination-comparison.json`.

Il ne met pas automatiquement en cache les dossiers détaillés, données `airport-access`, états de réservation, tuiles OpenStreetMap, images ou CDN externes. Lors de l'activation, il ne supprime que les anciens caches `atlas-*`.

Le mode hors-ligne est volontairement limité tant que la future politique de confidentialité n'est pas finalisée.

## Modèle de données

Voir :

- `docs/data-lifecycle-v3.md` ;
- `docs/data-model-v2.md` pour le renderer détaillé hérité ;
- `docs/architecture.md` ;
- `instructions_projet_atlas_voyage.md`.

Les prochains chantiers de fond sont l'homogénéisation factuelle des 12 candidates puis, sur les destinations réellement short-listées, la recherche de vols sur des dates identiques et le chiffrage exact train/voiture + péages + carburant + parking + hôtel éventuel.

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
