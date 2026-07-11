import { describe, expect, it } from "vitest";
import { construireWhereTaches, validerChantier } from "./filtres";

describe("validerChantier", () => {
  it("laisse passer sans bornage (régime hérité)", () => {
    expect(validerChantier("c1", null)).toBe("c1");
  });

  it("laisse passer un chantier accessible", () => {
    expect(validerChantier("c1", ["c1", "c2"])).toBe("c1");
  });

  it("ignore un chantier hors périmètre (pas de contournement par URL)", () => {
    expect(validerChantier("c3", ["c1", "c2"])).toBeUndefined();
  });

  it("ignore l'absence de paramètre", () => {
    expect(validerChantier(undefined, ["c1"])).toBeUndefined();
  });
});

describe("construireWhereTaches", () => {
  it("sans aucun filtre ni bornage : seulement deletedAt", () => {
    expect(construireWhereTaches({ accessibleIds: null })).toEqual({
      deletedAt: null,
    });
  });

  it("bornage seul : chantierId in", () => {
    expect(construireWhereTaches({ accessibleIds: ["c1", "c2"] })).toEqual({
      deletedAt: null,
      AND: [{ chantierId: { in: ["c1", "c2"] } }],
    });
  });

  it("bornage ET chantier coexistent (l'un n'écrase pas l'autre)", () => {
    const where = construireWhereTaches({
      accessibleIds: ["c1", "c2"],
      chantierId: "c1",
    });
    expect(where.AND).toEqual([
      { chantierId: { in: ["c1", "c2"] } },
      { chantierId: "c1" },
    ]);
  });

  it("ouvrier : relation TacheOuvrier via some", () => {
    const where = construireWhereTaches({
      accessibleIds: null,
      ouvrierId: "o1",
    });
    expect(where.AND).toEqual([{ ouvriers: { some: { ouvrierId: "o1" } } }]);
  });

  it("équipe et entreprise (espace) composés ensemble", () => {
    const where = construireWhereTaches({
      accessibleIds: ["c1"],
      equipeId: "e1",
      espaceId: "s1",
    });
    expect(where.AND).toEqual([
      { chantierId: { in: ["c1"] } },
      { equipeId: "e1" },
      { chantier: { espaceId: "s1" } },
    ]);
  });
});
