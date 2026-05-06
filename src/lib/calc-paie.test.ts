import { describe, it, expect } from "vitest";
import { calcMontantBrut, calcPaie } from "./calc-paie";

describe("calcMontantBrut", () => {
  it("FIXE : 1500€/mois × 23j = 1500€", () => {
    expect(calcMontantBrut("FIXE", 1500, 23)).toBe(1500);
  });

  it("FIXE : 1500€/mois × 15j = 978.26€", () => {
    expect(calcMontantBrut("FIXE", 1500, 15)).toBe(978.26);
  });

  it("FIXE : 1500€/mois × 0j = 0€", () => {
    expect(calcMontantBrut("FIXE", 1500, 0)).toBe(0);
  });

  it("MOIS : se comporte comme FIXE", () => {
    expect(calcMontantBrut("MOIS", 1500, 15)).toBe(978.26);
  });

  it("JOUR : 50€/jour × 15j = 750€", () => {
    expect(calcMontantBrut("JOUR", 50, 15)).toBe(750);
  });

  it("JOUR : 50€/jour × 0.5j = 25€ (demi-journée)", () => {
    expect(calcMontantBrut("JOUR", 50, 0.5)).toBe(25);
  });

  it("SEMAINE : 300€/sem × 6j = 300€ (1 semaine entière)", () => {
    expect(calcMontantBrut("SEMAINE", 300, 6)).toBe(300);
  });

  it("SEMAINE : 300€/sem × 12j = 600€ (2 semaines)", () => {
    expect(calcMontantBrut("SEMAINE", 300, 12)).toBe(600);
  });

  it("SEMAINE : 300€/sem × 3j = 150€ (demi-semaine)", () => {
    expect(calcMontantBrut("SEMAINE", 300, 3)).toBe(150);
  });

  it("FORFAIT : 800€ → 800€ peu importe les jours", () => {
    expect(calcMontantBrut("FORFAIT", 800, 0)).toBe(800);
    expect(calcMontantBrut("FORFAIT", 800, 5)).toBe(800);
    expect(calcMontantBrut("FORFAIT", 800, 100)).toBe(800);
  });

  it("rejette les valeurs négatives", () => {
    expect(() => calcMontantBrut("JOUR", -50, 5)).toThrow();
    expect(() => calcMontantBrut("JOUR", 50, -5)).toThrow();
  });
});

describe("calcPaie", () => {
  it("paiement journalier sans avance ni outil", () => {
    const r = calcPaie({
      typeContrat: "JOUR",
      tarifBase: 50,
      joursTravailles: 15,
      avances: [],
      outilsPersonnels: [],
    });
    expect(r.montantBrut).toBe(750);
    expect(r.avancesDeduites).toBe(0);
    expect(r.retenueOutil).toBe(0);
    expect(r.montantNet).toBe(750);
  });

  it("paiement fixe avec avance", () => {
    const r = calcPaie({
      typeContrat: "FIXE",
      tarifBase: 1500,
      joursTravailles: 15,
      avances: [{ id: "av1", montant: 200 }],
      outilsPersonnels: [],
    });
    expect(r.montantBrut).toBe(978.26);
    expect(r.avancesDeduites).toBe(200);
    expect(r.avancesIds).toEqual(["av1"]);
    expect(r.montantNet).toBe(778.26);
  });

  it("retenue outil : mensualité < restant dû", () => {
    const r = calcPaie({
      typeContrat: "JOUR",
      tarifBase: 50,
      joursTravailles: 15,
      avances: [],
      outilsPersonnels: [{ id: "o1", mensualite: 25, restantDu: 250 }],
    });
    expect(r.montantBrut).toBe(750);
    expect(r.retenueOutil).toBe(25);
    expect(r.retenuesParOutil).toEqual([{ outilId: "o1", montant: 25 }]);
    expect(r.montantNet).toBe(725);
  });

  it("retenue outil : mensualité > restant dû (dernière échéance)", () => {
    const r = calcPaie({
      typeContrat: "JOUR",
      tarifBase: 50,
      joursTravailles: 15,
      avances: [],
      outilsPersonnels: [{ id: "o1", mensualite: 25, restantDu: 10 }],
    });
    expect(r.retenueOutil).toBe(10);
    expect(r.retenuesParOutil).toEqual([{ outilId: "o1", montant: 10 }]);
    expect(r.montantNet).toBe(740);
  });

  it("scénario complet : fixe + 2 avances + 1 outil", () => {
    const r = calcPaie({
      typeContrat: "FIXE",
      tarifBase: 1500,
      joursTravailles: 23,
      avances: [
        { id: "av1", montant: 100 },
        { id: "av2", montant: 50 },
      ],
      outilsPersonnels: [{ id: "o1", mensualite: 30, restantDu: 200 }],
    });
    expect(r.montantBrut).toBe(1500);
    expect(r.avancesDeduites).toBe(150);
    expect(r.avancesIds).toEqual(["av1", "av2"]);
    expect(r.retenueOutil).toBe(30);
    expect(r.montantNet).toBe(1320);
  });

  it("forfait avec retenue outil", () => {
    const r = calcPaie({
      typeContrat: "FORFAIT",
      tarifBase: 800,
      joursTravailles: 0,
      avances: [],
      outilsPersonnels: [{ id: "o1", mensualite: 50, restantDu: 50 }],
    });
    expect(r.montantBrut).toBe(800);
    expect(r.retenueOutil).toBe(50);
    expect(r.montantNet).toBe(750);
  });

  it("net négatif si avances > brut (alerte UI)", () => {
    const r = calcPaie({
      typeContrat: "JOUR",
      tarifBase: 50,
      joursTravailles: 5, // 250€
      avances: [{ id: "av1", montant: 400 }],
      outilsPersonnels: [],
    });
    expect(r.montantBrut).toBe(250);
    expect(r.avancesDeduites).toBe(400);
    expect(r.montantNet).toBe(-150);
  });

  it("ignore une retenue outil de 0 (déjà soldé)", () => {
    const r = calcPaie({
      typeContrat: "JOUR",
      tarifBase: 50,
      joursTravailles: 15,
      avances: [],
      outilsPersonnels: [{ id: "o1", mensualite: 25, restantDu: 0 }],
    });
    expect(r.retenuesParOutil).toEqual([]);
    expect(r.retenueOutil).toBe(0);
    expect(r.montantNet).toBe(750);
  });
});
