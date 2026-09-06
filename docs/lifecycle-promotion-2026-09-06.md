# Promotion de maturité — longlist → shortlist

Date : 2026-09-06.

## Source de vérité

Le lifecycle d'un dossier est défini uniquement dans `data/catalog.json`.

`data/destination-comparison.json` reste un modèle d'évaluation (scores, incertitudes, gates, facettes, budget/temps estimés). Son ancien champ `stage` est un reliquat du schéma v3 et n'est plus autoritaire. Il sera supprimé lors du prochain changement de schéma du comparateur afin d'éviter une réécriture massive sans bénéfice fonctionnel immédiat.

## Critère de promotion

Une candidate `longlist` dispose d'un socle homogène de recherche, notamment le registre de preuves saison / faune / sécurité / formalités / santé. Ce niveau n'est pas suffisant pour devenir `shortlist`.

La promotion `longlist → shortlist` exige ici :

1. absence de gate bloquant `hold/fail` ;
2. recherche aérienne ciblée sur la fenêtre de voyage ou signal de marché explicitement qualifié `exact / nearby / month` ;
3. analyse du ou des aéroports de départ depuis Reims ;
4. cohérence entre gateway international et géométrie réelle de l'itinéraire ;
5. scénario porte-à-porte structuré, même si certains coûts ou segments restent `to_recheck` ;
6. compromis principal suffisamment documenté pour justifier un approfondissement par rapport aux autres candidates.

La promotion ne signifie pas :

- destination sélectionnée ;
- classement robuste ;
- tarif confirmé sur les dates exactes ;
- voyage réservable ;
- observation de faune garantie.

## Shortlist du 6 septembre 2026

Trois dossiers satisfont actuellement ce niveau d'approfondissement :

- `south-africa-nov-2026` ;
- `komodo-flores-nov-2026` ;
- `seychelles-nov-2026`.

Leurs scores centraux restent proches et leurs plages d'incertitude se recouvrent. La shortlist est donc une décision de **profondeur de recherche**, pas une conclusion selon laquelle ces trois destinations seraient démontrées supérieures à toutes les autres.

## Sélection locale dans l'interface

Le comparateur conserve aussi une sélection personnelle dans `localStorage` (`atlas-destination-shortlist:v1`). Cette sélection locale est un outil utilisateur distinct du lifecycle versionné dans Git. Elle ne doit pas modifier automatiquement `data/catalog.json`.

À terme, l'UI doit nommer explicitement cette fonction « sélection locale » ou « favoris » pour éviter la confusion avec le statut de maturité `shortlist`.
