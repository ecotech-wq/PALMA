import { describe, expect, it } from "vitest";
import { prochainNumero } from "./prochain-numero";

describe("prochainNumero", () => {
  it("renvoie 1 quand le PV n'a aucune réserve (max null)", () => {
    expect(prochainNumero(null)).toBe(1);
  });

  it("renvoie 1 quand le max est undefined", () => {
    expect(prochainNumero(undefined)).toBe(1);
  });

  it("incrémente le max existant", () => {
    expect(prochainNumero(1)).toBe(2);
    expect(prochainNumero(41)).toBe(42);
  });

  it("ne retombe pas sur 1 pour un max à 0 (0 est un max légitime)", () => {
    // ?? ne remplace que null/undefined : un max de 0 donne bien 1 aussi,
    // mais par incrément, pas par repli.
    expect(prochainNumero(0)).toBe(1);
  });
});
