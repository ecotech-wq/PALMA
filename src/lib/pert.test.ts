import { describe, it, expect } from "vitest";
import { computePert, topologicalSort } from "./pert";

const d = (s: string) => new Date(s + "T00:00:00.000Z");

describe("topologicalSort", () => {
  it("ordre simple : A → B → C", () => {
    const order = topologicalSort([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-02"), dependances: [] },
      { id: "B", nom: "B", dateDebut: d("2026-01-03"), dateFin: d("2026-01-04"), dependances: ["A"] },
      { id: "C", nom: "C", dateDebut: d("2026-01-05"), dateFin: d("2026-01-06"), dependances: ["B"] },
    ]);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("détecte un cycle", () => {
    expect(() =>
      topologicalSort([
        { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-02"), dependances: ["B"] },
        { id: "B", nom: "B", dateDebut: d("2026-01-01"), dateFin: d("2026-01-02"), dependances: ["A"] },
      ])
    ).toThrow();
  });

  it("ignore une dépendance externe inconnue", () => {
    const order = topologicalSort([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-02"), dependances: ["EXT"] },
    ]);
    expect(order).toEqual(["A"]);
  });
});

describe("computePert", () => {
  it("projet vide", () => {
    const r = computePert([]);
    expect(r.taches).toEqual([]);
    expect(r.finProjet).toBeNull();
    expect(r.cheminCritique).toEqual([]);
  });

  it("une seule tâche : critique par défaut", () => {
    const r = computePert([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-03"), dependances: [] },
    ]);
    expect(r.taches[0].dureeJours).toBe(3);
    expect(r.taches[0].slack).toBe(0);
    expect(r.taches[0].critical).toBe(true);
    expect(r.cheminCritique).toEqual(["A"]);
  });

  it("chaîne séquentielle A → B → C : toutes critiques", () => {
    const r = computePert([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-02"), dependances: [] },
      { id: "B", nom: "B", dateDebut: d("2026-01-03"), dateFin: d("2026-01-04"), dependances: ["A"] },
      { id: "C", nom: "C", dateDebut: d("2026-01-05"), dateFin: d("2026-01-06"), dependances: ["B"] },
    ]);
    expect(r.taches.every((t) => t.critical)).toBe(true);
    expect(r.cheminCritique).toEqual(["A", "B", "C"]);
  });

  it("branche parallèle : la plus courte a du slack", () => {
    // A (3j) → D
    // A → B (5j) → D
    // A → C (2j) → D
    // Le chemin A-B-D est le plus long ; C a un slack
    const r = computePert([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-03"), dependances: [] },
      { id: "B", nom: "B", dateDebut: d("2026-01-04"), dateFin: d("2026-01-08"), dependances: ["A"] },
      { id: "C", nom: "C", dateDebut: d("2026-01-04"), dateFin: d("2026-01-05"), dependances: ["A"] },
      { id: "D", nom: "D", dateDebut: d("2026-01-09"), dateFin: d("2026-01-10"), dependances: ["B", "C"] },
    ]);
    const a = r.taches.find((t) => t.id === "A")!;
    const b = r.taches.find((t) => t.id === "B")!;
    const c = r.taches.find((t) => t.id === "C")!;
    const dT = r.taches.find((t) => t.id === "D")!;
    expect(a.slack).toBe(0);
    expect(b.slack).toBe(0);
    expect(dT.slack).toBe(0);
    expect(c.slack).toBe(3); // C peut glisser de 3 jours sans impacter D
    expect(r.cheminCritique).toEqual(["A", "B", "D"]);
  });

  it("niveaux topologiques", () => {
    const r = computePert([
      { id: "A", nom: "A", dateDebut: d("2026-01-01"), dateFin: d("2026-01-01"), dependances: [] },
      { id: "B", nom: "B", dateDebut: d("2026-01-01"), dateFin: d("2026-01-01"), dependances: [] },
      { id: "C", nom: "C", dateDebut: d("2026-01-02"), dateFin: d("2026-01-02"), dependances: ["A"] },
      { id: "D", nom: "D", dateDebut: d("2026-01-03"), dateFin: d("2026-01-03"), dependances: ["B", "C"] },
    ]);
    expect(r.niveaux[0].sort()).toEqual(["A", "B"]);
    expect(r.niveaux[1]).toEqual(["C"]);
    expect(r.niveaux[2]).toEqual(["D"]);
  });
});
