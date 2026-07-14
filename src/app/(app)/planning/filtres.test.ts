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
  it("sans aucun filtre ni bornage : deletedAt et exclusion des perso d'autrui", () => {
    expect(construireWhereTaches({ accessibleIds: null })).toEqual({
      deletedAt: null,
      chantierId: { not: null },
    });
  });

  it("bornage seul : chantierId in (et jamais les tâches perso)", () => {
    expect(construireWhereTaches({ accessibleIds: ["c1", "c2"] })).toEqual({
      deletedAt: null,
      chantierId: { not: null },
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

  it("perso : sans filtre, les tâches du propriétaire s'ajoutent en OR", () => {
    expect(
      construireWhereTaches({ accessibleIds: ["c1"], persoUserId: "u1" })
    ).toEqual({
      deletedAt: null,
      OR: [
        {
          chantierId: { not: null },
          AND: [{ chantierId: { in: ["c1"] } }],
        },
        { proprietaireId: "u1" },
      ],
    });
  });

  it("perso : sans filtre ni bornage, périmètre chantier + ses perso", () => {
    expect(
      construireWhereTaches({ accessibleIds: null, persoUserId: "u1" })
    ).toEqual({
      deletedAt: null,
      OR: [{ chantierId: { not: null } }, { proprietaireId: "u1" }],
    });
  });

  it("perso : un filtre chantier actif les écarte (vue projet pure)", () => {
    const where = construireWhereTaches({
      accessibleIds: ["c1"],
      chantierId: "c1",
      persoUserId: "u1",
    });
    expect(where.OR).toBeUndefined();
    expect(where).toEqual({
      deletedAt: null,
      chantierId: { not: null },
      AND: [{ chantierId: { in: ["c1"] } }, { chantierId: "c1" }],
    });
  });

  it("perso : filtre équipe, ouvrier ou entreprise actif = pareil, écartées", () => {
    for (const extra of [
      { equipeId: "e1" },
      { ouvrierId: "o1" },
      { espaceId: "s1" },
    ]) {
      const where = construireWhereTaches({
        accessibleIds: null,
        persoUserId: "u1",
        ...extra,
      });
      expect(where.OR).toBeUndefined();
    }
  });

  it("perso : jamais celles des autres (pas de persoUserId = pas de perso)", () => {
    const where = construireWhereTaches({ accessibleIds: null });
    expect(where.OR).toBeUndefined();
    expect(where.chantierId).toEqual({ not: null });
  });
});
