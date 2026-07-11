import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  buildWeek,
  chunkWeeks,
  dayKey,
  daysBetweenKeys,
  parseKey,
  shiftKey,
  startOfMonth,
  startOfWeek,
} from "./dates";

describe("dayKey / parseKey", () => {
  it("aller-retour stable, zéro-paddé", () => {
    const d = new Date(2026, 6, 9); // 9 juillet 2026
    expect(dayKey(d)).toBe("2026-07-09");
    expect(dayKey(parseKey("2026-07-09"))).toBe("2026-07-09");
    expect(dayKey(parseKey("2026-01-01"))).toBe("2026-01-01");
  });

  it("la comparaison lexicographique des clés suit la chronologie", () => {
    expect("2026-07-09" < "2026-07-10").toBe(true);
    expect("2026-09-30" < "2026-10-01").toBe(true);
    expect("2025-12-31" < "2026-01-01").toBe(true);
  });
});

describe("daysBetweenKeys / shiftKey", () => {
  it("compte les jours entiers (b - a), y compris à travers un mois", () => {
    expect(daysBetweenKeys("2026-07-09", "2026-07-12")).toBe(3);
    expect(daysBetweenKeys("2026-07-12", "2026-07-09")).toBe(-3);
    expect(daysBetweenKeys("2026-07-30", "2026-08-02")).toBe(3);
  });

  it("décale une clé en franchissant mois et années", () => {
    expect(shiftKey("2026-07-30", 3)).toBe("2026-08-02");
    expect(shiftKey("2026-01-01", -1)).toBe("2025-12-31");
    // Franchit le changement d'heure d'été européen (29 mars 2026).
    expect(shiftKey("2026-03-28", 2)).toBe("2026-03-30");
  });
});

describe("startOfWeek / startOfMonth", () => {
  it("renvoie le lundi de la semaine (ISO)", () => {
    // Le 9 juillet 2026 est un jeudi ; son lundi est le 6.
    expect(dayKey(startOfWeek(new Date(2026, 6, 9)))).toBe("2026-07-06");
    // Un dimanche appartient à la semaine commencée le lundi précédent.
    expect(dayKey(startOfWeek(new Date(2026, 6, 12)))).toBe("2026-07-06");
    // Un lundi est son propre début de semaine.
    expect(dayKey(startOfWeek(new Date(2026, 6, 6)))).toBe("2026-07-06");
  });

  it("startOfMonth ramène au 1er du mois", () => {
    expect(dayKey(startOfMonth(new Date(2026, 6, 9)))).toBe("2026-07-01");
  });
});

describe("buildMonthGrid / buildWeek / chunkWeeks", () => {
  it("grille de 42 jours commençant un lundi et couvrant le mois", () => {
    const grid = buildMonthGrid(new Date(2026, 6, 1)); // juillet 2026
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1); // lundi
    // Juillet 2026 commence un mercredi : la grille remonte au lundi 29 juin.
    expect(dayKey(grid[0])).toBe("2026-06-29");
    expect(dayKey(grid[41])).toBe("2026-08-09");
  });

  it("buildWeek renvoie 7 jours consécutifs à partir du lundi", () => {
    const week = buildWeek(new Date(2026, 6, 9));
    expect(week.map(dayKey)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("chunkWeeks découpe la grille en 6 semaines de 7", () => {
    const weeks = chunkWeeks(buildMonthGrid(new Date(2026, 6, 1)));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(dayKey(weeks[1][0])).toBe("2026-07-06");
  });
});
