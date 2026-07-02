import { describe, it, expect } from "vitest";
import { TAG_CATALOG, getTagDefinition, listTagsForRole } from "./catalog";
import { normalizeTagCode } from "./parser";

describe("TAG_CATALOG (catalogue fermé v4.2)", () => {
  it("contient exactement les trois tags décidés", () => {
    expect(TAG_CATALOG.map((t) => t.code)).toEqual(["tache", "incident", "reserve"]);
  });

  it("route chaque tag vers le bon module", () => {
    expect(getTagDefinition("tache")?.moduleCible).toBe("planning");
    expect(getTagDefinition("incident")?.moduleCible).toBe("incidents");
    expect(getTagDefinition("reserve")?.moduleCible).toBe("pv-reception");
  });

  it("chaque définition est complète (libellé, description, rôles)", () => {
    for (const definition of TAG_CATALOG) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.rolesAutorises.length).toBeGreaterThan(0);
    }
  });

  it("les codes sont déjà normalisés (minuscules, sans accents) et uniques", () => {
    const codes = TAG_CATALOG.map((t) => t.code);
    for (const code of codes) {
      expect(code).toBe(normalizeTagCode(code));
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getTagDefinition", () => {
  it("retrouve un tag par son code exact", () => {
    expect(getTagDefinition("incident")?.label).toBe("Incident");
  });

  it("tolère la casse et les accents en entrée", () => {
    expect(getTagDefinition("Tâche")?.code).toBe("tache");
    expect(getTagDefinition("RÉSERVE")?.code).toBe("reserve");
  });

  it("renvoie undefined pour un code inconnu", () => {
    expect(getTagDefinition("urgent")).toBeUndefined();
    expect(getTagDefinition("")).toBeUndefined();
  });
});

describe("listTagsForRole", () => {
  it("ADMIN et CONDUCTEUR voient les trois tags", () => {
    expect(listTagsForRole("ADMIN").map((t) => t.code)).toEqual(["tache", "incident", "reserve"]);
    expect(listTagsForRole("CONDUCTEUR").map((t) => t.code)).toEqual([
      "tache",
      "incident",
      "reserve",
    ]);
  });

  it("CHEF voit tâche et incident, mais pas réserve", () => {
    expect(listTagsForRole("CHEF").map((t) => t.code)).toEqual(["tache", "incident"]);
  });

  it("CLIENT ne voit que réserve", () => {
    expect(listTagsForRole("CLIENT").map((t) => t.code)).toEqual(["reserve"]);
  });
});
