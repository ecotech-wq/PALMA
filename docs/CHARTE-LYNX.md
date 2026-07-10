# Charte graphique LYNX (spec d'implémentation)

> ÉCARTS ASSUMÉS (décisions Youssoufou, 2026-07-10, priment sur la charte) :
> 1. Les NEUTRES chauds sont remplacés par des neutres FRAIS (gris-bleu :
>    encre #0e1116, surfaces #151a21/#1d242e, clair #f6f7f9), mode SOMBRE par
>    défaut. L'ambre signal, les sémantiques, le logo et la typo sont inchangés.
> 2. La couleur d'espace teinte AUSSI les états actifs de la navigation
>    (token --space-accent) comme repère anti-erreur d'entreprise.

Source : `C:\Projects\Lynx\LYNX plateforme de gestion` (decks Claude Design,
lus intégralement le 2026-07-10). Piste logo retenue : `1d` « L modulaire ».
Baseline : « L'œil sur le terrain : gestion, suivi et coordination. »
Règle de marque : « Deux formes, une règle : l'ambre est un signal. »

## 1. Palette et rôles

Neutres chauds (clair), l'ambre en signal, trois sémantiques d'état.

### Neutres, mode clair
| Rôle | Hex | Usage |
|---|---|---|
| encre | `#141414` | texte primaire, surface sombre de marque (tuiles, bouton primaire) |
| texte 2 | `#3D3A35` | texte secondaire |
| muet | `#6E6A63` | tertiaire, légendes |
| trait | `#DDDAD3` | bordures |
| papier | `#F5F4F1` | fond de page |
| surface | `#FFFFFF` | carte |
| surface 2 | `#EEECE7` | aplat subtil (survol secondaire, brouillon, piste de progression) |
| champ | `#FBFAF8` | fond de saisie |

### Neutres, mode sombre
encre/texte `#EDEAE4`, texte 2 `#A19C93`, muet `#4A463F`, trait `#2E2B27`,
surface `#1C1A18`, fond de page `#141414`.

### Ambre (accent = signal seulement, max ~5% écran, jamais en fond)
| Rôle | Hex |
|---|---|
| ambre fond clair | `#D98E1F` |
| ambre fond sombre | `#E8A33D` |
| ambre profond (liens, n° section) | `#B9781F` |
| ambre foncé (survol lien, texte ambre sur clair) | `#8F5C15` |
| ambre survol bouton (clair) | `#C57F15` |
| ambre survol bouton (sombre) | `#F2B14C` |
`::selection { background:#E8A33D; color:#141414 }`.

### Sémantiques (états uniquement)
Succès (validé/signé/payé) `#3D8B62` ; Alerte/erreur (retard/incident/rejet)
`#C4553F` ; Information `#4A72B8`. Variantes sombres : succès `#2E5B43`/`#CFE8DA`,
retard `#7A3A2C`/`#F2D4CC`.

Doctrine : « L'ambre est un signal, pas une décoration. » « Les sémantiques
sont réservées aux états. » Chroma alignée (oklch) entre ambre et sémantiques.

## 2. Typographie
`IBM Plex Sans` (400/500/600/700) pour ce qui se lit ; `IBM Plex Mono`
(400/500/600) pour ce qui se compte (mot LYNX, montants, dates, références,
étiquettes en capitales). « Ce qui se lit est en Sans, ce qui se compte est en
Mono. »

Échelle : titre d'écran Sans Bold 28/1.2 ; titre de section Sans SemiBold
20/1.3 ; corps Sans Regular 15/1.55 (min 15 px mobile) ; étiquette Mono SemiBold
11, capitales, interlettrage 0.12em ; montant Mono Medium 22. Mot LYNX : Mono
SemiBold, interlettrage 0.2em.

## 3. Logo (géométrie exacte, `viewBox="0 0 96 96"`)
Le L (encre `#141414`) : `points="20,12 44,12 44,60 84,60 84,84 20,84"`.
Le losange/œil (ambre `#D98E1F` clair, `#E8A33D` sombre) : `points="62,24 74,12 86,24 74,36"`.
Inversé : L `#EDEAE4` + losange `#E8A33D`.
Zone de protection = une largeur de losange (24 unités). Mini : monogramme seul
24 px ; lockup complet 90 px ; sous 24 px, monogramme seul.
Interdits : ne pas incliner, ne pas recolorer le losange, ne pas déformer, pas
d'ombre, jamais sur fond chargé.
Icône d'app : tuile toujours `#141414`, monogramme centré à 62 %, losange
`#E8A33D`, aucune variante claire. Badge notif système = pastille rouge `#C4553F`.

## 4. Iconographie
Grille 24 px, trait 2 px, terminaisons carrées, angles vifs, monochrome (trait
`#141414` clair / `#A19C93` sombre / `#E8A33D` si onglet actif). Losange ambre :
trois usages seulement (nouveau, actif, engagement).

## 5. Ton de voix
Court, concret, calme. Pas d'emoji, pas de « ! », pas de « cliquez ici ». On
nomme l'objet réel et la conséquence : « Signer la situation, engage le client. »

## 6. Marque blanche & espaces (règle centrale)
« LYNX colore le noyau, l'espace colore son coin. Encre, papier, ambre et
sémantiques appartiennent à la plateforme et ne varient jamais. La couleur d'un
espace n'apparaît que sur son avatar, sa pastille dans le sélecteur et l'entête
de ses documents. Aucun composant système (bouton, badge, navigation) ne prend
la couleur d'espace : on revend l'outil en changeant les avatars, pas la charte. »

Implémentation : la couleur d'espace vit dans une famille de tokens SÉPARÉE
(`--space-*`), jamais référencée par un composant système. Ne pas réutiliser un
hex sémantique comme couleur d'espace (l'avatar EcoTech `#3D8B62` de la maquette
= le vert « payé », collision à éviter).

## 7. Composants et rayons
Boutons hauteur 46 px, cible ≥ 44 px. Primaire = encre (`#141414`/texte
`#F5F4F1`, survol `#2E2B27`). Signal = ambre (le SEUL bouton ambre par écran :
signature/validation). Secondaire = bord 1.5 px encre, fond transparent.
Focus : trait `#141414` 1.5 px, pas de halo coloré.
Rayons : contrôles 9 px, cartes 12 px, plafond dur 12 px. « LYNX reste anguleux. »
Barre de progression : piste `#EEECE7`, remplissage encre `#141414` (pas ambre).
