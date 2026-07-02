# LYNX V4 : vision et fonctionnement cible

> Document de cadrage rédigé le 2026-07-02 à partir de la vision exprimée par Youssoufou,
> confrontée à l'existant (LYNX v3 en production chez Autonhome) et à l'état de l'art.
> Statut : PROPOSITION, à amender avec Youssoufou avant tout code.

## 1. La vision en quatre principes

1. **LYNX est générique** : un logiciel de gestion, de suivi et de coordination, qui
   s'applique à un chantier, à un projet de bureau d'études, à un dossier de permis de
   construire, ou à tout autre type de projet.
2. **Le fonctionnement est défini par l'utilisateur** : chaque entreprise active les
   fonctionnalités dont elle a besoin dans les paramètres. La même instance sert
   l'entreprise de construction ET le bureau d'études, et s'ouvre aux clients,
   sous-traitants et partenaires.
3. **La base est une messagerie** type Slack : tout s'y échange (messages, images,
   vocaux, alertes). Chaque projet a sa messagerie ; chaque messagerie contient des
   canaux d'échange.
4. **Le tag est le pont entre la conversation et la donnée** : chacun peut taguer ses
   messages selon ses droits, et le message est automatiquement rangé dans la rubrique
   correspondante (incident, tâche, réserve, dépense...).

## 2. Le modèle proposé

### Espaces (entreprises)
Un Espace = une entreprise (Autonhome, EcoTech...). Chaque espace a son branding, ses
membres, et ses paramètres : quels modules sont actifs, quels tags existent, quels types
de projets sont proposés. C'est le chantier « multi-entreprises » : LYNX v3 est
mono-entreprise par construction (AppSettings singleton).

### Projets typés
Un Projet appartient à un espace et porte un type : chantier, étude, permis, ou libre.
Le type est un GABARIT : il pré-remplit les canaux, les tags actifs et les modules
pertinents (un chantier propose pointage/matériel/PV ; une étude propose livrables/temps
passés/visas ; un permis propose pièces/échéances/relances administration).

### Messagerie et canaux
Chaque projet a sa messagerie, subdivisée en canaux (par défaut, selon le gabarit :
« général », « terrain », « photos » pour un chantier ; « conception », « client »
pour une étude). Deux natures de canaux :
- internes (l'équipe de l'entreprise),
- ouverts (client, sous-traitants, partenaires y sont invités).
La visibilité se règle PAR CANAL : c'est ce qui permet d'ouvrir LYNX aux externes sans
rien exposer du reste. Contenus : texte, images, vidéos, vocaux, documents, alertes.
LYNX v3 a déjà un fil par chantier avec photos, réactions et messages système : la
subdivision en canaux est une extension, pas une réécriture.

### Tags et rubriques (le cœur)
Un tag posé sur un message crée ou alimente une fiche dans la rubrique correspondante,
qui garde le lien vers le message d'origine (et sa conversation). Exemples :
- #incident -> fiche incident (module existant en v3)
- #tache -> tâche du planning (module existant)
- #reserve -> réserve du PV de réception (module existant)
- #depense -> ligne de dépense
- #pointage -> pointage du jour
- #decision -> journal des décisions
- #livrable -> livrable à indice (futur volet BE)
Les tags disponibles dépendent de l'espace, du type de projet et des DROITS de
l'utilisateur (un client peut taguer #reserve, pas #pointage). Le tag peut être posé à
l'écriture du message ou a posteriori par quelqu'un qui a le droit (le conducteur
classe le vocal du maçon). Les modules deviennent des VUES STRUCTURÉES de ce qui est né
dans la conversation ; l'inverse existe déjà en v3 (les modules postent des messages
système dans le fil).

### Rôles et accès
Rôles internes par espace (admin, conducteur, chef, collaborateur BE...) et rôles
externes par projet (client, sous-traitant). Trois niveaux de contrôle : l'espace
(membre ou pas), le canal (visible ou pas), le tag (autorisé ou pas). La logique v3
(4 rôles, prix masqués au chef, flags de visibilité client) est conservée et étendue.

## 3. Scénario vécu (chantier)

Le maçon envoie un vocal et deux photos dans le canal « terrain » du chantier Salajee :
« la poutre du R+1 est fissurée ». Le chef ajoute le tag #incident : une fiche incident
se crée avec les photos, l'auteur, l'heure, le lien vers la conversation. Le conducteur
la qualifie (gravité, action) depuis la rubrique Incidents ; la résolution est postée
automatiquement dans le canal. Le client, invité seulement au canal « client », n'a
rien vu de l'échange terrain ; il verra la ligne « incident résolu » dans son rapport
hebdomadaire, comme aujourd'hui.

## 4. Le chemin depuis LYNX v3 (rien n'est jeté)

- **v4.0 Espaces** : multi-entreprises + paramétrage des modules par espace
  (feature flags). Le plus gros chantier de schéma (tenant), fondation de tout.
- **v4.1 Canaux** : subdivision de la messagerie projet en canaux, visibilité par
  canal, invitations externes (client, sous-traitant).
- **v4.2 Tags -> rubriques** : le mécanisme central, d'abord sur 3 tags à fort
  retour : #tache, #incident, #reserve (les trois modules existent déjà).
- **v4.3 Riche média et alertes** : vocaux (enregistrement, lecture ; transcription
  en option plus tard), mentions, alertes fines par canal.
- **v4.4 Types de projets** : gabarits chantier / étude / permis, et arrivée du volet
  bureau d'études (temps passés, livrables, honoraires) comme modules activables.
- Le renommage PALMA -> LYNX s'exécute au début de v4.0 (marque en dur : manifest,
  sw.js, brand/, docs).

## 5. Garde-fous (leçons du marché)

- Le piège de la généricité : tout paramétrable = usine à gaz. On borne : les modules
  s'activent ou pas, les tags se choisissent dans un catalogue, les gabarits sont
  fournis. Pas de constructeur de workflow libre en v4.
- Le tag ne doit jamais être une contrainte : un message sans tag est normal ; le
  classement a posteriori est un droit du conducteur/admin. La conversation reste
  fluide, la structure est un bonus.
- La production Autonhome continue de tourner : chaque étape v4.x se migre avec
  migration testée et retour arrière possible.

## 6. Décisions ARRÊTÉES (Youssoufou, 2026-07-02)

1. **Tags : catalogue fermé**, paramétrable par espace.
2. **Canaux créés par le conducteur de travaux ou l'admin** uniquement.
3. **Client** (complété et validé le 2026-07-02) : par défaut le client voit le canal
   « client » (échange direct avec l'entreprise), les rapports hebdomadaires, les PV de
   réception et les réserves qu'il a lui-même posées, ET son volet contractuel et
   financier : **contrats, devis signés, situations de chantier (demandes d'acompte sur
   avancement), avec signature électronique** (le SignaturePad existant sert déjà aux
   rapports et PV ; on l'étend aux devis et situations). Rien d'autre ; chaque élément
   supplémentaire est un droit qu'on ouvre explicitement.
3bis. **Sous-traitant** (ajouté le 2026-07-02) : troisième type d'accès externe, distinct
   du client. Le sous-traitant voit : son canal dédié (échange avec l'entreprise), les
   tâches et plans qui le concernent, SES contrats et SES situations à lui (jamais les
   prix globaux du chantier ni les échanges client), et peut poser des tags limités
   (par exemple #avancement, #probleme) selon le catalogue. Jimmy et Alexis
   (maisonsapetitprix) relèvent de l'accès client ; les artisans relèvent de l'accès
   sous-traitant.
4. Vocaux : enregistrement simple d'abord (transcription plus tard).
5. **Jimmy et Alexis ne font pas partie de l'entreprise : accès client** (externes).
6. **On continue sur l'instance Autonhome** (preuve du concept tags d'abord), mais toute
   l'architecture doit rester prête pour d'autres entreprises (pas de nouveau code
   mono-entreprise ; tout nouveau modèle prévoit le rattachement futur à un espace).

## 7. Deux exigences d'architecture (non négociables)

1. **Marque blanche** : si LYNX est vendu un jour, chaque acheteur choisit son logo, sa
   charte graphique, ses couleurs. Donc AUCUNE couleur ni marque en dur dans le nouveau
   code : tokens de thème centralisés (comme lib/theme/brands.ts du portail), logo et
   nom d'application servis depuis la configuration de l'espace. Le renommage
   PALMA -> LYNX se fera par ce mécanisme (la marque devient une donnée).
2. **Fonctionnalités en classes réutilisables** : chaque fonctionnalité (messagerie,
   tags, canaux, incidents, pointage...) est un module autonome et transportable :
   logique métier pure séparée de l'interface, interfaces claires entre modules, pour
   pouvoir réutiliser une brique dans un autre projet (le portail Brain360 par exemple).
   Concrètement : un dossier par fonctionnalité (modèle, logique, actions, composants),
   zéro import croisé sauvage entre fonctionnalités, et les briques génériques
   (messagerie, tags) ignorantes du métier BTP qui les consomme.
