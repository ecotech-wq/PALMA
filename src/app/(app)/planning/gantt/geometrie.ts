/**
 * Géométrie pure du Gantt : rectangles de barres et ancres des flèches
 * de dépendance. Partagée entre le rendu (GanttChartV2) et les tests.
 *
 * Origine du module (bug 2026-07-14) : les flèches étaient ancrées à
 * `index * ROW_H` alors que les lignes rendues mesuraient 52 px en réel
 * (contenu de la cellule libellé + border-b), soit 8 px de dérive par
 * ligne : au-delà de 5 lignes, chaque pointe atterrissait sur la
 * MAUVAISE ligne, dans une cellule vide. La règle est désormais double :
 * ce module calcule toutes les coordonnées à partir de ROW_H, et le
 * composant pose `height: ROW_H` (border-box, bordure comprise) sur la
 * ligne elle-même pour que le rendu ne puisse plus s'en écarter.
 */

/** Hauteur totale d'une ligne Gantt, border-b comprise (border-box). */
export const ROW_H = 44;

export type RectBarre = { left: number; width: number };

/**
 * Rectangle horizontal d'une barre : left au bord gauche du jour de
 * début, largeur = durée moins un liseré de 4 px pour séparer deux
 * barres qui se suivent, bornée à 8 px mini (une tâche d'un jour à
 * l'échelle « mois », 4 px/jour, resterait sinon invisible).
 */
export function rectBarre(
  offset: number,
  duration: number,
  dayWidth: number
): RectBarre {
  return {
    left: offset * dayWidth,
    width: Math.max(8, duration * dayWidth - 4),
  };
}

export type AncresFleche = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

/**
 * Ancres d'une flèche de dépendance : elle PART du bord droit de la
 * barre du prédécesseur, au centre vertical de SA ligne, et ARRIVE au
 * bord gauche de la barre du dépendant, au centre vertical de SA ligne.
 * Le +2 px au départ décolle le trait du liseré de la barre.
 */
export function ancresFleche(args: {
  /** Ligne (index de rendu) et barre du prédécesseur. */
  depRow: number;
  depOffset: number;
  depDuration: number;
  /** Ligne (index de rendu) et barre du dépendant. */
  tacheRow: number;
  tacheOffset: number;
  dayWidth: number;
}): AncresFleche {
  const dep = rectBarre(args.depOffset, args.depDuration, args.dayWidth);
  return {
    fromX: dep.left + dep.width + 2,
    fromY: args.depRow * ROW_H + ROW_H / 2,
    toX: args.tacheOffset * args.dayWidth,
    toY: args.tacheRow * ROW_H + ROW_H / 2,
  };
}
