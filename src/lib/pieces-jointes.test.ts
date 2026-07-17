import { describe, expect, it } from "vitest";
import {
  ACCEPT_DOCUMENTS,
  EXTENSIONS_AUDIO,
  EXTENSIONS_DOCUMENTS,
  formatDureeAudio,
  formatEchecsUpload,
  formatTailleFichier,
  parseDocumentsMessage,
} from "./pieces-jointes";

describe("parseDocumentsMessage", () => {
  it("relit un tableau d'entrées bien formées", () => {
    const docs = parseDocumentsMessage([
      {
        url: "/uploads/docs-chantiers/abc.pdf",
        nom: "Plan RDC.pdf",
        mimeType: "application/pdf",
        taille: 123456,
      },
    ]);
    expect(docs).toEqual([
      {
        url: "/uploads/docs-chantiers/abc.pdf",
        nom: "Plan RDC.pdf",
        mimeType: "application/pdf",
        taille: 123456,
      },
    ]);
  });

  it("renvoie [] pour tout ce qui n'est pas un tableau", () => {
    expect(parseDocumentsMessage(null)).toEqual([]);
    expect(parseDocumentsMessage(undefined)).toEqual([]);
    expect(parseDocumentsMessage("[]")).toEqual([]);
    expect(parseDocumentsMessage({ url: "/uploads/x.pdf" })).toEqual([]);
    expect(parseDocumentsMessage(42)).toEqual([]);
  });

  it("ignore les entrées malformées et garde les bonnes", () => {
    const docs = parseDocumentsMessage([
      null,
      "texte",
      ["tableau"],
      { url: "https://ailleurs.example/x.pdf", nom: "hors uploads" },
      { nom: "sans url" },
      { url: "/uploads/docs-chantiers/ok.docx", nom: "CR réunion.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", taille: 2048 },
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0].nom).toBe("CR réunion.docx");
  });

  it("complète les champs secondaires manquants avec des valeurs sûres", () => {
    const docs = parseDocumentsMessage([
      { url: "/uploads/docs-chantiers/f1e2.pdf" },
      { url: "/uploads/docs-chantiers/g3.zip", nom: "  ", taille: -5 },
      { url: "/uploads/docs-chantiers/h4.csv", nom: "mesures.csv", taille: Number.NaN },
    ]);
    expect(docs[0]).toEqual({
      url: "/uploads/docs-chantiers/f1e2.pdf",
      nom: "f1e2.pdf",
      mimeType: "application/octet-stream",
      taille: 0,
    });
    expect(docs[1].nom).toBe("g3.zip");
    expect(docs[1].taille).toBe(0);
    expect(docs[2].taille).toBe(0);
  });
});

describe("formatTailleFichier", () => {
  it("formate octets, Ko et Mo à la française", () => {
    expect(formatTailleFichier(512)).toBe("512 o");
    expect(formatTailleFichier(48 * 1024)).toBe("48 Ko");
    expect(formatTailleFichier(1.4 * 1024 * 1024)).toBe("1,4 Mo");
  });

  it("rend une chaîne vide pour les valeurs absentes ou invalides", () => {
    expect(formatTailleFichier(null)).toBe("");
    expect(formatTailleFichier(undefined)).toBe("");
    expect(formatTailleFichier(-1)).toBe("");
    expect(formatTailleFichier(Number.NaN)).toBe("");
  });
});

describe("formatDureeAudio", () => {
  it("formate m:ss", () => {
    expect(formatDureeAudio(0)).toBe("0:00");
    expect(formatDureeAudio(7)).toBe("0:07");
    expect(formatDureeAudio(65)).toBe("1:05");
    expect(formatDureeAudio(600)).toBe("10:00");
  });

  it("ne casse pas sur une valeur invalide", () => {
    expect(formatDureeAudio(-3)).toBe("0:00");
    expect(formatDureeAudio(Number.NaN)).toBe("0:00");
  });
});

describe("listes d'extensions", () => {
  it("l'accept du trombone couvre toutes les extensions documents", () => {
    for (const ext of EXTENSIONS_DOCUMENTS) {
      expect(ACCEPT_DOCUMENTS).toContain("." + ext);
    }
  });

  it("les formats d'enregistrement MediaRecorder sont couverts", () => {
    // audio/webm (Chrome, Firefox) et audio/mp4 -> .m4a (iOS Safari)
    expect(EXTENSIONS_AUDIO).toContain("webm");
    expect(EXTENSIONS_AUDIO).toContain("m4a");
  });
});

describe("formatEchecsUpload", () => {
  it("rend une chaîne vide sans échec", () => {
    expect(formatEchecsUpload([])).toBe("");
  });

  it("accorde le singulier", () => {
    expect(
      formatEchecsUpload([
        { nom: "rapport.pdf", raison: "Fichier trop volumineux (max 25 Mo)" },
      ])
    ).toBe(
      "1 pièce jointe refusée : rapport.pdf (Fichier trop volumineux (max 25 Mo))"
    );
  });

  it("accorde le pluriel et liste chaque fichier avec sa raison", () => {
    const msg = formatEchecsUpload([
      { nom: "a.exe", raison: "Type de fichier non autorisé" },
      { nom: "b.pdf", raison: "Fichier trop volumineux (max 25 Mo)" },
    ]);
    expect(msg).toContain("2 pièces jointes refusées : ");
    expect(msg).toContain("a.exe (Type de fichier non autorisé)");
    expect(msg).toContain("b.pdf (Fichier trop volumineux (max 25 Mo))");
  });
});
