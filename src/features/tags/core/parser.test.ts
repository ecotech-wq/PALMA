import { describe, it, expect } from "vitest";
import { extractTags, normalizeTagCode } from "./parser";

describe("normalizeTagCode", () => {
  it("passe en minuscules", () => {
    expect(normalizeTagCode("TACHE")).toBe("tache");
    expect(normalizeTagCode("Incident")).toBe("incident");
  });

  it("supprime les accents", () => {
    expect(normalizeTagCode("tâche")).toBe("tache");
    expect(normalizeTagCode("réserve")).toBe("reserve");
  });

  it("combine casse et accents", () => {
    expect(normalizeTagCode("TÂCHE")).toBe("tache");
    expect(normalizeTagCode("Réservé")).toBe("reserve");
  });

  it("laisse intact un code déjà normalisé", () => {
    expect(normalizeTagCode("incident")).toBe("incident");
  });
});

describe("extractTags", () => {
  it("détecte un tag en fin de message", () => {
    const texte = "Fuite constatée au sous-sol #incident";
    expect(extractTags(texte)).toEqual([{ code: "incident", index: texte.indexOf("#") }]);
  });

  it("détecte un tag en corps de message", () => {
    const texte = "On crée une #tache pour reprendre l'enduit demain";
    expect(extractTags(texte)).toEqual([{ code: "tache", index: texte.indexOf("#") }]);
  });

  it("détecte un tag en tout début de message", () => {
    expect(extractTags("#tache reprendre le ferraillage")).toEqual([{ code: "tache", index: 0 }]);
  });

  it("#tache et #tâche sont équivalents (accents ignorés)", () => {
    expect(extractTags("à faire #tache")[0].code).toBe("tache");
    expect(extractTags("à faire #tâche")[0].code).toBe("tache");
  });

  it("est insensible à la casse", () => {
    expect(extractTags("urgent #TACHE")[0].code).toBe("tache");
    expect(extractTags("urgent #Tâche")[0].code).toBe("tache");
    expect(extractTags("urgent #RÉSERVE")[0].code).toBe("reserve");
  });

  it("détecte plusieurs tags, dans l'ordre du texte", () => {
    const texte = "On planifie une #tache puis on note la #réserve du client";
    const tags = extractTags(texte);
    expect(tags.map((t) => t.code)).toEqual(["tache", "reserve"]);
    expect(tags[0].index).toBe(texte.indexOf("#tache"));
    expect(tags[1].index).toBe(texte.indexOf("#réserve"));
    expect(tags[0].index).toBeLessThan(tags[1].index);
  });

  it("renvoie chaque occurrence, doublons compris", () => {
    const tags = extractTags("#tache le matin et #tache le soir");
    expect(tags.map((t) => t.code)).toEqual(["tache", "tache"]);
  });

  it("renvoie un tableau vide quand il n'y a aucun tag", () => {
    expect(extractTags("Rien à signaler aujourd'hui.")).toEqual([]);
    expect(extractTags("")).toEqual([]);
  });

  it("ignore un # isolé sans code derrière", () => {
    expect(extractTags("Juste un # isolé")).toEqual([]);
    expect(extractTags("#")).toEqual([]);
  });

  it("ignore un # collé à la fin d'un mot", () => {
    expect(extractTags("prix#incident à vérifier")).toEqual([]);
  });

  it("s'arrête à la ponctuation qui suit le tag", () => {
    const texte = "C'est noté #réserve.";
    expect(extractTags(texte)).toEqual([{ code: "reserve", index: texte.indexOf("#") }]);
    expect(extractTags("#tache : refaire l'enduit")[0].code).toBe("tache");
    expect(extractTags("(#incident)")[0].code).toBe("incident");
  });

  it("détecte un tag après un retour à la ligne", () => {
    const texte = "Compte rendu du jour\n#incident sur la grue";
    expect(extractTags(texte)).toEqual([{ code: "incident", index: texte.indexOf("#") }]);
  });

  it("renvoie aussi les codes inconnus du catalogue (le parseur est agnostique)", () => {
    expect(extractTags("à traiter #urgent")).toEqual([{ code: "urgent", index: 10 }]);
  });
});
