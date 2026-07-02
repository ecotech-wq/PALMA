# Mission de nuit (2026-07-02 -> 03) : app prête à déployer

Mandat de Youssoufou (résumé fidèle) : « continue sur le reste en toute autonomie...
je te fais confiance sur les choix et tu as mes préférences suivant nos échanges.
Fais une analyse complète du fonctionnement et de l'utilisation comme le ferait un humain,
relève les défauts et corrige, avec l'objectif de faciliter la navigation et l'utilisation.
L'objectif des gars sur le terrain est de travailler, pas de passer du temps sur l'app.
Mais rends-la agréable à regarder. Demain je veux une app prête à déployer. »

Contraintes permanentes : branche v4.2-canaux-tags, JAMAIS main/prod ; mobile-first 375x812
(99 % téléphone) ; doctrine maquette-accueil (une question par écran, listes, couleur = état,
argent au 2e rideau, feuilles pas de popups) ; pas d'emojis UI ; pas de tiret cadratin ;
français accentué ; vérifier en navigateur authentifié avant chaque commit ; commits par thème ;
ne JAMAIS cocher une case de cette liste avant que le commit correspondant existe.

## Checklist (cocher UNIQUEMENT une fois le commit fait et vérifié)

- [x] A. (commit 0615344) BUG panneau « Créer » transparent chez lui (Firefox) : fond opaque
      INCONDITIONNEL (style inline calculé côté client, indépendant de la feuille de
      styles) sur TOUS les panneaux flottants : menu Créer, feuille « + » du composer,
      TagPicker, ChantierInfoSheet, popover Compiler rapport, sélecteur de réactions.
- [x] B. (commits c09cd3c partiel + 4745e5c) Mode discret PARTOUT : composant Montant sur paie, matériel, commandes,
      locations, chantiers (liste + fiche Finances), demandes, ouvriers, avances.
- [x] C. (commit c09cd3c) Fiche chantier en ONGLETS : Vue d'ensemble / Équipe / Documents / Finances.
- [x] D. (docs/AUDIT-UX-2026-07-03.md, 63 constats bruts a verifier) AUDIT UX « comme un humain » par rôle (workflow d'agents sur le code, moi au
      navigateur) : parcours ADMIN, CONDUCTEUR, CHEF (terrain d'abord), CLIENT.
      Relever : impasses de navigation, actions à plus de 2 gestes, écrans sans retour,
      interactions au survol seul, incohérences de vocabulaire, écrans surchargés.
      Consigner dans docs/AUDIT-UX-2026-07-03.md.
- [ ] E. Corriger les défauts de D, priorité terrain d'abord, par petits commits.
- [ ] F. `npm run build` de production : zéro erreur.
- [ ] G. Rapport final honnête : daily log + message du matin + ce qui reste
      (déploiement lui-même, note CNIL pointage, pointage QR étape 2, membres de canal UI).

## État au départ (23 h)

Commits du jour : aa61acc (messagerie WhatsApp), 1286440 (membres v4.3 étape 1),
da266ad (mode discret), 2ec4734 (accueil refondu), 097ba14 (+ accueil), 68814ca (relief menu).
152 tests verts, tsc 0. Serveur dev : preview 3200. Auth de vérification : login scripté
(email ym.ecotech@gmail.com + SEED_ADMIN_PASSWORD du .env sans guillemets), cookie posé via
mini-serveur local de redirection (les cookies ignorent les ports).

## Journal de nuit (append au fil de l'eau, avec les vrais hashes)

- 0615344 : panneaux opaques (A). c09cd3c : onglets fiche chantier (C) + une partie du
  balayage B embarquee par erreur (git add -A pendant que l'agent travaillait ; contenu
  correct, message incomplet, assume). 4745e5c : fin du balayage B (41 montants, 12 fichiers).
- Audit D : 63 constats bruts dans docs/AUDIT-UX-2026-07-03.md, TRIES par priorite.
  ATTENTION agents faillibles : au moins un constat est FAUX (le backHref de la fiche
  chantier existe). Verifier chaque constat dans le code avant de corriger, marquer
  CONFIRME/REJETE/CORRIGE (hash) dans le document.
- Reste : E (verifier puis corriger les P1-terrain d'abord), F (npm run build), G (rapport).
