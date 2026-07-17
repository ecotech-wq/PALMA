import { describe, expect, it } from "vitest";
import {
  borneCommandesParEspace,
  borneLocationsParEspace,
  borneSortiesParEspace,
  nombreProtege,
} from "./visibilite-guards";

describe("borneCommandesParEspace", () => {
  it("régime hérité (null) : aucun bornage", () => {
    expect(borneCommandesParEspace(null)).toEqual({});
  });

  it("borne par le chantier de la commande", () => {
    expect(borneCommandesParEspace(["s1", "s2"])).toEqual({
      chantier: { espaceId: { in: ["s1", "s2"] } },
    });
  });

  it("liste vide = deny (aucun chantier ne matche in [])", () => {
    expect(borneCommandesParEspace([])).toEqual({
      chantier: { espaceId: { in: [] } },
    });
  });
});

describe("borneLocationsParEspace", () => {
  it("régime hérité (null) : aucun bornage", () => {
    expect(borneLocationsParEspace(null)).toEqual({});
  });

  it("garde les locations du chantier de l'espace ET les orphelines", () => {
    expect(borneLocationsParEspace(["s1"])).toEqual({
      OR: [
        { chantierId: null },
        { chantier: { espaceId: { in: ["s1"] } } },
      ],
    });
  });
});

describe("borneSortiesParEspace", () => {
  it("régime hérité (null) : aucun bornage", () => {
    expect(borneSortiesParEspace(null)).toEqual({});
  });

  it("frontière par chantier OU équipe, orphelines totales visibles", () => {
    expect(borneSortiesParEspace(["s1"])).toEqual({
      OR: [
        { chantier: { espaceId: { in: ["s1"] } } },
        { equipe: { espaceId: { in: ["s1"] } } },
        { AND: [{ chantierId: null }, { equipeId: null }] },
      ],
    });
  });

  it("une sortie rattachée à un chantier d'un autre espace ne matche pas", () => {
    // Le fragment ne contient aucun OR « attrape-tout » sur chantierId seul :
    // un chantier hors espace ne satisfait ni la 1re ni la 3e branche.
    const borne = borneSortiesParEspace(["s1"]);
    const branches = (borne as { OR: unknown[] }).OR;
    expect(branches).toHaveLength(3);
    expect(branches).not.toContainEqual({ chantierId: { not: null } });
  });
});

describe("nombreProtege (champs budget / tarif sans hidden input)", () => {
  it("non autorisé : undefined même si une valeur est soumise (payload forgé)", () => {
    expect(nombreProtege(false, "9999")).toBeUndefined();
  });

  it("champ absent du FormData (null) : undefined, valeur en base conservée", () => {
    expect(nombreProtege(true, null)).toBeUndefined();
  });

  it("champ vide : undefined, valeur en base conservée", () => {
    expect(nombreProtege(true, "")).toBeUndefined();
  });

  it("valeur soumise valide : nombre", () => {
    expect(nombreProtege(true, "1250.50")).toBe(1250.5);
    expect(nombreProtege(true, "0")).toBe(0);
  });

  it("valeur négative ou non numérique : rejet", () => {
    expect(() => nombreProtege(true, "-5")).toThrow();
    expect(() => nombreProtege(true, "abc")).toThrow();
  });
});
