# Atlas Voyage

Application web statique pour préparer, comparer et partager plusieurs voyages, plusieurs variantes d’itinéraires et trois niveaux de budget.

## Déploiement actuel

Le site est publié avec **GitHub Pages** depuis la branche `main`, à la racine du dépôt.

URL : `https://alanb3110.github.io/atlas-voyage/`

> ⚠️ La version actuelle est publique. Ne pas stocker dans le dépôt de références de réservation, données de passeport, informations médicales, moyens de paiement, clés API ou autres données sensibles.

## Fonctionnalités V2

Le renderer générique gère maintenant :

- plusieurs voyages ;
- plusieurs variantes par voyage ;
- Essentiel / Confort recommandé / Premium ;
- partage d’une sélection précise via l’URL ;
- comparateur de variantes avec scores relatifs ;
- carte Leaflet, étapes cliquables et types de liaison ;
- distinction tracé réel / schématique ;
- fiches étapes avec hébergement dépendant du budget ;
- faune ;
- cuisine ;
- météo ;
- santé et sécurité ;
- règles locales avec statut loi/réglementation/usage/à vérifier ;
- budgets détaillés avec contrôle de cohérence ;
- programme jour par jour ;
- sources et traçabilité ;
- PWA/cache pour usage mobile.

## Démarrage local

Le navigateur ne doit pas ouvrir les fichiers directement en `file://` car l’application charge des JSON avec `fetch()`.

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Navigation

La hiérarchie est :

`Voyage → Variante d’itinéraire → Budget`

L’état est conservé dans l’URL, par exemple :

`trip.html?trip=bali-komodo-demo&variant=balanced&budget=comfort`

## Ajouter un voyage

1. Créer `data/trips/<id>.json` à partir du modèle V2.
2. Lui donner un `id` unique.
3. Ajouter l’entrée correspondante dans `data/catalog.json`.
4. Définir au moins une variante et les trois budgets.
5. Exécuter la validation.

```bash
node scripts/validate-data.mjs
```

La même validation est lancée automatiquement par GitHub Actions à chaque push et pull request.

## Modèle de données

Voir :

- `docs/data-model-v2.md` ;
- `docs/architecture.md` ;
- `instructions_projet_atlas_voyage.md`.

Le modèle V2 sépare notamment : variantes, scores de comparaison, liaisons cartographiques, étapes, faune, cuisine, météo, santé/sécurité, règles, budgets et traçabilité.

## Démonstrations

Les deux voyages fournis ne sont pas des devis actuels. `bali-komodo-demo.json` reprend des données de l’ancien template pour valider la migration ; `costa-rica-demo.json` sert uniquement à tester la navigation multi-voyages.

## Évolution confidentialité

L’architecture reste portable vers un hébergement protégé ultérieur, par exemple :

`GitHub privé → Cloudflare Pages → Cloudflare Access`

Aucune donnée ne doit être structurée de manière dépendante de GitHub Pages.

Voir également `docs/security.md`.
