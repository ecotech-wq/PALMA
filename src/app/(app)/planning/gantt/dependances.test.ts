import { describe, expect, it } from "vitest";
import {
  construireSuccesseurs,
  creeraitUnCycle,
  successeursTransitifs,
  type TacheGraphe,
} from "./dependances";

/** Chaîne A <- B <- C (B dépend de A, C dépend de B) + D isolée. */
const chaine: TacheGraphe[] = [
  { id: "A", dependances: [] },
  { id: "B", dependances: [{ id: "A" }] },
  { id: "C", dependances: [{ id: "B" }] },
  { id: "D" },
];

describe("construireSuccesseurs", () => {
  it("inverse la relation prédécesseur -> successeur", () => {
    const succ = construireSuccesseurs(chaine);
    expect(succ.get("A")).toEqual(["B"]);
    expect(succ.get("B")).toEqual(["C"]);
    expect(succ.get("C")).toBeUndefined();
    expect(succ.get("D")).toBeUndefined();
  });
});

describe("successeursTransitifs", () => {
  it("collecte la fermeture transitive sans inclure la tâche source", () => {
    const succ = construireSuccesseurs(chaine);
    expect([...successeursTransitifs("A", succ)].sort()).toEqual(["B", "C"]);
    expect([...successeursTransitifs("C", succ)]).toEqual([]);
  });

  it("gère un losange sans doublons (A -> B, A -> C, B/C -> D)", () => {
    const losange: TacheGraphe[] = [
      { id: "A" },
      { id: "B", dependances: [{ id: "A" }] },
      { id: "C", dependances: [{ id: "A" }] },
      { id: "D", dependances: [{ id: "B" }, { id: "C" }] },
    ];
    const succ = construireSuccesseurs(losange);
    expect([...successeursTransitifs("A", succ)].sort()).toEqual([
      "B",
      "C",
      "D",
    ]);
  });

  it("ne boucle pas sur un cycle existant en base", () => {
    const cyclique: TacheGraphe[] = [
      { id: "A", dependances: [{ id: "B" }] },
      { id: "B", dependances: [{ id: "A" }] },
    ];
    const succ = construireSuccesseurs(cyclique);
    expect([...successeursTransitifs("A", succ)]).toEqual(["B"]);
  });

  it("respecte la profondeur maximale", () => {
    const longue: TacheGraphe[] = [];
    for (let i = 0; i < 10; i++) {
      longue.push({
        id: `T${i}`,
        dependances: i > 0 ? [{ id: `T${i - 1}` }] : [],
      });
    }
    const succ = construireSuccesseurs(longue);
    expect(successeursTransitifs("T0", succ, 3).size).toBe(3);
  });
});

describe("creeraitUnCycle", () => {
  it("refuse l'auto-dépendance", () => {
    expect(creeraitUnCycle("A", "A", chaine)).toBe(true);
  });

  it("détecte le cycle direct (A dépendrait de C alors que C dépend de A)", () => {
    expect(creeraitUnCycle("A", "C", chaine)).toBe(true);
    expect(creeraitUnCycle("B", "C", chaine)).toBe(true);
  });

  it("accepte une dépendance saine", () => {
    expect(creeraitUnCycle("C", "A", chaine)).toBe(false);
    expect(creeraitUnCycle("D", "C", chaine)).toBe(false);
  });
});
