import { describe, expect, it } from "vitest";
import {
  calculerPositionsPert,
  ordonnerNiveauxParBarycentre,
  PERT_NODE_H,
  PERT_PADDING,
} from "./disposition";

describe("ordonnerNiveauxParBarycentre", () => {
  it("réordonne un niveau selon la ligne des prédécesseurs (décroisement)", () => {
    // A (ligne 0) -> a1, B (ligne 1) -> b1 ; le niveau 1 arrive croisé.
    const preds = new Map<string, string[]>([
      ["a1", ["A"]],
      ["b1", ["B"]],
    ]);
    const ordre = ordonnerNiveauxParBarycentre([["A", "B"], ["b1", "a1"]], preds);
    expect(ordre[0]).toEqual(["A", "B"]);
    expect(ordre[1]).toEqual(["a1", "b1"]);
  });

  it("laisse intact un graphe sans dépendances (tri stable)", () => {
    const ordre = ordonnerNiveauxParBarycentre(
      [["A", "B", "C"]],
      new Map<string, string[]>()
    );
    expect(ordre[0]).toEqual(["A", "B", "C"]);
  });

  it("ne modifie pas le tableau de niveaux passé en entrée", () => {
    const niveaux = [["A", "B"], ["b1", "a1"]];
    ordonnerNiveauxParBarycentre(
      niveaux,
      new Map<string, string[]>([
        ["a1", ["A"]],
        ["b1", ["B"]],
      ])
    );
    expect(niveaux[1]).toEqual(["b1", "a1"]);
  });
});

describe("calculerPositionsPert", () => {
  it("centre verticalement une colonne courte face à une colonne haute", () => {
    const { positions } = calculerPositionsPert([["A", "B"], ["C"]]);
    const yA = positions.get("A")!.y;
    const yB = positions.get("B")!.y;
    const yC = positions.get("C")!.y;
    // C est centré entre A et B : strictement en dessous du haut de A,
    // strictement au-dessus du haut de B.
    expect(yC).toBeGreaterThan(yA);
    expect(yC).toBeLessThan(yB);
  });

  it("calcule des dimensions couvrant tous les noeuds", () => {
    const { positions, largeur, hauteur } = calculerPositionsPert([
      ["A"],
      ["B", "C"],
    ]);
    for (const { x, y } of positions.values()) {
      expect(x).toBeGreaterThanOrEqual(PERT_PADDING);
      expect(y).toBeGreaterThanOrEqual(PERT_PADDING);
      expect(y + PERT_NODE_H).toBeLessThanOrEqual(hauteur - PERT_PADDING + 1);
    }
    expect(largeur).toBeGreaterThan(0);
  });
});
