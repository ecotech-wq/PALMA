import { describe, expect, it } from "vitest";
import {
  CATEGORIES_DOC_AFFAIRE,
  DESCRIPTION_GROUPE_AFFAIRE,
  LABEL_CATEGORIE_AFFAIRE,
  LABEL_GROUPE_AFFAIRE,
  ORDRE_CATEGORIES_AFFAIRE,
  mimeDepuisUrl,
  nomDepuisUrl,
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
