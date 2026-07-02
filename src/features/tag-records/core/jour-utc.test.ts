import { describe, expect, it } from "vitest";
import { aujourdhuiUtc } from "./jour-utc";

describe("aujourdhuiUtc", () => {
  it("renvoie minuit UTC du jour civil de la référence", () => {
    // 15 mars 2026 à 14h37 heure locale, quel que soit le fuseau du runner
    const ref = new Date(2026, 2, 15, 14, 37, 22);
    const jour = aujourdhuiUtc(ref);
    expect(jour.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("garde le jour civil local même en fin de journée", () => {
    const ref = new Date(2026, 11, 31, 23, 59, 59);
    expect(aujourdhuiUtc(ref).toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("gère les débuts de mois et d'année", () => {
    const ref = new Date(2026, 0, 1, 0, 0, 1);
    expect(aujourdhuiUtc(ref).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("sans argument, renvoie une date à minuit UTC pile", () => {
    const jour = aujourdhuiUtc();
    expect(jour.getUTCHours()).toBe(0);
    expect(jour.getUTCMinutes()).toBe(0);
    expect(jour.getUTCSeconds()).toBe(0);
    expect(jour.getUTCMilliseconds()).toBe(0);
  });
});
