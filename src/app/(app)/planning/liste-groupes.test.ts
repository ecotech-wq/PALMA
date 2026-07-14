import { describe, expect, it } from "vitest";
import { groupBySections } from "./liste-groupes";

/**
 * Non-régression sur le regroupement de la vue Liste (bug 2026-07-14 :
 * une seule tâche perso dans « Sans section » mélangeait perso et
 * chantier dans le même contexte de drag, et reordonnerTaches rejetait
 * tout le lot). Invariant verrouillé : un groupe rendu ne contient
 * JAMAIS deux rattachements différents.
 */

const chA = { id: "cA", nom: "Villa Diallo" };
const chB = { id: "cB", nom: "École Sonfonia" };

function t(
  id: string,
  chantier: { id: string; nom: string } | null,
  sectionId: string | null = null
) {
  return { id, chantier, sectionId };
}

describe("groupBySections", () => {
  it("un seul rattachement : un unique bloc « Sans section » (en-tête générique)", () => {
    const groups = groupBySections([t("1", chA), t("2", chA)], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBeNull();
    expect(groups[0].titre).toBeNull();
    expect(groups[0].taches.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("chantier + perso : un bloc par rattachement, jamais de lot mixte", () => {
    const groups = groupBySections(
      [t("1", chA), t("p1", null), t("2", chA), t("p2", null)],
      []
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].titre).toBe("Sans section · Villa Diallo");
    expect(groups[0].taches.map((x) => x.id)).toEqual(["1", "2"]);
    expect(groups[1].titre).toBe("Tâches perso");
    expect(groups[1].taches.map((x) => x.id)).toEqual(["p1", "p2"]);
    // L'invariant qui protège reordonnerTaches : chaque groupe est
    // homogène (un seul chantier, ou que du perso).
    for (const g of groups) {
      const cles = new Set(g.taches.map((x) => x.chantier?.id ?? "__perso__"));
      expect(cles.size).toBe(1);
    }
  });

  it("deux chantiers sans section : deux blocs distincts", () => {
    const groups = groupBySections([t("1", chA), t("2", chB)], []);
    expect(groups).toHaveLength(2);
    expect(groups[0].titre).toBe("Sans section · Villa Diallo");
    expect(groups[1].titre).toBe("Sans section · École Sonfonia");
  });

  it("uniquement des perso : un seul bloc, en-tête générique", () => {
    const groups = groupBySections([t("p1", null), t("p2", null)], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].titre).toBeNull();
    expect(groups[0].taches.map((x) => x.id)).toEqual(["p1", "p2"]);
  });

  it("sections dans l'ordre reçu, sections vides incluses", () => {
    const s1 = { id: "s1" };
    const s2 = { id: "s2" };
    const groups = groupBySections(
      [t("1", chA, "s1"), t("2", chA), t("p1", null)],
      [s1, s2]
    );
    // 2 blocs sans-section (chantier + perso) puis les 2 sections
    expect(groups).toHaveLength(4);
    expect(groups[2].section).toBe(s1);
    expect(groups[2].taches.map((x) => x.id)).toEqual(["1"]);
    expect(groups[3].section).toBe(s2);
    expect(groups[3].taches).toEqual([]);
  });

  it("aucune tâche hors section + des sections : pas de bloc « Sans section »", () => {
    const s1 = { id: "s1" };
    const groups = groupBySections([t("1", chA, "s1")], [s1]);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBe(s1);
  });

  it("aucune tâche ni section : un groupe vide (état d'accueil historique)", () => {
    const groups = groupBySections([], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBeNull();
    expect(groups[0].taches).toEqual([]);
  });
});
