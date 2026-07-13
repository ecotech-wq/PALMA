import { describe, it, expect } from "vitest";
import {
  classerFacture,
  classerDevis,
  classerSituation,
  classerRetenue,
  diffJours,
  type FactureAClasser,
  type DevisAClasser,
  type SituationAClasser,
  type RetenueAClasser,
} from "./relances-calc";

// Le moteur de relances repose entièrement sur cette classification : on
// verrouille les BORNES exactes de chaque palier et toutes les exclusions
// (statuts hors périmètre, dates absentes), en jours bornés à minuit UTC.

const JOUR = 24 * 3600 * 1000;
const AUJOURDHUI = new Date(Date.UTC(2026, 6, 13)); // 13 juillet 2026, minuit UTC

/** Date décalée de n jours par rapport à AUJOURDHUI (n > 0 = futur). */
function dans(n: number): Date {
  return new Date(AUJOURDHUI.getTime() + n * JOUR);
}

describe("diffJours", () => {
  it("compte en jours entiers, bornés au jour (l'heure ne compte pas)", () => {
    const matin = new Date(Date.UTC(2026, 6, 13, 2, 0));
    const soir = new Date(Date.UTC(2026, 6, 13, 21, 45));
    expect(diffJours(matin, soir)).toBe(0);
    expect(diffJours(new Date(Date.UTC(2026, 6, 10, 23, 59)), soir)).toBe(3);
    expect(diffJours(soir, new Date(Date.UTC(2026, 6, 10)))).toBe(-3);
  });
});

// ── Factures ─────────────────────────────────────────────────────────────────

function facture(
  echeanceDansJours: number | null,
  sur: Partial<FactureAClasser> = {}
): FactureAClasser {
  return {
    statutEmission: "EMISE",
    statutReglement: "NON_PAYEE",
    dateEcheance: echeanceDansJours === null ? null : dans(echeanceDansJours),
    ...sur,
  };
}

describe("classerFacture", () => {
  it("échéance à plus de 7 jours : rien à signaler", () => {
    expect(classerFacture(facture(8), AUJOURDHUI)).toBeNull();
    expect(classerFacture(facture(45), AUJOURDHUI)).toBeNull();
  });

  it("PREAVIS_ECHEANCE : échéance dans 0 à 7 jours à venir", () => {
    expect(classerFacture(facture(7), AUJOURDHUI)).toEqual({
      palier: "PREAVIS_ECHEANCE",
      jours: 7,
    });
    expect(classerFacture(facture(1), AUJOURDHUI)).toEqual({
      palier: "PREAVIS_ECHEANCE",
      jours: 1,
    });
    expect(classerFacture(facture(0), AUJOURDHUI)).toEqual({
      palier: "PREAVIS_ECHEANCE",
      jours: 0,
    });
  });

  it("RELANCE_1 : échue de 1 à 7 jours", () => {
    expect(classerFacture(facture(-1), AUJOURDHUI)).toEqual({
      palier: "RELANCE_1",
      jours: 1,
    });
    expect(classerFacture(facture(-7), AUJOURDHUI)).toEqual({
      palier: "RELANCE_1",
      jours: 7,
    });
  });

  it("RELANCE_2 : échue de 8 à 15 jours", () => {
    expect(classerFacture(facture(-8), AUJOURDHUI)).toEqual({
      palier: "RELANCE_2",
      jours: 8,
    });
    expect(classerFacture(facture(-15), AUJOURDHUI)).toEqual({
      palier: "RELANCE_2",
      jours: 15,
    });
  });

  it("RELANCE_3 : échue de 16 à 30 jours", () => {
    expect(classerFacture(facture(-16), AUJOURDHUI)).toEqual({
      palier: "RELANCE_3",
      jours: 16,
    });
    expect(classerFacture(facture(-30), AUJOURDHUI)).toEqual({
      palier: "RELANCE_3",
      jours: 30,
    });
  });

  it("MISE_EN_DEMEURE : échue au-delà de 30 jours", () => {
    expect(classerFacture(facture(-31), AUJOURDHUI)).toEqual({
      palier: "MISE_EN_DEMEURE",
      jours: 31,
    });
    expect(classerFacture(facture(-120), AUJOURDHUI)).toEqual({
      palier: "MISE_EN_DEMEURE",
      jours: 120,
    });
  });

  it("ENVOYEE + PARTIELLEMENT_PAYEE reste dans le périmètre", () => {
    const f = facture(-12, {
      statutEmission: "ENVOYEE",
      statutReglement: "PARTIELLEMENT_PAYEE",
    });
    expect(classerFacture(f, AUJOURDHUI)).toEqual({
      palier: "RELANCE_2",
      jours: 12,
    });
  });

  it("hors périmètre : brouillon, annulée, payée, sans échéance", () => {
    expect(
      classerFacture(facture(-12, { statutEmission: "BROUILLON" }), AUJOURDHUI)
    ).toBeNull();
    expect(
      classerFacture(facture(-12, { statutEmission: "ANNULEE" }), AUJOURDHUI)
    ).toBeNull();
    expect(
      classerFacture(facture(-12, { statutReglement: "PAYEE" }), AUJOURDHUI)
    ).toBeNull();
    expect(
      classerFacture(facture(-12, { statutReglement: "ANNULEE" }), AUJOURDHUI)
    ).toBeNull();
    expect(classerFacture(facture(null), AUJOURDHUI)).toBeNull();
  });

  it("l'heure du balayage ne décale pas le palier", () => {
    const finDeJournee = new Date(Date.UTC(2026, 6, 13, 18, 45));
    expect(classerFacture(facture(0), finDeJournee)).toEqual({
      palier: "PREAVIS_ECHEANCE",
      jours: 0,
    });
    expect(classerFacture(facture(-1), finDeJournee)).toEqual({
      palier: "RELANCE_1",
      jours: 1,
    });
  });
});

// ── Devis ────────────────────────────────────────────────────────────────────

function devis(sur: Partial<DevisAClasser> = {}): DevisAClasser {
  return {
    statut: "ENVOYE",
    dateEmission: null,
    dateEnvoi: null,
    prochaineRelance: null,
    ...sur,
  };
}

describe("classerDevis", () => {
  it("sans relance programmée : signalé 14 jours après l'envoi, pas avant", () => {
    expect(
      classerDevis(devis({ dateEnvoi: dans(-14) }), AUJOURDHUI)
    ).toEqual({ palier: "DEVIS_SANS_REPONSE", jours: 14 });
    expect(
      classerDevis(devis({ dateEnvoi: dans(-13) }), AUJOURDHUI)
    ).toBeNull();
  });

  it("sans dateEnvoi, l'émission sert de référence", () => {
    expect(
      classerDevis(devis({ dateEmission: dans(-20) }), AUJOURDHUI)
    ).toEqual({ palier: "DEVIS_SANS_REPONSE", jours: 20 });
  });

  it("dateEnvoi prime sur dateEmission pour le délai", () => {
    // Émis il y a 20 j mais envoyé il y a 10 j seulement : pas encore dû.
    const d = devis({ dateEmission: dans(-20), dateEnvoi: dans(-10) });
    expect(classerDevis(d, AUJOURDHUI)).toBeNull();
  });

  it("prochaineRelance échue (hier ou aujourd'hui) : signalé", () => {
    const d = devis({ dateEnvoi: dans(-30), prochaineRelance: dans(-1) });
    expect(classerDevis(d, AUJOURDHUI)).toEqual({
      palier: "DEVIS_SANS_REPONSE",
      jours: 30, // libellé : sans réponse depuis l'ENVOI
    });
    expect(
      classerDevis(
        devis({ dateEnvoi: dans(-30), prochaineRelance: dans(0) }),
        AUJOURDHUI
      )
    ).toEqual({ palier: "DEVIS_SANS_REPONSE", jours: 30 });
  });

  it("prochaineRelance dans le futur RETIENT le signalement, même envoi ancien", () => {
    const d = devis({ dateEnvoi: dans(-30), prochaineRelance: dans(3) });
    expect(classerDevis(d, AUJOURDHUI)).toBeNull();
  });

  it("prochaineRelance échue sans aucune date d'envoi : jours depuis la relance due", () => {
    const d = devis({ prochaineRelance: dans(-5) });
    expect(classerDevis(d, AUJOURDHUI)).toEqual({
      palier: "DEVIS_SANS_REPONSE",
      jours: 5,
    });
  });

  it("statut RELANCE surveillé aussi", () => {
    const d = devis({ statut: "RELANCE", dateEnvoi: dans(-15) });
    expect(classerDevis(d, AUJOURDHUI)).toEqual({
      palier: "DEVIS_SANS_REPONSE",
      jours: 15,
    });
  });

  it("hors périmètre : brouillon, accepté, refusé, expiré, sans aucune date", () => {
    for (const statut of ["BROUILLON", "ACCEPTE", "REFUSE", "EXPIRE"]) {
      expect(
        classerDevis(devis({ statut, dateEnvoi: dans(-60) }), AUJOURDHUI)
      ).toBeNull();
    }
    expect(classerDevis(devis(), AUJOURDHUI)).toBeNull();
  });
});

// ── Situations de travaux ────────────────────────────────────────────────────

function situation(sur: Partial<SituationAClasser> = {}): SituationAClasser {
  return {
    statut: "VISEE_MOE",
    factureId: null,
    dateVisaMOE: null,
    dateEtablissement: dans(-30),
    ...sur,
  };
}

describe("classerSituation", () => {
  it("visée MOE il y a 7 jours : à facturer ; 6 jours : pas encore", () => {
    expect(
      classerSituation(situation({ dateVisaMOE: dans(-7) }), AUJOURDHUI)
    ).toEqual({ palier: "SITUATION_A_FACTURER", jours: 7 });
    expect(
      classerSituation(
        situation({ dateVisaMOE: dans(-6), dateEtablissement: dans(-6) }),
        AUJOURDHUI
      )
    ).toBeNull();
  });

  it("ACCEPTEE sans visa : l'établissement sert de référence", () => {
    const s = situation({
      statut: "ACCEPTEE",
      dateVisaMOE: null,
      dateEtablissement: dans(-10),
    });
    expect(classerSituation(s, AUJOURDHUI)).toEqual({
      palier: "SITUATION_A_FACTURER",
      jours: 10,
    });
  });

  it("le visa MOE prime sur l'établissement", () => {
    // Établie il y a 30 j mais visée il y a 3 j seulement : pas encore dû.
    const s = situation({ dateVisaMOE: dans(-3), dateEtablissement: dans(-30) });
    expect(classerSituation(s, AUJOURDHUI)).toBeNull();
  });

  it("déjà facturée (factureId posé) : rien à signaler", () => {
    const s = situation({ dateVisaMOE: dans(-15), factureId: "fac_1" });
    expect(classerSituation(s, AUJOURDHUI)).toBeNull();
  });

  it("hors périmètre : brouillon, transmise, contestée, facturée", () => {
    for (const statut of ["BROUILLON", "TRANSMISE", "CONTESTEE", "FACTUREE"]) {
      expect(
        classerSituation(
          situation({ statut, dateVisaMOE: dans(-20) }),
          AUJOURDHUI
        )
      ).toBeNull();
    }
  });
});

// ── Retenues de garantie ─────────────────────────────────────────────────────

function retenue(sur: Partial<RetenueAClasser> = {}): RetenueAClasser {
  return {
    statut: "RETENUE",
    dateEcheanceLiberation: null,
    ...sur,
  };
}

describe("classerRetenue", () => {
  it("échéance dans 30 jours : signalée ; dans 31 jours : pas encore", () => {
    expect(
      classerRetenue(
        retenue({ dateEcheanceLiberation: dans(30) }),
        AUJOURDHUI
      )
    ).toEqual({ palier: "RETENUE_LIBERABLE", jours: 30 });
    expect(
      classerRetenue(
        retenue({ dateEcheanceLiberation: dans(31) }),
        AUJOURDHUI
      )
    ).toBeNull();
  });

  it("échéance aujourd'hui : jours 0 ; dépassée : jours négatifs", () => {
    expect(
      classerRetenue(retenue({ dateEcheanceLiberation: dans(0) }), AUJOURDHUI)
    ).toEqual({ palier: "RETENUE_LIBERABLE", jours: 0 });
    expect(
      classerRetenue(
        retenue({ dateEcheanceLiberation: dans(-10) }),
        AUJOURDHUI
      )
    ).toEqual({ palier: "RETENUE_LIBERABLE", jours: -10 });
  });

  it("CONSIGNEE surveillée aussi", () => {
    const r = retenue({
      statut: "CONSIGNEE",
      dateEcheanceLiberation: dans(5),
    });
    expect(classerRetenue(r, AUJOURDHUI)).toEqual({
      palier: "RETENUE_LIBERABLE",
      jours: 5,
    });
  });

  it("hors périmètre : cautionnée, libérée, opposition, sans échéance", () => {
    for (const statut of ["CAUTIONNEE", "LIBEREE", "OPPOSITION"]) {
      expect(
        classerRetenue(
          retenue({ statut, dateEcheanceLiberation: dans(5) }),
          AUJOURDHUI
        )
      ).toBeNull();
    }
    expect(classerRetenue(retenue(), AUJOURDHUI)).toBeNull();
  });
});
