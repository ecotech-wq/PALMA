import { describe, expect, it } from "vitest";
import {
  compterMasques,
  nbLanes,
  segmenterSemaine,
  type Plage,
} from "./segments";

// Semaine du lundi 6 au dimanche 12 juillet 2026.
const SEMAINE = [
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
];

function plage(id: string, debutKey: string, finKey: string): Plage {
  return { id, debutKey, finKey };
}

describe("segmenterSemaine", () => {
  it("une tâche de 4 jours dans la semaine = un segment aux deux bouts réels", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-07-07", "2026-07-10"),
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      id: "A",
      startCol: 1,
      endCol: 4,
      debutReel: true,
      finReelle: true,
      lane: 0,
    });
  });

  it("une tâche à cheval sur la semaine précédente est tronquée à gauche", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-07-03", "2026-07-08"),
    ]);
    expect(segs[0]).toMatchObject({
      startCol: 0,
      endCol: 2,
      debutReel: false,
      finReelle: true,
    });
  });

  it("une tâche traversante occupe les 7 colonnes sans extrémité réelle", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-06-29", "2026-07-20"),
    ]);
    expect(segs[0]).toMatchObject({
      startCol: 0,
      endCol: 6,
      debutReel: false,
      finReelle: false,
    });
  });

  it("exclut les plages hors semaine", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("avant", "2026-06-29", "2026-07-05"),
      plage("apres", "2026-07-13", "2026-07-15"),
      plage("dedans", "2026-07-06", "2026-07-06"),
    ]);
    expect(segs.map((s) => s.id)).toEqual(["dedans"]);
  });

  it("empile les chevauchements et réutilise les lanes libérées", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-07-06", "2026-07-08"),
      plage("B", "2026-07-07", "2026-07-09"),
      plage("C", "2026-07-10", "2026-07-11"),
    ]);
    const byId = new Map(segs.map((s) => [s.id, s]));
    expect(byId.get("A")!.lane).toBe(0);
    expect(byId.get("B")!.lane).toBe(1); // chevauche A
    expect(byId.get("C")!.lane).toBe(0); // la lane 0 est libre après A
    expect(nbLanes(segs)).toBe(2);
  });

  it("à départ égal, la plus longue passe en premier (lane haute)", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("courte", "2026-07-06", "2026-07-07"),
      plage("longue", "2026-07-06", "2026-07-12"),
    ]);
    const byId = new Map(segs.map((s) => [s.id, s]));
    expect(byId.get("longue")!.lane).toBe(0);
    expect(byId.get("courte")!.lane).toBe(1);
  });

  it("ramène à un jour une plage dont la fin précède le début", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("X", "2026-07-09", "2026-07-07"),
    ]);
    expect(segs[0]).toMatchObject({ startCol: 3, endCol: 3 });
  });
});

describe("compterMasques", () => {
  it("compte, jour par jour, les segments au-delà des lanes visibles", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-07-06", "2026-07-10"),
      plage("B", "2026-07-06", "2026-07-08"),
      plage("C", "2026-07-07", "2026-07-09"),
      plage("D", "2026-07-08", "2026-07-08"),
    ]);
    // 2 lanes visibles : A (lane 0) et B (lane 1) restent, C et D débordent.
    const caches = compterMasques(segs, 2);
    expect(caches).toEqual([0, 1, 2, 1, 0, 0, 0]);
  });

  it("aucun masqué quand tout tient dans les lanes visibles", () => {
    const segs = segmenterSemaine(SEMAINE, [
      plage("A", "2026-07-06", "2026-07-07"),
    ]);
    expect(compterMasques(segs, 3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
