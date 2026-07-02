# SPEC v4.3 : membres, invitations, pointage QR

Spécification d'implémentation (2026-07-02). Découle de VISION-LYNX-V4.md sections 8
(modèle, arbitrages rendus). Branche : v4.2-canaux-tags. Ne JAMAIS toucher main/prod.

## Étape 1 : membres de chantier et de canal (fondation)

### Schéma

- `enum Role` += `OUVRIER` (compte ultraléger relié à un enregistrement Ouvrier,
  interface pointage seule) et `SOUS_TRAITANT` (externe : son canal, ses tâches,
  SES documents, jamais les prix ni les échanges clients).
- `model ChantierMembre { id cuid, chantierId FK Chantier(membres) cascade,
  userId FK User(chantiersMembre) cascade, addedById FK User? SetNull,
  createdAt, @@unique([chantierId, userId]), @@index([userId]) }`.
  Le rôle reste GLOBAL sur User (pas de rôle par chantier pour l'instant, à
  raffiner si un jour quelqu'un est chef ici et ouvrier là).
- `model CanalMembre { canalId FK Canal(membres) cascade, userId FK User cascade,
  addedById FK User? SetNull, createdAt, @@id([canalId, userId]), @@index([userId]) }`.
- `model Ouvrier` += `userId String? @unique` FK User SetNull (liaison compte
  ouvrier, étape 2).

### Migration (SQL idempotent, timestampée)

1. ALTER TYPE Role ADD VALUE IF NOT EXISTS OUVRIER / SOUS_TRAITANT.
2. CREATE TABLE ChantierMembre / CanalMembre (IF NOT EXISTS + FKs).
3. Backfill ChantierMembre :
   - chaque Chantier.chefId non nul -> membre (id 'cm_chef_'||chantier.id) ;
   - chaque ligne _ChantierClients (m2m clients) -> membre ('cm_cli_'||...) ;
   - chaque User CONDUCTEUR actif -> membre de TOUS les chantiers non archivés
     ('cm_cond_'||user.id||'_'||chantier.id) : préserve le comportement courant,
     l'admin retirera ensuite. ADMIN : pas de lignes (voit tout par rôle).
4. Backfill CanalMembre : pour chaque canal non archivé, les membres internes
   (ADMIN exclu) du chantier ; pour les canaux CLIENT, y ajouter les clients
   membres du chantier.
5. ALTER TABLE Ouvrier ADD COLUMN IF NOT EXISTS userId + contrainte unique + FK.

### Règles d'accès (auth-helpers)

- getAccessibleChantierIds : ADMIN -> null (tout) ; tout autre rôle ->
  chantiers où ChantierMembre existe ; CLIENT : union avec l'ancienne relation
  chantiersClient tant que la double écriture existe.
- requireChantierAccess : ADMIN ok ; sinon membership (CLIENT : membership OU
  legacy chantiersClient).
- Nouveau garde `requireChantierManager(user, chantierId)` : ADMIN, ou
  CONDUCTEUR membre du chantier. Remplace requireAdminOrConducteur pour les
  actions LOCALES à un chantier (gérer membres, canaux, valider demandes du
  chantier). requireAdminOrConducteur reste pour le global (créer un chantier).

### Brique src/features/membership

- core/membership-policy.ts (PUR) : `canManageMembers(role, isMemberConducteur)`,
  `canJoinCanal(userRole, canalVisibility)` (la borne dure : CLIENT ->
  visibility CLIENT uniquement ; SOUS_TRAITANT -> SOUS_TRAITANT uniquement ;
  internes -> tout) + tests vitest exhaustifs.
- server/membre-actions.ts : addChantierMembre, removeChantierMembre (retrait
  cascade : supprime aussi ses CanalMembre du chantier ; refuse de retirer le
  dernier conducteur si des canaux existent ? non : l'admin reste gestionnaire),
  addCanalMembre (borne dure appliquée ; le user doit être membre du chantier),
  removeCanalMembre (refus sur canal Général). Audit à chaque action
  (MEMBRE_AJOUTE, MEMBRE_RETIRE, CANAL_MEMBRE_AJOUTE, CANAL_MEMBRE_RETIRE).
- server/membre-queries.ts : listChantierMembres (avec rôle, pour l'UI),
  listCanalMembres, isChantierMembre.
- components/ : MembresSheet (fiche chantier : liste par rôle, ajout par
  sélection d'utilisateur ACTIVE, retrait) ; CanalMembresDialog (depuis la
  barre de canaux : membres du canal, ajout parmi les membres du chantier
  éligibles par la borne dure).

### Canaux (features/messaging, révision)

- canSeeChannel(role, visibility) RESTE (classe de sécurité).
- listChannelsFor devient : ADMIN -> tous les canaux du chantier ;
  CONDUCTEUR membre -> tous ; autres -> Général + canaux où CanalMembre.
  (Externes : jamais le Général, uniquement leurs canaux de leur classe.)
- getOrCreateGeneral inchangé (pas de membres explicites sur Général :
  l'équipe interne du chantier y est de droit).
- createChannel : après création, seed CanalMembre = créateur + (visibility
  INTERNE : tous les membres internes du chantier ; CLIENT : + clients
  membres ; SOUS_TRAITANT : personne d'autre, invitations manuelles).
- Poll route + markResourceRead : inchangés (périmètre canal déjà) mais le
  poll doit compter uniquement les canaux visibles du user (déjà à faire pour
  les clients, étape ouverture clients).

### UI

- Fiche chantier : section « Équipe du chantier » (membres par rôle, boutons
  ajouter/retirer, visible admin + conducteur membre).
- Messagerie : dans ChantierInfoSheet, bloc « Membres » (lecture) ; gestion
  complète dans la fiche chantier pour rester simple au téléphone.
- Canal : bouton « gérer les membres » (admin/conducteur) dans la barre de
  canaux ou le menu du canal.

## Étape 2 : pointage QR (après validation étape 1)

- `model PointageScan { id, chantierId, ouvrierId, type ARRIVEE|DEPART,
  atServer DateTime, lat/lng/precision Float?, deviceId String, flags String[] }`
- Chantier.pointageToken (révocable, régénérable) ; page print QR depuis la
  fiche chantier ; route publique /pointer/[token] (PWA) : 1re fois choix du
  nom + PIN (hash), appareil mémorisé (cookie signé) ; boutons Arrivée/Départ ;
  GPS demandé à l'instant du scan, refusable (flag SANS_POSITION).
- Anomalies calculées serveur : HORS_ZONE (si chantier géocodé), DOUBLE_SCAN,
  APPAREIL_PARTAGE, HORS_PLAGE. Écran conducteur : consolidation semaine ->
  génère/ajuste les Pointage existants (chaîne paie intacte), tout est
  corrigeable à la main.
- Contraintes CNIL (VISION section 8) : note d'information à rédiger, GPS
  ponctuel uniquement, repli manuel conservé, pas de photo.

## Étape 3 : périmètre chef + navigation

- Chef : retirer de sa nav les modules de gestion (inventaire matériel,
  commandes, locations) ; il garde : messagerie, rapports, incidents,
  demandes (matériel/commande/location en DEMANDE, validation conducteur/
  admin), déclarer sortie/retour terrain, ses chantiers seulement.
- OUVRIER : nav réduite à Pointage (+ profil).
- SOUS_TRAITANT : messagerie (ses canaux), ses tâches/plans, SES documents.
