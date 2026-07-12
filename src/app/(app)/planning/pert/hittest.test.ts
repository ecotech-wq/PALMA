import { describe, expect, it } from "vitest";
import { PERT_NODE_H, PERT_NODE_W } from "./disposition";
import { noeudSousPoint, pointDansNoeud } from "./hittest";

const A = { id: "A", x: 0, y: 0 };
const B = { id: "B", x: 300, y: 0 };
const C = { id: "C", x: 300, y: 200 };

describe("pointDansNoeud", () => {
  it("accepte l'intérieur et les bords du rectangle", () => {
    expect(pointDansNoeud(A, 10, 10)).toBe(true);
    expect(pointDansNoeud(A, 0, 0)).toBe(true);
    expect(pointDansNoeud(A, PERT_NODE_W, PERT_NODE_H)).toBe(true);
  });

  it("refuse un point hors du rectangle, même proche", () => {
    expect(pointDansNoeud(A, PERT_NODE_W + 1, 10)).toBe(false);
    expect(pointDansNoeud(A, 10, -1)).toBe(false);
  });
});

describe("noeudSousPoint", () => {
  it("retourne le noeud dont le rectangle contient le point", () => {
    expect(noeudSousPoint([A, B, C], 310, 210)).toBe("C");
    expect(noeudSousPoint([A, B, C], 310, 10)).toBe("B");
  });

  it("ne retient AUCUNE cible hors de tout rectangle (pas de repli à distance)", () => {
    // Point entre A et B : l'ancien accrochage par rayon aurait retenu
    // l'un des deux ; le hit-test rectangle ne retient rien.
    expect(noeudSousPoint([A, B, C], 260, 60)).toBeNull();
    // Juste sous C, à 1 unité du bord : toujours rien.
    expect(
      noeudSousPoint([A, B, C], 310, 200 + PERT_NODE_H + 1)
    ).toBeNull();
  });

  it("exclut le noeud source pendant un tirage", () => {
    expect(noeudSousPoint([A, B, C], 10, 10, "A")).toBeNull();
  });

  it("en cas de chevauchement, le dernier rendu (au-dessus) gagne", () => {
    const chevauche = { id: "D", x: 20, y: 20 };
    // D est rendu après A et recouvre le point (30, 30).
    expect(noeudSousPoint([A, chevauche], 30, 30)).toBe("D");
    // Ordre inverse : A est au-dessus.
    expect(noeudSousPoint([chevauche, A], 30, 30)).toBe("A");
  });

  it("gère une liste vide", () => {
    expect(noeudSousPoint([], 10, 10)).toBeNull();
  });
});
