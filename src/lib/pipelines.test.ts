import { describe, expect, it } from "vitest";
import {
  COULEURS_PIPELINE,
  LIBELLE_ETAPE_MAX,
  MODELES_PAR_DEFAUT,
  PALETTE_PIPELINE,
  accentPipeline,
  checklistInitiale,
  cleDepuisLibelle,
  cleEtapeUnique,
  estCouleurPipeline,
  etapesDe,
  etapesParDefautDeTypologie,
  libelleEtape,
  libelleEtapeDe,
  modeleParDefaut,
  parseEtapes,
  validerChecklistModele,
  validerEtapes,
} from "./pipelines";

describe("modèles par défaut (les 4 pipelines historiques)", () => {
  it("expose les 4 suggestions dans l'ordre historique des onglets", () => {
    expect(MODELES_PAR_DEFAUT.map((m) => m.cle)).toEqual([
      "PERMIS_CONSTRUIRE",
      "ETUDE_STRUCTURE",
      "TRAVAUX",
      "LABO",
    ]);
  });

  it("garde les clés stables et l'ordre validés du permis de construire", () => {
    const permis = modeleParDefaut("PERMIS_CONSTRUIRE");
    expect(permis?.etapes.map((e) => e.cle)).toEqual([
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
    expect(libelleEtapeDe(permis!.etapes, "depose")).toBe("Déposé en mairie");
  });

  it("garde les modèles étude, travaux et labo validés", () => {
    expect(
      modeleParDefaut("ETUDE_STRUCTURE")?.etapes.map((e) => e.cle)
    ).toEqual([
      "contact",
      "qualification",
      "pieces",
      "devis",
      "accepte",
      "etude",
      "livree",
    ]);
    expect(modeleParDefaut("TRAVAUX")?.etapes.map((e) => e.cle)).toEqual([
      "contact",
      "qualification",
      "visite",
      "devis",
      "negociation",
      "signe",
    ]);
    expect(modeleParDefaut("LABO")?.etapes.map((e) => e.cle)).toEqual([
      "demande",
      "devis",
      "echantillons",
      "essais",
      "rapport",
    ]);
  });

  it("porte les couleurs par défaut arrêtées (permis ambre, étude bleu acier, travaux cuivre, labo vert mousse)", () => {
    const parCle = Object.fromEntries(
      MODELES_PAR_DEFAUT.map((m) => [m.cle, m.couleur])
    );
    expect(parCle).toEqual({
      PERMIS_CONSTRUIRE: "ambre",
      ETUDE_STRUCTURE: "bleu-acier",
      TRAVAUX: "cuivre",
      LABO: "vert-mousse",
    });
  });

  it("chaque modèle est valide au sens de validerEtapes", () => {
    for (const m of MODELES_PAR_DEFAUT) {
      expect(validerEtapes(m.etapes)).toBeNull();
      expect(validerChecklistModele(m.checklistModele)).toBeNull();
    }
  });

  it("seul le permis de construire suggère des pièces types (5)", () => {
    expect(
      modeleParDefaut("PERMIS_CONSTRUIRE")?.checklistModele.map((p) => p.cle)
    ).toEqual(["cadastre", "geometre", "topo", "cu", "photos"]);
    expect(modeleParDefaut("ETUDE_STRUCTURE")?.checklistModele).toEqual([]);
    expect(modeleParDefaut("TRAVAUX")?.checklistModele).toEqual([]);
    expect(modeleParDefaut("LABO")?.checklistModele).toEqual([]);
  });

  it("etapesParDefautDeTypologie replie sur vide pour une clé inconnue", () => {
    expect(etapesParDefautDeTypologie("LABO").length).toBe(5);
    expect(etapesParDefautDeTypologie("INCONNUE")).toEqual([]);
  });
});

describe("parseEtapes (lecture tolérante du Json)", () => {
  it("relit un tableau d'étapes stocké en Json", () => {
    expect(
      parseEtapes([
        { cle: "contact", libelle: "Prise de contact" },
        { cle: "devis", libelle: "Devis envoyé" },
      ])
    ).toEqual([
      { cle: "contact", libelle: "Prise de contact" },
      { cle: "devis", libelle: "Devis envoyé" },
    ]);
  });

  it("tolère les données inattendues sans lever", () => {
    expect(parseEtapes(null)).toEqual([]);
    expect(parseEtapes("n'importe quoi")).toEqual([]);
    expect(
      parseEtapes([{ cle: 12 }, null, { cle: "", libelle: "X" }, { cle: "a", libelle: "A" }])
    ).toEqual([{ cle: "a", libelle: "A" }]);
  });
});

describe("helpers d'affichage sur un pipeline chargé", () => {
  const pipeline = {
    libelle: "Permis de construire",
    etapes: [
      { cle: "contact", libelle: "Prise de contact" },
      { cle: "depose", libelle: "Déposé en mairie" },
    ],
  };

  it("etapesDe et libelleEtape lisent le Json du pipeline", () => {
    expect(etapesDe(pipeline).map((e) => e.cle)).toEqual([
      "contact",
      "depose",
    ]);
    expect(libelleEtape(pipeline, "depose")).toBe("Déposé en mairie");
  });

  it("replie sur la clé quand l'étape a disparu (donnée historique)", () => {
    expect(libelleEtape(pipeline, "ancienne_etape")).toBe("ancienne_etape");
  });

  it("checklistInitiale copie le modèle, chaque pièce non faite", () => {
    expect(
      checklistInitiale({
        checklistModele: [
          { cle: "cadastre", libelle: "Plan cadastral" },
          { cle: "cu", libelle: "Certificat d'urbanisme" },
        ],
      })
    ).toEqual([
      { cle: "cadastre", libelle: "Plan cadastral", fait: false },
      { cle: "cu", libelle: "Certificat d'urbanisme", fait: false },
    ]);
    expect(checklistInitiale({ checklistModele: null })).toEqual([]);
  });
});

describe("clés d'étape (slug stable et unique)", () => {
  it("slugifie un libellé accentué", () => {
    expect(cleDepuisLibelle("Déposé en mairie")).toBe("depose-en-mairie");
    expect(cleDepuisLibelle("  Métré & devis !")).toBe("metre-devis");
  });

  it("suffixe -2, -3... en cas de collision dans le pipeline", () => {
    const existantes = [{ cle: "visite" }, { cle: "visite-2" }];
    expect(cleEtapeUnique("Visite", existantes)).toBe("visite-3");
    expect(cleEtapeUnique("Visite", [])).toBe("visite");
  });

  it("replie sur « etape » quand le libellé ne donne aucun slug", () => {
    expect(cleEtapeUnique("!!!", [])).toBe("etape");
  });
});

describe("validerEtapes", () => {
  it("accepte une liste saine", () => {
    expect(
      validerEtapes([
        { cle: "contact", libelle: "Prise de contact" },
        { cle: "devis", libelle: "Devis envoyé" },
      ])
    ).toBeNull();
  });

  it("refuse une procédure sans étape", () => {
    expect(validerEtapes([])).toMatch(/au moins une étape/);
  });

  it("refuse un libellé vide ou trop long", () => {
    expect(
      validerEtapes([{ cle: "a", libelle: "  " }])
    ).toMatch(/libellé/);
    expect(
      validerEtapes([{ cle: "a", libelle: "x".repeat(LIBELLE_ETAPE_MAX + 1) }])
    ).toMatch(/trop long/);
  });

  it("refuse deux étapes de même clé et une clé non slug", () => {
    expect(
      validerEtapes([
        { cle: "devis", libelle: "Devis" },
        { cle: "devis", libelle: "Devis bis" },
      ])
    ).toMatch(/même clé/);
    expect(
      validerEtapes([{ cle: "pas de slug !", libelle: "X" }])
    ).toMatch(/invalide/);
  });

  it("validerChecklistModele accepte la liste vide mais garde les autres règles", () => {
    expect(validerChecklistModele([])).toBeNull();
    expect(
      validerChecklistModele([
        { cle: "cu", libelle: "CU" },
        { cle: "cu", libelle: "CU bis" },
      ])
    ).toMatch(/même clé/);
  });
});

describe("palette des procédures (un seul endroit)", () => {
  it("expose 8 accents nommés, tous définis pour clair ET sombre", () => {
    expect(COULEURS_PIPELINE.length).toBe(8);
    for (const c of COULEURS_PIPELINE) {
      const a = PALETTE_PIPELINE[c];
      // Chaque classe porte sa variante sombre : pas d'accent mono-thème.
      expect(a.pastille).toMatch(/dark:/);
      expect(a.texte).toMatch(/dark:/);
      expect(a.bordure).toMatch(/dark:/);
      // Jamais de hex en dur : uniquement des classes Tailwind nommées.
      expect(a.pastille).not.toMatch(/#/);
    }
  });

  it("valide l'appartenance d'une couleur à la palette", () => {
    expect(estCouleurPipeline("ambre")).toBe(true);
    expect(estCouleurPipeline("fuchsia-fluo")).toBe(false);
  });

  it("replie sur l'ardoise pour une couleur inconnue (donnée historique)", () => {
    expect(accentPipeline("ambre")).toBe(PALETTE_PIPELINE["ambre"]);
    expect(accentPipeline("disparue")).toBe(PALETTE_PIPELINE["ardoise"]);
  });
});
