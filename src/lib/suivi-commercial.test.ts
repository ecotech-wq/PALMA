import { describe, it, expect } from "vitest";
import { calculerSituation, calculerEcheance } from "./suivi-commercial-calc";

// Le moteur de calcul est la source de vérité des montants du suivi financier :
// on le verrouille sur les cas métier (situation d'avancement, retenue de
// garantie, imputation d'acompte, autoliquidation, échéance).

describe("calculerSituation", () => {
  it("première situation à 30% d'un marché de 100 000, retenue 5%, TVA 20%", () => {
    const r = calculerSituation({
      montantReferenceHT: 100000,
      avancementCumulePct: 30,
      montantCumuleAnterieurHT: 0,
      tauxRetenueGarantie: 5,
      tauxTVA: 20,
    });
    expect(r.montantCumuleHT).toBe(30000);
    expect(r.montantPeriodeHT).toBe(30000);
    expect(r.retenueGarantiePeriode).toBe(1500); // 5% de 30000
    expect(r.baseTVA).toBe(28500); // 30000 - 1500
    expect(r.montantTVA).toBe(5700); // 20% de 28500
    expect(r.netAPayerPeriode).toBe(34200);
  });

  it("situation suivante ne facture que le DELTA d'avancement", () => {
    const r = calculerSituation({
      montantReferenceHT: 100000,
      avancementCumulePct: 55,
      montantCumuleAnterieurHT: 30000, // situation n-1 à 30%
      tauxRetenueGarantie: 5,
      tauxTVA: 20,
    });
    expect(r.montantCumuleHT).toBe(55000);
    expect(r.montantPeriodeHT).toBe(25000); // 55000 - 30000
    expect(r.retenueGarantiePeriode).toBe(1250);
  });

  it("impute un acompte sur le net, borné au montant de la période", () => {
    const r = calculerSituation({
      montantReferenceHT: 100000,
      avancementCumulePct: 10,
      montantCumuleAnterieurHT: 0,
      tauxRetenueGarantie: 0,
      imputationAcompte: 3000,
      tauxTVA: 20,
    });
    expect(r.montantPeriodeHT).toBe(10000);
    expect(r.imputationAcompte).toBe(3000);
    expect(r.baseTVA).toBe(7000); // 10000 - 0 retenue - 3000 acompte
    expect(r.montantTVA).toBe(1400);
    expect(r.netAPayerPeriode).toBe(8400);
  });

  it("jalon BE : forfait de phase, retenue nulle, TVA 20%", () => {
    const r = calculerSituation({
      montantReferenceHT: 8000, // forfait phase DET
      avancementCumulePct: 50,
      montantCumuleAnterieurHT: 0,
      tauxRetenueGarantie: 0,
      tauxTVA: 20,
    });
    expect(r.montantPeriodeHT).toBe(4000);
    expect(r.retenueGarantiePeriode).toBe(0);
    expect(r.netAPayerPeriode).toBe(4800);
  });

  it("autoliquidation : aucune TVA sur le net", () => {
    const r = calculerSituation({
      montantReferenceHT: 50000,
      avancementCumulePct: 20,
      montantCumuleAnterieurHT: 0,
      tauxRetenueGarantie: 5,
      tauxTVA: 20,
      autoliquidation: true,
    });
    expect(r.montantPeriodeHT).toBe(10000);
    expect(r.retenueGarantiePeriode).toBe(500);
    expect(r.montantTVA).toBe(0);
    expect(r.netAPayerPeriode).toBe(9500); // 10000 - 500, sans TVA
  });

  it("régularisation à la baisse : période négative, pas de retenue ni TVA négative", () => {
    const r = calculerSituation({
      montantReferenceHT: 100000,
      avancementCumulePct: 40,
      montantCumuleAnterieurHT: 45000, // on avait sur-facturé à 45%
      tauxRetenueGarantie: 5,
      tauxTVA: 20,
    });
    expect(r.montantPeriodeHT).toBe(-5000);
    expect(r.retenueGarantiePeriode).toBe(0);
    expect(r.montantTVA).toBe(0);
  });
});

describe("calculerEcheance", () => {
  it("délai simple de 30 jours à compter de la facture", () => {
    const d = calculerEcheance(new Date("2026-03-10T09:00:00Z"), 30, false);
    expect(d.toISOString().slice(0, 10)).toBe("2026-04-09");
  });

  it("fin de mois : reporte au dernier jour du mois atteint", () => {
    const d = calculerEcheance(new Date("2026-03-10T00:00:00Z"), 45, true);
    // +45 j -> 2026-04-24, fin de mois -> 2026-04-30
    expect(d.toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("borne à minuit UTC (pas de décalage d'un jour)", () => {
    const d = calculerEcheance(new Date("2026-03-10T23:30:00Z"), 30, false);
    expect(d.getUTCHours()).toBe(0);
    expect(d.toISOString().slice(0, 10)).toBe("2026-04-09");
  });
});
