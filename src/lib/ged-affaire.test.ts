import { describe, expect, it } from "vitest";
import {
  CATEGORIES_DOC_AFFAIRE,
  DESCRIPTION_GROUPE_AFFAIRE,
  LABEL_CATEGORIE_AFFAIRE,
  LABEL_GROUPE_AFFAIRE,
  LIBELLE_DOSSIER_MAX,
  ORDRE_CATEGORIES_AFFAIRE,
  cleDossierDepuisLibelle,
  libelleDossierPerso,
  mimeDepuisUrl,
  nomDepuisUrl,
  parseDossiersPerso,
  preparerNouveauDossier,
  suggererCategorie,
} from "./ged-affaire";

describe("ged-affaire : catégories du dossier client", () => {
  it("l'ordre d'affichage couvre chaque catégorie exactement une fois", () => {
    expect(ORDRE_CATEGORIES_AFFAIRE).toHaveLength(
      CATEGORIES_DOC_AFFAIRE.length
    );
    expect(new Set(ORDRE_CATEGORIES_AFFAIRE).size).toBe(
      CATEGORIES_DOC_AFFAIRE.length
    );
  });

  it("chaque catégorie a un libellé, un nom de groupe et une description", () => {
    for (const cat of CATEGORIES_DOC_AFFAIRE) {
      expect(LABEL_CATEGORIE_AFFAIRE[cat]).toBeTruthy();
      expect(LABEL_GROUPE_AFFAIRE[cat]).toBeTruthy();
      expect(DESCRIPTION_GROUPE_AFFAIRE[cat]).toBeTruthy();
    }
  });
});

describe("suggererCategorie (rangement depuis le fil)", () => {
  it("une image part dans Photos", () => {
    expect(suggererCategorie("image/jpeg")).toBe("PHOTOS");
    expect(suggererCategorie("image/webp")).toBe("PHOTOS");
  });

  it("tout le reste part dans Autres", () => {
    expect(suggererCategorie("application/pdf")).toBe("AUTRE");
    expect(suggererCategorie("application/octet-stream")).toBe("AUTRE");
    expect(suggererCategorie("")).toBe("AUTRE");
    expect(suggererCategorie(null)).toBe("AUTRE");
    expect(suggererCategorie(undefined)).toBe("AUTRE");
  });
});

describe("mimeDepuisUrl / nomDepuisUrl (photos du fil sans métadonnées)", () => {
  it("déduit le type MIME de l'extension", () => {
    expect(mimeDepuisUrl("/uploads/journal/abc.webp")).toBe("image/webp");
    expect(mimeDepuisUrl("/uploads/docs-chantiers/x.PDF")).toBe(
      "application/pdf"
    );
    expect(mimeDepuisUrl("/uploads/docs-chantiers/x.dwg")).toBe(
      "application/octet-stream"
    );
  });

  it("tire un nom lisible du dernier segment de l'URL", () => {
    expect(nomDepuisUrl("/uploads/journal/abc.webp")).toBe("abc.webp");
    expect(nomDepuisUrl("")).toBe("document");
  });
});

describe("parseDossiersPerso (Affaire.dossiersPerso, Json)", () => {
  it("relit un tableau bien formé", () => {
    expect(
      parseDossiersPerso([{ cle: "mairie", libelle: "Mairie" }])
    ).toEqual([{ cle: "mairie", libelle: "Mairie" }]);
  });

  it("renvoie [] pour tout ce qui n'est pas un tableau", () => {
    expect(parseDossiersPerso(null)).toEqual([]);
    expect(parseDossiersPerso(undefined)).toEqual([]);
    expect(parseDossiersPerso("[]")).toEqual([]);
    expect(parseDossiersPerso({ cle: "x", libelle: "X" })).toEqual([]);
  });

  it("ignore les entrées malformées et dédoublonne par clé", () => {
    const dossiers = parseDossiersPerso([
      null,
      { cle: "", libelle: "vide" },
      { cle: "mairie" },
      { cle: "mairie", libelle: "Mairie" },
      { cle: "mairie", libelle: "Doublon écrasé" },
      { cle: "geometre", libelle: "Géomètre" },
    ]);
    expect(dossiers).toEqual([
      { cle: "mairie", libelle: "Mairie" },
      { cle: "geometre", libelle: "Géomètre" },
    ]);
  });
});

describe("cleDossierDepuisLibelle (slug sans accents)", () => {
  it("passe en minuscules et retire les accents", () => {
    expect(cleDossierDepuisLibelle("Géomètre")).toBe("geometre");
    expect(cleDossierDepuisLibelle("Métré & levé")).toBe("metre-leve");
  });

  it("remplace les suites non alphanumériques par un tiret, sans tiret aux bords", () => {
    expect(cleDossierDepuisLibelle("  Sous-traitants (2026)  ")).toBe(
      "sous-traitants-2026"
    );
    expect(cleDossierDepuisLibelle("***")).toBe("");
  });
});

describe("preparerNouveauDossier (validation et collisions)", () => {
  it("crée un dossier au libellé net et à la clé slug", () => {
    const res = preparerNouveauDossier("  Dossier   Mairie ", []);
    expect(res).toEqual({
      ok: true,
      dossier: { cle: "dossier-mairie", libelle: "Dossier Mairie" },
    });
  });

  it("refuse un libellé vide ou trop long", () => {
    expect(preparerNouveauDossier("   ", []).ok).toBe(false);
    expect(
      preparerNouveauDossier("x".repeat(LIBELLE_DOSSIER_MAX + 1), []).ok
    ).toBe(false);
    const pile = preparerNouveauDossier("x".repeat(LIBELLE_DOSSIER_MAX), []);
    expect(pile.ok).toBe(true);
  });

  it("refuse un libellé sans aucun caractère alphanumérique", () => {
    const res = preparerNouveauDossier("!!!", []);
    expect(res.ok).toBe(false);
  });

  it("refuse la collision avec les six catégories standard (clé et libellé)", () => {
    expect(preparerNouveauDossier("Photos", []).ok).toBe(false);
    expect(preparerNouveauDossier("pièces client", []).ok).toBe(false);
    expect(preparerNouveauDossier("PIECES_CLIENT", []).ok).toBe(false);
    expect(preparerNouveauDossier("Autres", []).ok).toBe(false);
  });

  it("signale le doublon en renvoyant le dossier existant (idempotence)", () => {
    const existants = [{ cle: "mairie", libelle: "Mairie" }];
    const res = preparerNouveauDossier("MAIRIE", existants);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.existant).toEqual(existants[0]);
    }
  });
});

describe("libelleDossierPerso", () => {
  it("retrouve le libellé et se replie sur la clé inconnue", () => {
    const dossiers = [{ cle: "mairie", libelle: "Mairie" }];
    expect(libelleDossierPerso("mairie", dossiers)).toBe("Mairie");
    expect(libelleDossierPerso("disparu", dossiers)).toBe("disparu");
  });
});
