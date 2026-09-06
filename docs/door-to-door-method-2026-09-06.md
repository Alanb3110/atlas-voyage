# Méthode — porte-à-porte de la shortlist

Date : 2026-09-06.

## Périmètre

Le porte-à-porte couvre :

- à l'aller : Reims → première base du circuit ;
- au retour : dernière base du circuit → Reims.

Les transferts entre étapes du circuit restent dans le dossier d'itinéraire et ne sont pas comptés dans ce bloc.

## Temps

Pour une direction contenant `n` segments obligatoires :

`T_low = Σ t_i,low`

`T_high = Σ t_i,high`

La plage n'est qualifiée de complète que si chaque segment `required=true` possède une durée numérique. Sinon Atlas affiche uniquement la somme partielle connue avec un symbole `≥` et liste les segments manquants.

La marge aéroport commune de 180 min est actuellement une **hypothèse de comparaison**. Elle devra être remplacée par une marge adaptée au vol/horaire réellement sélectionné.

## Coûts

Même règle : le total n'est complet que si chaque poste obligatoire possède un montant numérique compatible avec le scénario.

Un prix aérien `observed_nearby` ou `observed_month` peut contribuer au **sous-total chiffré**, mais ne devient pas pour autant un devis exact sur 05–24/11/2026.

Un tarif `published_floor_incomplete` est une borne basse publique, pas un prix final. Le rendu l'inclut seulement dans le sous-total chiffré et conserve le scénario comme incomplet.

## Géométrie des scénarios

- Afrique du Sud : open-jaw CPT à l'arrivée / DUR au retour ; le scan JNB reste un signal prix uniquement.
- Seychelles : SEZ A/R ; à l'aller, connexion domestique vers PRI puisque la première base est Praslin.
- Bali/Komodo : DPS A/R ; à l'aller, route vers Ubud. Le retour reste incomplet tant que Sanur ou Lembongan n'est pas définitivement choisi comme dernière base.

## Interprétation

Les scénarios sont destinés à rendre visibles les inconnues avant le stade `bookable`, pas à produire prématurément un chiffre complet. Une option ne peut être promue sur la base d'un coût ou d'un temps dont des segments obligatoires sont absents.
