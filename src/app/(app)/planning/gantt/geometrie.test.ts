import { describe, expect, it } from "vitest";
import { ancresFleche, rectBarre, ROW_H } from "./geometrie";

/**
 * Non-régression sur la géométrie des flèches du Gantt (bug 2026-07-14 :
 * flèches pointant dans le vide). Invariants verrouillés ici :
 *  - une flèche part du bord droit de la barre du prédécesseur et arrive
 *    au bord gauche de la barre du dépendant (mêmes rectangles que le
 *    rendu, via rectBarre) ;
 *  - les ordonnées sont les centres des lignes à ROW_H d'écart exact.
 * Le composant pose height: ROW_H sur chaque ligne rendue (border-box) :
 * si quelqu'un retire ce verrou ou dérive ROW_H sans mettre à jour le
 * rendu, la dérive de 8 px par ligne du bug d'origine revient.
 */

describe("rectBarre", () => {
  it("place la barre au jour de début, largeur = durée moins 4 px de liseré", () => {
    // Échelle « jour » : 32 px/jour.
    expect(rectBarre(10, 5, 32)).toEqual({ left: 320, width: 156 });
  });

  it("borne la largeur à 8 px mini (tâche d'un jour à 4 px/jour)", () => {
    expect(rectBarre(3, 1, 4)).toEqual({ left: 12, width: 8 });
  });
});

describe("ancresFleche", () => {
  it("part du bord droit du prédécesseur, arrive au bord gauche du dépendant", () => {
    const dep = { row: 2, offset: 5, duration: 4 };
    const tache = { row: 7, offset: 12 };
    const dayWidth = 32;
    const a = ancresFleche({
      depRow: dep.row,
      depOffset: dep.offset,
      depDuration: dep.duration,
      tacheRow: tache.row,
      tacheOffset: tache.offset,
      dayWidth,
    });
    const rDep = rectBarre(dep.offset, dep.duration, dayWidth);
    const rTache = rectBarre(tache.offset, 3, dayWidth);
    // Départ : bord droit de la barre du prédécesseur (+2 px de décollage)
    expect(a.fromX).toBe(rDep.left + rDep.width + 2);
    // Arrivée : bord gauche de la barre du dépendant
    expect(a.toX).toBe(rTache.left);
    // Ordonnées : centre vertical de CHAQUE ligne, pas d'échelle dérivée
    expect(a.fromY).toBe(dep.row * ROW_H + ROW_H / 2);
    expect(a.toY).toBe(tache.row * ROW_H + ROW_H / 2);
    // L'écart vertical entre origine et pointe vaut EXACTEMENT le nombre
    // de lignes traversées fois ROW_H : c'est l'invariant qui était violé
    // par le rendu (lignes réelles à 52 px) dans le bug d'origine.
    expect(a.toY - a.fromY).toBe((tache.row - dep.row) * ROW_H);
  });

  it("reproduit le cas de la capture du 2026-07-14 (flèche rouge du seed EX)", () => {
    // « Élévation des murs du RDC » (ligne 22, j41, 14 jours) ->
    // « Poteaux et poutres BA du RDC » (ligne 24, j50), échelle jour.
    const a = ancresFleche({
      depRow: 22,
      depOffset: 41,
      depDuration: 14,
      tacheRow: 24,
      tacheOffset: 50,
      dayWidth: 32,
    });
    expect(a).toEqual({ fromX: 1758, fromY: 990, toX: 1600, toY: 1078 });
    // Avant correction, les lignes rendues faisaient ~52 px : la pointe
    // (y = 1078) atterrissait sur la ligne 20 (« Enduits et ponçage »,
    // floor(1078 / 52) = 20) au lieu de la ligne 24. Avec des lignes
    // verrouillées à ROW_H, elle retombe bien sur la ligne 24.
    expect(Math.floor(a.toY / ROW_H)).toBe(24);
    expect(Math.floor(a.fromY / ROW_H)).toBe(22);
  });

  it("ancre le départ au bord droit RÉEL même pour une barre écrasée à 8 px", () => {
    // Échelle « trimestre » (2 px/jour), tâche d'un jour : la barre est
    // élargie à 8 px ; la flèche doit partir de ce bord élargi, pas d'un
    // point calculé sur la durée brute (ancienne formule).
    const a = ancresFleche({
      depRow: 0,
      depOffset: 10,
      depDuration: 1,
      tacheRow: 1,
      tacheOffset: 30,
      dayWidth: 2,
    });
    const r = rectBarre(10, 1, 2);
    expect(a.fromX).toBe(r.left + r.width + 2); // 20 + 8 + 2 = 30
  });
});
