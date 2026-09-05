# Comparateur de destinations

## Objectif

Le comparateur de la page d’accueil correspond à la **phase 1** du projet Atlas Voyage : comparer plusieurs destinations avant de développer un circuit en profondeur.

Données : `data/destination-comparison.json`  
Renderer : `assets/js/destination-compare.js`

Les voyages restent définis dans `data/catalog.json` et `data/trips/*.json`. Le comparateur ne duplique que les éléments nécessaires à la décision initiale.

## Critères et pondérations par défaut

Les scores utilisent une échelle de 0 à 5 et les pondérations suivantes :

| Critère | Poids |
|---|---:|
| Faune | 20 % |
| Saison / météo | 15 % |
| Détente | 15 % |
| Plage | 10 % |
| Culture | 10 % |
| Gastronomie | 10 % |
| Sécurité | 10 % |
| Logistique | 10 % |

Somme : 100 %.

Les pondérations peuvent évoluer lorsque les priorités du voyage changent, mais elles doivent rester explicites et datées.

## Score final

Pour un critère `i` de score `s_i` entre 0 et 5 et de poids `w_i` :

```text
Score = 100 × Σ[(s_i / 5) × w_i] / Σ[w_i]
```

Avec une somme des poids égale à 100, cela revient à :

```text
Score = Σ[(s_i / 5) × w_i]
```

Le résultat est compris entre 0 et 100.

## Éléments volontairement non intégrés au score

Le **budget Confort recommandé** et le **temps porte-à-porte** sont affichés mais ne sont pas inclus dans le score par défaut.

Raison : ces valeurs sont déjà très visibles et peuvent être utilisées comme contraintes fortes plutôt que comme préférences. Un voyage très bien noté peut donc être écarté simplement parce qu’il dépasse le budget ou la durée de transport acceptable.

Cette séparation évite aussi de mélanger une préférence qualitative et une contrainte chiffrée dans un indice unique difficile à interpréter.

## Convention de notation

Les scores doivent être comparatifs entre les destinations étudiées pour le même projet :

- `0` : très mauvais / pratiquement absent ;
- `1` : faible ;
- `2` : inférieur à la moyenne ;
- `3` : correct ;
- `4` : bon ;
- `5` : excellent pour les priorités du voyage.

Le score de sécurité doit intégrer à la fois les risques objectifs et la facilité de voyager normalement avec des précautions raisonnables.

Le score logistique doit tenir compte notamment :

- du nombre de segments ;
- des transferts ;
- de la qualité des infrastructures ;
- de la robustesse des correspondances ;
- de la facilité de construire un circuit avec peu de changements d’hôtel.

## Traçabilité

Chaque comparaison doit fournir :

- `status` ;
- `checkedAt` ;
- budget Confort ;
- temps porte-à-porte ;
- résumé météo/saison ;
- avantages ;
- compromis.

Les démonstrations actuelles sont explicitement fictives et ne doivent pas être utilisées pour réserver ou choisir une destination réelle.
