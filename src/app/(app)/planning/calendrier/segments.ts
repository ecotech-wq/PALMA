/**
 * Découpage des tâches multi-jours en pilules continues, façon Google
 * Calendar : pour chaque semaine affichée, une tâche qui la traverse
 * devient UN segment (colonne de début -> colonne de fin), empilé sur
 * une « lane » (ligne d'empilement) de sorte que deux segments qui se
 * chevauchent ne partagent jamais la même lane.
 *
 * Logique pure (aucune dépendance React) : testée par segments.test.ts.
 */

import { daysBetweenKeys } from "./dates";

/** Plage d'une tâche exprimée en clés de jours "YYYY-MM-DD" (bornes incluses). */
export type Plage = {
  id: string;
  debutKey: string;
  finKey: string;
};

/** Segment d'une plage sur UNE semaine (colonnes 0..6, lundi = 0). */
export type Segment = {
  id: string;
  startCol: number;
  endCol: number;
  /** Vrai si la colonne de départ est le vrai début de la tâche
   *  (extrémité arrondie + poignée d'étirement du début). */
  debutReel: boolean;
  /** Vrai si la colonne de fin est la vraie fin de la tâche
   *  (extrémité arrondie + poignée d'étirement de la fin). */
  finReelle: boolean;
  /** Ligne d'empilement attribuée (0 = juste sous le numéro du jour). */
  lane: number;
};

/**
 * Calcule les segments d'une semaine (7 clés consécutives, lundi en tête)
 * pour l'ensemble des plages fournies. Tri façon Google Calendar : départ
 * le plus tôt d'abord, puis la plus longue (les grandes barres occupent
 * les lanes hautes et restent visuellement continues d'une semaine à
 * l'autre), puis id pour la stabilité. Une plage dont la fin précède le
 * début (donnée dégradée) est ramenée à un seul jour.
 */
export function segmenterSemaine(weekKeys: string[], plages: Plage[]): Segment[] {
  const debutSemaine = weekKeys[0];
  const finSemaine = weekKeys[weekKeys.length - 1];

  const dedans = plages.filter((p) => {
    const fin = p.finKey >= p.debutKey ? p.finKey : p.debutKey;
    return fin >= debutSemaine && p.debutKey <= finSemaine;
  });

  const tries = [...dedans].sort((a, b) => {
    if (a.debutKey !== b.debutKey) return a.debutKey < b.debutKey ? -1 : 1;
    const da = daysBetweenKeys(a.debutKey, a.finKey);
    const db = daysBetweenKeys(b.debutKey, b.finKey);
    if (da !== db) return db - da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // finDeLane[l] = dernière colonne occupée sur la lane l.
  const finDeLane: number[] = [];
  const segments: Segment[] = [];
  for (const p of tries) {
    const finKey = p.finKey >= p.debutKey ? p.finKey : p.debutKey;
    const startCol = Math.max(0, daysBetweenKeys(debutSemaine, p.debutKey));
    const endCol = Math.max(
      startCol,
      Math.min(6, daysBetweenKeys(debutSemaine, finKey))
    );
    let lane = finDeLane.findIndex((fin) => fin < startCol);
    if (lane === -1) {
      lane = finDeLane.length;
      finDeLane.push(endCol);
    } else {
      finDeLane[lane] = endCol;
    }
    segments.push({
      id: p.id,
      startCol,
      endCol,
      debutReel: p.debutKey >= debutSemaine,
      finReelle: finKey <= finSemaine,
      lane,
    });
  }
  return segments;
}

/**
 * Nombre de segments masqués (lane >= lanesVisibles) couvrant chaque
 * colonne de la semaine. Alimente les liens « +N autres » de la vue mois.
 */
export function compterMasques(
  segments: Segment[],
  lanesVisibles: number
): number[] {
  const caches = new Array<number>(7).fill(0);
  for (const s of segments) {
    if (s.lane < lanesVisibles) continue;
    for (let c = s.startCol; c <= s.endCol; c++) caches[c]++;
  }
  return caches;
}

/** Nombre de lanes nécessaires pour afficher tous les segments (0 si aucun). */
export function nbLanes(segments: Segment[]): number {
  return segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
}
