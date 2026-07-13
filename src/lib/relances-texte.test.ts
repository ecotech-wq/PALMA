import { describe, it, expect } from "vitest";
import {
  genererTexteRelanceFacture,
  type DonneesTexteRelance,
} from "./relances-texte";

// Le texte de relance part chez le client (copié-collé par l'utilisateur) :
// on verrouille les informations obligatoires (référence, montant, échéance,
// ancienneté), la gradation des paliers (les pénalités et l'indemnité de
// 40 euros n'apparaissent qu'à partir de RELANCE_3) et le style (pas
// d'em-dash, formule de politesse présente).

function donnees(sur: Partial<DonneesTexteRelance> = {}): DonneesTexteRelance {
  return {
    reference: "FAC-2026-041",
    client: null,
    montantTTC: 850.5,
    resteDu: 850.5,
    dateEcheance: new Date(Date.UTC(2026, 5, 30)), // 30 juin 2026
    joursRetard: 13,
    palier: "RELANCE_2",
    ...sur,
  };
}

describe("genererTexteRelanceFacture", () => {
  it("porte la référence, le montant TTC, l'échéance et l'ancienneté", () => {
    const texte = genererTexteRelanceFacture(donnees());
    expect(texte).toContain("FAC-2026-041");
    expect(texte).toContain("850,50 euros");
    expect(texte).toContain("30/06/2026");
    expect(texte).toContain("13 jours");
  });

  it("RELANCE_2 : relance formelle SANS mention des pénalités ni des 40 euros", () => {
    const texte = genererTexteRelanceFacture(donnees({ palier: "RELANCE_2" }));
    expect(texte).toContain("Objet : relance concernant la facture");
    expect(texte).not.toContain("40 euros");
    expect(texte).not.toContain("pénalités de retard");
    expect(texte).not.toContain("mise en demeure");
  });

  it("RELANCE_3 : annonce les pénalités contractuelles et l'indemnité de 40 euros", () => {
    const texte = genererTexteRelanceFacture(
      donnees({ palier: "RELANCE_3", joursRetard: 22 })
    );
    expect(texte).toContain("dernière relance avant mise en demeure");
    expect(texte).toContain("pénalités de retard contractuelles");
    expect(texte).toContain("40 euros");
    expect(texte).toContain("L441-10");
    expect(texte).toContain("22 jours");
  });

  it("MISE_EN_DEMEURE : met en demeure sur le solde dû, pénalités et 40 euros", () => {
    const texte = genererTexteRelanceFacture(
      donnees({ palier: "MISE_EN_DEMEURE", joursRetard: 45, resteDu: 600.25 })
    );
    expect(texte).toContain("Objet : mise en demeure de payer");
    expect(texte).toContain("mettons en demeure");
    expect(texte).toContain("600,25 euros");
    expect(texte).toContain("pénalités de retard contractuelles");
    expect(texte).toContain("40 euros");
  });

  it("règlement partiel : le solde restant dû est distingué du TTC facturé", () => {
    const texte = genererTexteRelanceFacture(
      donnees({ montantTTC: 900, resteDu: 350.75 })
    );
    expect(texte).toContain("900,00 euros");
    expect(texte).toContain("solde restant dû");
    expect(texte).toContain("350,75 euros");
  });

  it("aucune mention de solde quand rien n'a été réglé", () => {
    const texte = genererTexteRelanceFacture(donnees());
    expect(texte).not.toContain("solde restant dû");
  });

  it("nomme le destinataire quand le client est connu", () => {
    const texte = genererTexteRelanceFacture(donnees({ client: "SCI Horizon" }));
    expect(texte).toContain("À l'attention de SCI Horizon");
  });

  it("singulier correct pour un seul jour de retard", () => {
    const texte = genererTexteRelanceFacture(
      donnees({ palier: "RELANCE_2", joursRetard: 1 })
    );
    expect(texte).toContain("depuis 1 jour.");
    expect(texte).not.toContain("1 jours");
  });

  it("style : jamais d'em-dash, formule de politesse toujours présente", () => {
    for (const palier of [
      "RELANCE_2",
      "RELANCE_3",
      "MISE_EN_DEMEURE",
    ] as const) {
      const texte = genererTexteRelanceFacture(donnees({ palier }));
      // Em-dash banni du style maison (caractère construit par code pour ne
      // pas l'introduire littéralement dans ce fichier).
      expect(texte).not.toContain(String.fromCharCode(0x2014));
      expect(texte).toContain(
        "Veuillez agréer, Madame, Monsieur, nos salutations distinguées."
      );
    }
  });
});
