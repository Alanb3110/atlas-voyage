# Sécurité et confidentialité

## État actuel — GitHub Pages public

La première version d’Atlas Voyage est publiée sur GitHub Pages. **Le site, le code et les fichiers JSON doivent donc être considérés comme publics.**

Même si l’URL n’est diffusée qu’à quelques personnes, cela ne constitue pas un contrôle d’accès.

### Données autorisées dans cette phase

- itinéraires ;
- hôtels et activités envisagés ;
- prix publics et estimations ;
- météo, formalités et sources ;
- commentaires de voyage ne contenant aucune donnée sensible.

### Données à ne pas stocker

- numéros de passeport ou pièces d’identité ;
- références de réservation nominatives ;
- données bancaires ;
- informations médicales personnelles ;
- adresses privées ;
- mots de passe ;
- clés API ou secrets.

## Pourquoi ne pas utiliser un simple mot de passe JavaScript ?

Un formulaire de mot de passe uniquement côté navigateur n’est pas une barrière de sécurité si les JSON/HTML sont servis publiquement : les ressources restent téléchargeables directement.

Ne jamais mettre un mot de passe, une clé privée ou une clé API secrète en clair dans le HTML, JavaScript ou JSON client.

## Évolution cible

L’application est volontairement statique et portable. Une migration ultérieure pourra conserver le même frontend et remplacer uniquement la couche d’hébergement.

Architecture cible possible :

**GitHub privé → Cloudflare Pages → domaine personnalisé → Cloudflare Access**

Une autre option est de chiffrer les fichiers de voyage côté client (par exemple AES-GCM avec clé dérivée d’un mot de passe), mais cette solution est plus complexe à exploiter et reste sensible à la robustesse du mot de passe.
