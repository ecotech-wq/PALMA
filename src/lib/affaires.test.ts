import { describe, expect, it } from "vitest";
import {
  PIPELINES,
  TYPOLOGIES,
  checklistType,
  estDormante,
  etapesDe,
  joursDansEtape,
  libelleEtape,
  parseChecklist,
  valeurPipeline,
  SEUIL_DORMANCE_JOURS,
} from "./affaires";

// Jour de référence des tests : un mercredi quelconque, à une heure non nulle
// pour vérifier que la classification borne bien au jour.
const AUJOURDHUI = new Date("2026-07-17T14:35:00.000Z");

function jourUtc(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

describe("pipelines par typologie", () => {
  it("expose les 4 typologies dans l'ordre des onglets", () => {
    expect(TYPOLOGIES).toEqual([
      "PERMIS_CONSTRUIRE",
      "ETUDE_STRUCTURE",
      "TRAVAUX",
      "LABO",
    ]);
  });

  it("garde les clés stables et l'ordre validés du permis de construire", () => {
    expect(etapesDe("PERMIS_CONSTRUIRE").map((e) => e.cle)).toEqual([
      "contact",
      "qualification",
      "visite",
      "pieces",
      "conception",
      "devis",
      "dossier",
      "depose",
      "instruction",
    ]);
    expect(libelleEtape("PERMIS_CONSTRUIRE", "depose")).toBe(
      "Déposé en mairie"
    );
  });

  it("garde les pipelines étude, travaux et labo validés", () => {
    expect(etapesDe("ETUDE_STRUCTURE").map((e) => e.cle)).toEqual([
      "contact",
      "qualification",
      "pieces",
      "devis",
      "accepte",
      "etude",
      "livree",
    ]);
    expect(etapesDe("TRAVAUX").map((e) => e.cle)).toEqual([
      "contact",
      "qualification",
      "visite",
      "devis",
      "negociation",
      "signe",
    ]);
    expect(etapesDe("LABO").map((e) => e.cle)).toEqual([
      "demande",
      "devis",
      "echantillons",
      "essais",
      "rapport",
    ]);
    expect(libelleEtape("ETUDE_STRUCTURE", "devis")).toBe(
      "Devis d'honoraires"
    );
    expect(libelleEtape("TRAVAUX", "devis")).toBe("Métré et devis");
  });

  it("chaque pipeline commence par une prise de contact ou une demande", () => {
    for (const t of TYPOLOGIES) {
      expect(["contact", "demande"]).toContain(PIPELINES[t][0].cle);
    }
  });

  it("replie sur la clé quand une étape est inconnue (donnée historique)", () => {
    expect(libelleEtape("LABO", "ancienne_etape")).toBe("ancienne_etape");
  });
});

describe("checklistType", () => {
  it("pose les 5 pièces du permis de construire, non faites", () => {
    const items = checklistType("PERMIS_CONSTRUIRE");
    expect(items.map((i) => i.cle)).toEqual([
      "cadastre",
      "geometre",
      "topo",
      "cu",
      "photos",
    ]);
    expect(items.every((i) => i.fait === false)).toBe(true);
    expect(items.find((i) => i.cle === "cu")?.libelle).toBe(
      "Certificat d'urbanisme"
    );
  });

  it("laisse les autres typologies sans checklist", () => {
    expect(checklistType("ETUDE_STRUCTURE")).toEqual([]);
    expect(checklistType("TRAVAUX")).toEqual([]);
    expect(checklistType("LABO")).toEqual([]);
  });
});

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
