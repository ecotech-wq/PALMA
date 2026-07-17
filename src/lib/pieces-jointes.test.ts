import { describe, expect, it } from "vitest";
import {
  ACCEPT_DOCUMENTS,
  EXTENSIONS_AUDIO,
  EXTENSIONS_DOCUMENTS,
  TAILLE_MAX_ENVOI_OCTETS,
  controlerTaillesEnvoi,
  formatDureeAudio,
  formatEchecsUpload,
  formatTailleFichier,
  parseDocumentsMessage,
} from "./pieces-jointes";

const MO = 1024 * 1024;

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

describe("controlerTaillesEnvoi (plafond client avant envoi)", () => {
  it("accepte des fichiers raisonnables", () => {
    const res = controlerTaillesEnvoi(
      [],
      [
        { nom: "a.pdf", taille: 10 * MO },
        { nom: "b.jpg", taille: 3 * MO },
      ]
    );
    expect(res.indicesAcceptes).toEqual([0, 1]);
    expect(res.refus).toEqual([]);
  });

  it("refuse un fichier de plus de 45 Mo avec un message clair", () => {
    const res = controlerTaillesEnvoi([], [{ nom: "gros.pdf", taille: 46 * MO }]);
    expect(res.indicesAcceptes).toEqual([]);
    expect(res.refus).toHaveLength(1);
    expect(res.refus[0]).toContain("Ce fichier dépasse 45 Mo");
    expect(res.refus[0]).toContain("gros.pdf");
  });

  it("le plafond est exactement 45 Mo (45 Mo pile passe)", () => {
    const res = controlerTaillesEnvoi(
      [],
      [{ nom: "pile.pdf", taille: TAILLE_MAX_ENVOI_OCTETS }]
    );
    expect(res.indicesAcceptes).toEqual([0]);
  });

  it("refuse quand le TOTAL de l'envoi dépasserait 45 Mo", () => {
    // 30 Mo déjà joints + 20 Mo : chaque fichier passe seul, pas ensemble.
    const res = controlerTaillesEnvoi(
      [30 * MO],
      [{ nom: "plans.pdf", taille: 20 * MO }]
    );
    expect(res.indicesAcceptes).toEqual([]);
    expect(res.refus[0]).toContain("dépasserait 45 Mo au total");
    expect(res.refus[0]).toContain("plans.pdf");
  });

  it("accepte les premiers et refuse ceux qui font déborder le total", () => {
    const res = controlerTaillesEnvoi(
      [],
      [
        { nom: "a.pdf", taille: 25 * MO },
        { nom: "b.pdf", taille: 15 * MO },
        { nom: "c.pdf", taille: 10 * MO },
      ]
    );
    expect(res.indicesAcceptes).toEqual([0, 1]);
    expect(res.refus).toHaveLength(1);
    expect(res.refus[0]).toContain("c.pdf");
  });

  it("applique le plafond serveur par TYPE dès la sélection", () => {
    // Miroirs de lib/upload.ts : document 25 Mo, photo 10 Mo, audio 25 Mo ;
    // une vidéo n'est bornée que par l'enveloppe de 45 Mo.
    const res = controlerTaillesEnvoi(
      [],
      [
        { nom: "rapport.pdf", taille: 30 * MO, type: "application/pdf" },
        { nom: "photo.jpg", taille: 12 * MO, type: "image/jpeg" },
        { nom: "memo.m4a", taille: 26 * MO, type: "audio/mp4" },
        { nom: "visite.mp4", taille: 40 * MO, type: "video/mp4" },
      ]
    );
    expect(res.indicesAcceptes).toEqual([3]);
    expect(res.refus).toHaveLength(3);
    expect(res.refus[0]).toContain("dépasse 25 Mo");
    expect(res.refus[0]).toContain("rapport.pdf");
    expect(res.refus[1]).toContain("dépasse 10 Mo");
    expect(res.refus[1]).toContain("photo.jpg");
    expect(res.refus[2]).toContain("dépasse 25 Mo");
    expect(res.refus[2]).toContain("memo.m4a");
  });

  it("un type MIME vide est traité comme un document (aiguillage serveur)", () => {
    const res = controlerTaillesEnvoi(
      [],
      [{ nom: "plan.dwg", taille: 30 * MO, type: "" }]
    );
    expect(res.indicesAcceptes).toEqual([]);
    expect(res.refus[0]).toContain("dépasse 25 Mo");
  });

  it("sans type fourni, seule l'enveloppe de 45 Mo s'applique (compat)", () => {
    const res = controlerTaillesEnvoi([], [{ nom: "gros.bin", taille: 30 * MO }]);
    expect(res.indicesAcceptes).toEqual([0]);
    expect(res.refus).toEqual([]);
  });

  it("refuse la 31e pièce (plafond du plan de rangement côté serveur)", () => {
    const dejaJointes = Array.from({ length: 29 }, () => 1 * MO);
    const res = controlerTaillesEnvoi(dejaJointes, [
      { nom: "ok.jpg", taille: 1 * MO, type: "image/jpeg" },
      { nom: "trop.jpg", taille: 1 * MO, type: "image/jpeg" },
    ]);
    expect(res.indicesAcceptes).toEqual([0]);
    expect(res.refus).toHaveLength(1);
    expect(res.refus[0]).toContain("30 pièces jointes");
    expect(res.refus[0]).toContain("trop.jpg");
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
