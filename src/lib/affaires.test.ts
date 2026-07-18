import { describe, expect, it } from "vitest";
import {
  estDormante,
  joursDansEtape,
  parseChecklist,
  texteTraceActionConfiee,
  texteTracePiece,
  texteTraceProchaineAction,
  texteTraceResponsable,
  valeurPipeline,
  SEUIL_DORMANCE_JOURS,
} from "./affaires";

// Jour de référence des tests : un mercredi quelconque, à une heure non nulle
// pour vérifier que la classification borne bien au jour.
const AUJOURDHUI = new Date("2026-07-17T14:35:00.000Z");

function jourUtc(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

// Les pipelines par typologie (constantes historiques) sont devenus des
// DONNÉES par espace : leurs modèles par défaut et leurs helpers sont
// désormais testés dans pipelines.test.ts.

describe("parseChecklist", () => {
  it("relit une checklist stockée en Json", () => {
    expect(
      parseChecklist([
        { cle: "cadastre", libelle: "Plan cadastral", fait: true },
        { cle: "topo", libelle: "Relevé topographique", fait: false },
      ])
    ).toEqual([
      { cle: "cadastre", libelle: "Plan cadastral", fait: true },
      { cle: "topo", libelle: "Relevé topographique", fait: false },
    ]);
  });

  it("tolère les données inattendues sans lever", () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist("n'importe quoi")).toEqual([]);
    expect(parseChecklist([{ cle: 12 }, null, { cle: "a", libelle: "A" }]))
      .toEqual([{ cle: "a", libelle: "A", fait: false }]);
  });
});

describe("estDormante", () => {
  it("signale une prochaine action échue, avec le retard en jours", () => {
    const c = estDormante(
      {
        statut: "EN_COURS",
        prochaineActionLe: jourUtc("2026-07-14"),
        etapeDepuis: jourUtc("2026-07-01"),
      },
      AUJOURDHUI
    );
    expect(c).toEqual({ motif: "ACTION_EN_RETARD", jours: 3 });
  });

  it("ne signale pas une action due aujourd'hui ni à venir", () => {
    const base = { statut: "EN_COURS", etapeDepuis: jourUtc("2026-01-01") };
    expect(
      estDormante({ ...base, prochaineActionLe: jourUtc("2026-07-17") }, AUJOURDHUI)
    ).toBeNull();
    expect(
      estDormante({ ...base, prochaineActionLe: jourUtc("2026-08-01") }, AUJOURDHUI)
    ).toBeNull();
  });

  it("une action planifiée protège de la dormance même après 14 j d'étape", () => {
    // etapeDepuis très ancien mais action future : l'affaire est pilotée.
    expect(
      estDormante(
        {
          statut: "EN_COURS",
          prochaineActionLe: jourUtc("2026-07-20"),
          etapeDepuis: jourUtc("2026-05-01"),
        },
        AUJOURDHUI
      )
    ).toBeNull();
  });

  it("signale l'absence de prochaine action après 14 j dans l'étape", () => {
    expect(
      estDormante(
        {
          statut: "EN_COURS",
          prochaineActionLe: null,
          etapeDepuis: jourUtc("2026-07-03"),
        },
        AUJOURDHUI
      )
    ).toEqual({ motif: "SANS_ACTION", jours: SEUIL_DORMANCE_JOURS });
    // 13 jours : encore active.
    expect(
      estDormante(
        {
          statut: "EN_COURS",
          prochaineActionLe: null,
          etapeDepuis: jourUtc("2026-07-04"),
        },
        AUJOURDHUI
      )
    ).toBeNull();
  });

  it("ignore les affaires gagnées ou perdues", () => {
    for (const statut of ["GAGNEE", "PERDUE"]) {
      expect(
        estDormante(
          {
            statut,
            prochaineActionLe: jourUtc("2026-01-01"),
            etapeDepuis: jourUtc("2026-01-01"),
          },
          AUJOURDHUI
        )
      ).toBeNull();
    }
  });

  it("borne au jour : l'heure du balayage ne change pas le constat", () => {
    const affaire = {
      statut: "EN_COURS",
      prochaineActionLe: jourUtc("2026-07-16"),
      etapeDepuis: jourUtc("2026-07-01"),
    };
    const matin = estDormante(affaire, new Date("2026-07-17T00:05:00.000Z"));
    const soir = estDormante(affaire, new Date("2026-07-17T23:55:00.000Z"));
    expect(matin).toEqual({ motif: "ACTION_EN_RETARD", jours: 1 });
    expect(soir).toEqual(matin);
  });
});

describe("joursDansEtape", () => {
  it("compte les jours entiers depuis l'entrée dans l'étape", () => {
    expect(joursDansEtape(jourUtc("2026-07-10"), AUJOURDHUI)).toBe(7);
    expect(joursDansEtape(jourUtc("2026-07-17"), AUJOURDHUI)).toBe(0);
  });
});

describe("valeurPipeline", () => {
  it("somme les valeurs estimées par étape", () => {
    expect(
      valeurPipeline([
        { etapeCle: "devis", valeurEstimee: 12000 },
        { etapeCle: "devis", valeurEstimee: 8000 },
        { etapeCle: "contact", valeurEstimee: null },
        { etapeCle: "signe", valeurEstimee: 45000 },
      ])
    ).toEqual({ devis: 20000, contact: 0, signe: 45000 });
  });

  it("renvoie un objet vide sans affaires", () => {
    expect(valeurPipeline([])).toEqual({});
  });
});

describe("traces système du fil d'affaire", () => {
  it("formate la prochaine action complète en JJ/MM (fuseau UTC)", () => {
    expect(
      texteTraceProchaineAction(
        "Relancer la mairie",
        jourUtc("2026-07-21"),
        "Youssoufou"
      )
    ).toBe("Prochaine action : Relancer la mairie pour le 21/07 (Youssoufou).");
  });

  it("reste une phrase complète sans date, sans libellé, ou effacée", () => {
    expect(
      texteTraceProchaineAction("Appeler le client", null, "Awa")
    ).toBe("Prochaine action : Appeler le client (Awa).");
    expect(
      texteTraceProchaineAction(null, jourUtc("2026-08-03"), "Awa")
    ).toBe("Prochaine action pour le 03/08 (Awa).");
    expect(texteTraceProchaineAction(null, null, "Awa")).toBe(
      "Prochaine action effacée (Awa)."
    );
  });

  it("trace le responsable désigné ou retiré", () => {
    expect(texteTraceResponsable("Idriss", "Youssoufou")).toBe(
      "Responsable : Idriss (Youssoufou)."
    );
    expect(texteTraceResponsable(null, "Youssoufou")).toBe(
      "Responsable retiré (Youssoufou)."
    );
  });

  it("trace la pièce cochée et décochée", () => {
    expect(texteTracePiece("Plan cadastral", true, "Awa")).toBe(
      "Pièce reçue : Plan cadastral (Awa)."
    );
    expect(texteTracePiece("Plan cadastral", false, "Awa")).toBe(
      "Pièce décochée : Plan cadastral (Awa)."
    );
  });

  it("trace l'action confiée avec cible, libellé et échéance", () => {
    expect(
      texteTraceActionConfiee(
        "Idriss",
        "Préparer le devis",
        jourUtc("2026-07-24"),
        "Youssoufou"
      )
    ).toBe(
      "Action confiée à Idriss : Préparer le devis pour le 24/07 (Youssoufou)."
    );
  });
});
