/**
 * Hit-test des noeuds PERT en coordonnées MONDE : la cible d'un tirage de
 * lien (ou de tout pointage) est le noeud dont le RECTANGLE contient le
 * point, jamais un rattrapage à distance. L'ancien accrochage par rayon
 * constant à l'écran retenait une mauvaise carte à faible zoom (plusieurs
 * cartes tenaient dans le rayon) : constat Youssoufou 2026-07-11.
 *
 * Fonctions pures, sans accès DOM : testables unitairement.
 */

import { PERT_NODE_H, PERT_NODE_W } from "./disposition";

export type NoeudPositionne = { id: string; x: number; y: number };

/** Vrai si le point (x, y) est dans le rectangle du noeud (bords inclus). */
export function pointDansNoeud(
  noeud: NoeudPositionne,
  x: number,
  y: number
): boolean {
  return (
    x >= noeud.x &&
    x <= noeud.x + PERT_NODE_W &&
    y >= noeud.y &&
    y <= noeud.y + PERT_NODE_H
  );
}

/**
 * Noeud sous le point (x, y) en coordonnées monde, ou null si le point ne
 * tombe dans AUCUN rectangle (pas de repli sur le noeud le plus proche).
 * `noeuds` doit être fourni dans l'ordre de rendu : en cas de
 * chevauchement (positions posées à la main), le dernier de la liste
 * gagne, c'est celui dessiné au-dessus. `exclure` écarte le noeud source
 * pendant un tirage de lien.
 */
export function noeudSousPoint(
  noeuds: readonly NoeudPositionne[],
  x: number,
  y: number,
  exclure?: string
): string | null {
  let trouve: string | null = null;
  for (const n of noeuds) {
    if (n.id === exclure) continue;
    if (pointDansNoeud(n, x, y)) trouve = n.id;
  }
  return trouve;
}
