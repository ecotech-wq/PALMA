import { describe, it, expect } from "vitest";
import {
  seuilDepuisClasse,
  classerEssai,
  verdictConformite,
  codeEprouvette,
  MAX_EPROUVETTES_PRELEVEMENT,
  ECHEANCE_INFO_BETON_JOURS,
  ECHEANCE_NORMATIVE_BETON_JOURS,
  type EssaiAClasser,
} from "./labo-calc";

// Le flux béton chantier (essais automatiques J+7/J+28, verdict de
// conformité, relances ESSAI_ECHU) repose entièrement sur ces règles : on
// verrouille les BORNES exactes du classement, le parsing des classes de
// résistance et la neutralité du verdict sans seuil.

const JOUR = 24 * 3600 * 1000;
const AUJOURDHUI = new Date(Date.UTC(2026, 6, 14)); // 14 juillet 2026, minuit UTC

/** Date décalée de n jours par rapport à AUJOURDHUI (n > 0 = futur). */
function dans(n: number): Date {
  return new Date(AUJOURDHUI.getTime() + n * JOUR);
}

// ── Seuil depuis la classe prescrite ─────────────────────────────────────────

describe("seuilDepuisClasse", () => {
  it("classe courante : la valeur CYLINDRE (fck,cyl) fait référence", () => {
    expect(seuilDepuisClasse("C25/30")).toBe(25);
    expect(seuilDepuisClasse("C30/37")).toBe(30);
    expect(seuilDepuisClasse("C50/60")).toBe(50);
  });

  it("tolère la casse, les espaces et le béton léger", () => {
    expect(seuilDepuisClasse("c25/30")).toBe(25);
    expect(seuilDepuisClasse("  C 25 / 30  ")).toBe(25);
    expect(seuilDepuisClasse("LC25/28")).toBe(25);
    expect(seuilDepuisClasse("lc 16/18")).toBe(16);
  });

  it("à défaut du couple cylindre/cube : la valeur caractéristique seule", () => {
    expect(seuilDepuisClasse("C25")).toBe(25);
    expect(seuilDepuisClasse("25")).toBe(25);
    expect(seuilDepuisClasse("25/30")).toBe(25);
  });

  it("tolère un suffixe de prescription après la classe (exposition...)", () => {
    // Prescription réelle courante sur les bons de commande : classe de
    // résistance suivie de la classe d'exposition et de la consistance.
    expect(seuilDepuisClasse("C25/30 XC1")).toBe(25);
    expect(seuilDepuisClasse("C25/30 XC2(F) S3")).toBe(25);
    expect(seuilDepuisClasse("C30/37 XF1")).toBe(30);
  });

  it("éprouvette CUBIQUE : la valeur CUBE (fck,cube) fait référence", () => {
    expect(seuilDepuisClasse("C25/30", "Cube 15 cm")).toBe(30);
    expect(seuilDepuisClasse("C30/37", "CUBE 10x10x10")).toBe(37);
    expect(seuilDepuisClasse("C25/30 XC1", "Cube 15 cm")).toBe(30);
    // Sans valeur cube dans la classe : null, jamais le seuil cylindre
    // (5 MPa trop clément, verdict non conservatif).
    expect(seuilDepuisClasse("C25", "Cube 15 cm")).toBeNull();
    expect(seuilDepuisClasse("C25/0", "Cube 15 cm")).toBeNull();
    // Géométrie cylindre ou inconnue : référence cylindre inchangée.
    expect(seuilDepuisClasse("C25/30", "Cylindre 16x32 cm")).toBe(25);
    expect(seuilDepuisClasse("C25/30", null)).toBe(25);
  });

  it("classe illisible ou absente : null, jamais un seuil inventé", () => {
    expect(seuilDepuisClasse(null)).toBeNull();
    expect(seuilDepuisClasse(undefined)).toBeNull();
    expect(seuilDepuisClasse("")).toBeNull();
    expect(seuilDepuisClasse("XC1")).toBeNull();
    expect(seuilDepuisClasse("béton courant")).toBeNull();
    expect(seuilDepuisClasse("C0/0")).toBeNull();
  });
});

// ── Classement d'un essai par rapport à son échéance ─────────────────────────

function essai(
  echeanceDansJours: number | null,
  sur: Partial<EssaiAClasser> = {}
): EssaiAClasser {
  return {
    statut: "PLANIFIE",
    echeance: echeanceDansJours === null ? null : dans(echeanceDansJours),
    ...sur,
  };
}

describe("classerEssai", () => {
  it("échéance à plus de 3 jours : rien à signaler", () => {
    expect(classerEssai(essai(4), AUJOURDHUI)).toBeNull();
    expect(classerEssai(essai(28), AUJOURDHUI)).toBeNull();
  });

  it("A_ECHEANCE : échéance aujourd'hui ou dans 1 à 3 jours", () => {
    expect(classerEssai(essai(3), AUJOURDHUI)).toEqual({
      classe: "A_ECHEANCE",
      jours: 3,
    });
    expect(classerEssai(essai(1), AUJOURDHUI)).toEqual({
      classe: "A_ECHEANCE",
      jours: 1,
    });
    expect(classerEssai(essai(0), AUJOURDHUI)).toEqual({
      classe: "A_ECHEANCE",
      jours: 0,
    });
  });

  it("ECHU : échéance passée d'au moins 1 jour, statut PLANIFIE ou EN_COURS", () => {
    expect(classerEssai(essai(-1), AUJOURDHUI)).toEqual({
      classe: "ECHU",
      jours: 1,
    });
    expect(classerEssai(essai(-45), AUJOURDHUI)).toEqual({
      classe: "ECHU",
      jours: 45,
    });
    expect(
      classerEssai(essai(-2, { statut: "EN_COURS" }), AUJOURDHUI)
    ).toEqual({ classe: "ECHU", jours: 2 });
  });

  it("hors périmètre : validé, annulé, sans échéance", () => {
    expect(classerEssai(essai(-10, { statut: "VALIDE" }), AUJOURDHUI)).toBeNull();
    expect(classerEssai(essai(-10, { statut: "ANNULE" }), AUJOURDHUI)).toBeNull();
    expect(classerEssai(essai(null), AUJOURDHUI)).toBeNull();
  });

  it("l'heure du balayage ne décale pas le classement", () => {
    const finDeJournee = new Date(Date.UTC(2026, 6, 14, 18, 45));
    expect(classerEssai(essai(0), finDeJournee)).toEqual({
      classe: "A_ECHEANCE",
      jours: 0,
    });
    expect(classerEssai(essai(-1), finDeJournee)).toEqual({
      classe: "ECHU",
      jours: 1,
    });
  });
});

// ── Verdict de conformité ────────────────────────────────────────────────────

describe("verdictConformite", () => {
  it("conforme si la valeur atteint le seuil (borne incluse)", () => {
    expect(verdictConformite(25, 25)).toBe(true);
    expect(verdictConformite(31.2, 25)).toBe(true);
  });

  it("non conforme sous le seuil, même de peu", () => {
    expect(verdictConformite(24.9, 25)).toBe(false);
    expect(verdictConformite(0, 25)).toBe(false);
  });

  it("sans seuil exploitable : verdict neutre (null)", () => {
    expect(verdictConformite(30, null)).toBeNull();
    expect(verdictConformite(30, undefined)).toBeNull();
    expect(verdictConformite(30, Number.NaN)).toBeNull();
  });
});

// ── Codes d'éprouvettes et constantes du flux béton ──────────────────────────

describe("codeEprouvette", () => {
  it("suffixe alphabétique : A pour la première, L pour la douzième", () => {
    expect(codeEprouvette("BET-014", 0)).toBe("BET-014-A");
    expect(codeEprouvette("BET-014", 1)).toBe("BET-014-B");
    expect(codeEprouvette("BET-014", MAX_EPROUVETTES_PRELEVEMENT - 1)).toBe(
      "BET-014-L"
    );
  });

  it("lève hors bornes (au-delà du plafond d'éprouvettes)", () => {
    expect(() => codeEprouvette("BET-014", -1)).toThrow();
    expect(() =>
      codeEprouvette("BET-014", MAX_EPROUVETTES_PRELEVEMENT)
    ).toThrow();
  });
});

describe("échéances béton par défaut", () => {
  it("écrasement d'information à J+7, normatif à J+28", () => {
    expect(ECHEANCE_INFO_BETON_JOURS).toBe(7);
    expect(ECHEANCE_NORMATIVE_BETON_JOURS).toBe(28);
  });
});
