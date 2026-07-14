import { describe, expect, it } from "vitest";
import {
  parseTache,
  extractDependances,
  extractLabelIds,
} from "./parse-tache";

/**
 * Non-régression sur le contrat FormData/Zod (bug 2026-07-14 : édition
 * d'une tâche perso impossible). La modale d'une tâche PERSO ne rend ni
 * le select chantierId ni le select equipeId : ces clés sont ABSENTES du
 * FormData (get() renvoie null, que le schéma rejette). parseTache doit
 * normaliser toute clé optionnelle absente en chaîne vide.
 */

/** FormData minimal tel que soumis par la modale pour une tâche PERSO :
 *  sans chantierId, equipeId, sectionId ni parentId. */
function formDataPerso(): FormData {
  const fd = new FormData();
  fd.set("nom", "Rappeler le notaire");
  fd.set("dateDebut", "2026-07-14");
  fd.set("dateFin", "2026-07-15");
  fd.set("statut", "A_FAIRE");
  fd.set("priorite", "4");
  fd.set("avancement", "0");
  fd.set("description", "");
  fd.set("recurrence", "");
  return fd;
}

describe("parseTache", () => {
  it("tâche perso : clés chantierId et equipeId ABSENTES, le parse passe", () => {
    const t = parseTache(formDataPerso());
    expect(t.chantierId).toBeNull();
    expect(t.equipeId).toBeNull();
    expect(t.nom).toBe("Rappeler le notaire");
    expect(t.statut).toBe("A_FAIRE");
    expect(t.priorite).toBe(4);
  });

  it("FormData réduit au strict minimum (nom + dates) : valeurs par défaut", () => {
    const fd = new FormData();
    fd.set("nom", "Tâche nue");
    fd.set("dateDebut", "2026-07-14");
    fd.set("dateFin", "2026-07-14");
    const t = parseTache(fd);
    expect(t.chantierId).toBeNull();
    expect(t.equipeId).toBeNull();
    expect(t.description).toBeNull();
    expect(t.parentId).toBeNull();
    expect(t.sectionId).toBeNull();
    expect(t.recurrence).toBeNull();
    expect(t.statut).toBe("A_FAIRE");
    expect(t.priorite).toBe(4);
    expect(t.avancement).toBe(0);
  });

  it("tâche de chantier : champs complets restitués", () => {
    const fd = formDataPerso();
    fd.set("nom", "Coulage dalle RDC");
    fd.set("chantierId", "ch1");
    fd.set("equipeId", "eq1");
    fd.set("sectionId", "sec1");
    fd.set("parentId", "par1");
    fd.set("statut", "EN_COURS");
    fd.set("priorite", "2");
    fd.set("avancement", "40");
    fd.set("description", "Vibrer correctement");
    fd.set("recurrence", "FREQ=WEEKLY");
    const t = parseTache(fd);
    expect(t.chantierId).toBe("ch1");
    expect(t.equipeId).toBe("eq1");
    expect(t.sectionId).toBe("sec1");
    expect(t.parentId).toBe("par1");
    expect(t.statut).toBe("EN_COURS");
    expect(t.priorite).toBe(2);
    expect(t.avancement).toBe(40);
    expect(t.description).toBe("Vibrer correctement");
    expect(t.recurrence).toBe("FREQ=WEEKLY");
    expect(t.dateDebut).toEqual(new Date("2026-07-14"));
    expect(t.dateFin).toEqual(new Date("2026-07-15"));
  });

  it("valeurs vides explicites -> null (mêmes sorties que clés absentes)", () => {
    const fd = formDataPerso();
    fd.set("chantierId", "");
    fd.set("equipeId", "");
    fd.set("sectionId", "");
    fd.set("parentId", "");
    const t = parseTache(fd);
    expect(t.chantierId).toBeNull();
    expect(t.equipeId).toBeNull();
    expect(t.sectionId).toBeNull();
    expect(t.parentId).toBeNull();
  });

  it("nom absent : rejet (champ requis)", () => {
    const fd = new FormData();
    fd.set("dateDebut", "2026-07-14");
    fd.set("dateFin", "2026-07-15");
    expect(() => parseTache(fd)).toThrow();
  });
});

describe("extractDependances / extractLabelIds", () => {
  it("collecte les valeurs multiples et écarte les vides", () => {
    const fd = new FormData();
    fd.append("dependances", "d1");
    fd.append("dependances", "");
    fd.append("dependances", "d2");
    fd.append("labelIds", "l1");
    fd.append("labelIds", "");
    expect(extractDependances(fd)).toEqual(["d1", "d2"]);
    expect(extractLabelIds(fd)).toEqual(["l1"]);
  });

  it("clés absentes : tableaux vides", () => {
    const fd = new FormData();
    expect(extractDependances(fd)).toEqual([]);
    expect(extractLabelIds(fd)).toEqual([]);
  });
});
