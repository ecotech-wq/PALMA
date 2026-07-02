import { describe, expect, it, vi } from "vitest";

// Test pur de la FORME du registre : aucune requête Prisma n'est émise.
// On substitue le module db pour éviter d'instancier un client Prisma
// (il exige DATABASE_URL au chargement), les adaptateurs ne touchent la
// base qu'à l'appel de createRecord, jamais à l'import.
vi.mock("@/lib/db", () => ({ db: {} }));

import { TAG_ADAPTERS, getAdapter } from "./registry";

describe("TAG_ADAPTERS", () => {
  it("expose exactement les trois codes du catalogue", () => {
    expect(Object.keys(TAG_ADAPTERS).sort()).toEqual([
      "incident",
      "reserve",
      "tache",
    ]);
  });

  it("chaque adaptateur porte le tagCode de sa clé et un createRecord", () => {
    for (const [code, adapter] of Object.entries(TAG_ADAPTERS)) {
      expect(adapter.tagCode).toBe(code);
      expect(typeof adapter.createRecord).toBe("function");
    }
  });
});

describe("getAdapter", () => {
  it("renvoie l'adaptateur d'un code connu", () => {
    expect(getAdapter("tache")).toBe(TAG_ADAPTERS["tache"]);
    expect(getAdapter("incident")).toBe(TAG_ADAPTERS["incident"]);
    expect(getAdapter("reserve")).toBe(TAG_ADAPTERS["reserve"]);
  });

  it("throw en français sur un code inconnu", () => {
    expect(() => getAdapter("commande")).toThrow(
      "Aucune fiche associée au tag « commande »"
    );
  });

  it("throw aussi sur une chaîne vide", () => {
    expect(() => getAdapter("")).toThrow(/Aucune fiche associée au tag/);
  });
});
