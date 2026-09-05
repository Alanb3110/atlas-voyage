# Atlas Voyage

Application web statique pour préparer, comparer et partager plusieurs voyages, plusieurs variantes d’itinéraires et trois niveaux de budget.

## Déploiement actuel

La V1 est prévue pour **GitHub Pages** depuis la branche `main`, à la racine du dépôt.

URL cible : `https://alanb3110.github.io/atlas-voyage/`

> ⚠️ La V1 est publique. Ne pas stocker dans le dépôt de références de réservation, données de passeport, informations médicales, moyens de paiement, clés API ou autres données sensibles.

### Activer GitHub Pages

Dans GitHub :

1. `Settings` → `Pages` ;
2. `Build and deployment` → `Deploy from a branch` ;
3. branche `main` ;
4. dossier `/(root)` ;
5. enregistrer.

Le site est ensuite republié après chaque modification de `main`.

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

1. Copier un fichier dans `data/trips/`.
2. Lui donner un `id` unique.
3. Ajouter l’entrée correspondante dans `data/catalog.json`.
4. Définir au moins une `variant` et les trois budgets.

## Démonstrations

Les deux voyages fournis ne sont pas des devis actuels. `bali-komodo-demo.json` reprend des données de l’ancien template pour valider la migration ; `costa-rica-demo.json` sert uniquement à tester la navigation multi-voyages.

## Évolution confidentialité

L’architecture doit rester portable vers un hébergement protégé ultérieur, par exemple :

`GitHub privé → Cloudflare Pages → Cloudflare Access`

Aucune donnée ne doit être structurée de manière dépendante de GitHub Pages.

Voir :

- `docs/architecture.md`
- `docs/security.md`
- `instructions_projet_atlas_voyage.md`
