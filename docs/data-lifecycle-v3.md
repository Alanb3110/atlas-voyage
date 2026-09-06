# Atlas Voyage — lifecycle et modèle de décision v3

## Objectif

La v3 sépare la maturité d'une destination de la quantité de contenu disponible dans un ancien fichier `data/trips/*.json`.

Une destination de longlist ne doit plus donner l'impression d'être un voyage déjà détaillé ou réservable.

## Cycle de vie

```text
Longlist candidate
→ Shortlist
→ Destination sélectionnée
→ Itinéraire détaillé
→ Voyage réservable
→ Voyage réservé
```

Valeurs techniques :

- `longlist` : candidate exploratoire ;
- `shortlist` : recherche comparative approfondie ;
- `selected` : destination choisie ;
- `detailed` : itinéraire et trois budgets construits ;
- `bookable` : prestations réelles recherchées et datées ;
- `booked` : voyage réservé ; aucune référence personnelle sensible ne doit être versionnée dans Git ;
- `archived` : démonstration ou dossier abandonné.

## Longlist candidate

Le comparateur de longlist utilise `data/destination-comparison.json`.

Une candidate contient seulement les informations nécessaires à une décision initiale :

- budget Confort indicatif ;
- porte-à-porte indicatif depuis Reims ;
- climat/saison ;
- scores centraux ;
- incertitude méthodologique ;
- confiance globale des données ;
- critères bloquants ou à surveiller ;
- avantages et compromis.

La présence d'un ancien fichier détaillé dans `data/trips/` ne change pas automatiquement le lifecycle de la candidate.

## Score et incertitude

Les huit critères actuels restent notés de 0 à 5 :

- faune ;
- saison ;
- détente ;
- plage ;
- culture ;
- gastronomie ;
- sécurité ;
- logistique.

Le score central est :

```text
S = 100 × Σ[w_i × (s_i / 5)] / Σ[w_i]
```

Chaque candidate définit :

- `evidenceConfidence`: `A`, `B`, `C` ou `D` ;
- `uncertaintyHalfWidth` : demi-largeur par défaut autour de la note centrale ;
- `uncertaintyOverrides` : demi-largeurs spécifiques à certains critères.

Exemple :

```json
{
  "scores": {"wildlife": 4.7, "season": 3.8},
  "evidenceConfidence": "B",
  "uncertaintyHalfWidth": 0.3,
  "uncertaintyOverrides": {"season": 0.5}
}
```

La plage calculée est bornée à 0–5 puis agrégée avec les mêmes poids que le score central.

Cette plage est une **incertitude méthodologique provisoire**. Elle ne constitue pas un intervalle de confiance statistique.

## Confiance

- `A` : très documenté ; données critiques vérifiées et relativement stables ;
- `B` : bien documenté, mais certaines données restent évolutives ;
- `C` : niveau longlist, plusieurs points doivent être approfondis ;
- `D` : informations insuffisantes pour une décision fiable.

La confiance ne remplace pas la plage d'incertitude : les deux dimensions répondent à des questions différentes.

## Gates de décision

Les gates passent avant le score.

Structure :

```json
{
  "id": "security",
  "state": "hold",
  "blocking": true,
  "label": "Sécurité à clarifier",
  "note": "..."
}
```

États :

- `pass` : pas de blocage identifié ;
- `watch` : point majeur à surveiller ;
- `hold` : classement suspendu jusqu'à clarification ;
- `fail` : incompatible avec le brief actuel.

Si `blocking=true` et que l'état n'est pas `pass`, la destination ne reçoit pas de rang normal.

Le score ne doit jamais compenser un critère réellement éliminatoire.

## Budget et porte-à-porte

Tant que l'utilisateur n'a pas défini une cible ou une limite explicite, le budget et le temps porte-à-porte sont affichés séparément et ne sont pas convertis en préférence cachée.

Lorsqu'une contrainte est définie, elle pourra être utilisée :

1. comme filtre/gate ;
2. ou comme critère pondéré explicite.

Ne pas appliquer de normalisation min–max silencieuse entre les seules destinations présentes.

## Modèle tarifaire cible

Les nouveaux prix évolutifs doivent tendre vers :

```json
{
  "value": 747,
  "currency": "EUR",
  "quantity": 2,
  "unit": "person_roundtrip",
  "status": "observed",
  "checkedAt": "2026-09-05T14:30:00+02:00",
  "source": "airfrance-cdg-jnb-2026-11-05",
  "confidence": "high"
}
```

Statuts recommandés :

- `confirmed` : prestation contractuellement confirmée ou tarif officiel fixe ;
- `observed` : prix réellement observé pour les dates/conditions visées, non réservé ;
- `estimated` : estimation ou benchmark raisonnable ;
- `hypothesis` : hypothèse de travail volontaire ;
- `to_recheck` : information connue mais à revérifier.

Pour une estimation, ajouter si possible :

```json
"range": {"low": 650, "central": 750, "high": 900}
```

## Données réservées

Le stade `booked` ne doit pas pousser dans Git :

- PNR ;
- numéro de billet nominatif ;
- numéro de passeport ;
- information bancaire ;
- donnée médicale personnelle ;
- secret ou token.

L'application peut stocker un état abstrait comme `booked: true` sans exposer la référence réelle.

## Cache PWA

Depuis la v3, le service worker ne met en cache par défaut que :

- le shell HTML/CSS/JS local ;
- `data/catalog.json` ;
- `data/destination-comparison.json`.

Les dossiers détaillés, accès aéroport et états de réservation sont volontairement exclus du cache applicatif. Les ressources externes ne sont pas interceptées.

Cette politique est un prérequis avant toute future protection par Cloudflare Access.
