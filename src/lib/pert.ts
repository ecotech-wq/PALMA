/**
 * Analyse PERT (Program Evaluation and Review Technique).
 *
 * Calcule pour chaque tâche :
 *  - ES (early start)  : date au plus tôt
 *  - EF (early finish) : date au plus tôt + durée
 *  - LS (late start)   : date au plus tard - durée
 *  - LF (late finish)  : date au plus tard
 *  - slack             : marge (LF - EF) en jours
 *  - level             : niveau topologique (0 = pas de dépendance)
 *  - critical          : true si slack === 0
 *
 * Le chemin critique = ensemble des tâches avec slack === 0 reliées par des
 * dépendances, du début à la fin du projet.
 *
 * Logique pure, sans I/O. Testable unitairement.
 */

export interface PertTaskInput {
  id: string;
  nom: string;
  dateDebut: Date;
  dateFin: Date;
  /** IDs des tâches qui doivent être terminées avant celle-ci. */
  dependances: string[];
}

export interface PertTaskResult {
  id: string;
  nom: string;
  dureeJours: number;
  level: number;
  ES: Date;
  EF: Date;
  LS: Date;
  LF: Date;
  /** Marge en jours (LF - EF). 0 = critique. */
  slack: number;
  critical: boolean;
  dependances: string[];
}

export interface PertResult {
  taches: PertTaskResult[];
  /** Niveaux ordonnés du plus tôt au plus tard. Chaque niveau contient les IDs de tâches. */
  niveaux: string[][];
  /** Date de fin du projet (max EF). */
  finProjet: Date | null;
  /** Liste ordonnée des IDs sur le chemin critique. */
  cheminCritique: string[];
}

const ONE_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / ONE_DAY);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return startOfDay(x);
}

/**
 * Tri topologique des tâches selon leurs dépendances (Kahn's algorithm).
 * Retourne les IDs dans l'ordre où ils doivent être traités.
 * Lève une erreur si un cycle est détecté.
 */
export function topologicalSort(taches: PertTaskInput[]): string[] {
  const ids = new Set(taches.map((t) => t.id));
  const inDegree = new Map<string, number>();
  const reverseDeps = new Map<string, string[]>(); // id -> liste des tâches qui dépendent de lui

  for (const t of taches) {
    inDegree.set(t.id, 0);
    reverseDeps.set(t.id, []);
  }
  for (const t of taches) {
    for (const dep of t.dependances) {
      if (!ids.has(dep)) continue; // dep externe ignorée
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      reverseDeps.get(dep)!.push(t.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of reverseDeps.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (sorted.length !== taches.length) {
    throw new Error("Cycle détecté dans les dépendances de tâches");
  }
  return sorted;
}

export function computePert(taches: PertTaskInput[]): PertResult {
  if (taches.length === 0) {
    return { taches: [], niveaux: [], finProjet: null, cheminCritique: [] };
  }

  const byId = new Map(taches.map((t) => [t.id, t]));
  const order = topologicalSort(taches);

  // Durée = nb de jours entre dateDebut et dateFin (inclusif → +1)
  const duree = new Map<string, number>();
  for (const t of taches) {
    duree.set(t.id, Math.max(1, diffDays(t.dateDebut, t.dateFin) + 1));
  }

  // Forward pass : ES et EF
  const ES = new Map<string, Date>();
  const EF = new Map<string, Date>();
  const level = new Map<string, number>();

  for (const id of order) {
    const t = byId.get(id)!;
    const validDeps = t.dependances.filter((d) => byId.has(d));
    let earliestStart: Date;
    let lvl = 0;
    if (validDeps.length === 0) {
      earliestStart = startOfDay(t.dateDebut);
    } else {
      // Démarre au plus tard des EF des dépendances, mais pas avant sa propre dateDebut.
      let max = startOfDay(t.dateDebut);
      for (const d of validDeps) {
        const dEF = EF.get(d);
        if (dEF && dEF > max) max = dEF;
        const dLevel = level.get(d) ?? 0;
        if (dLevel + 1 > lvl) lvl = dLevel + 1;
      }
      earliestStart = max;
    }
    ES.set(id, earliestStart);
    EF.set(id, addDays(earliestStart, duree.get(id)!));
    level.set(id, lvl);
  }

  // Date de fin de projet = max EF
  let finProjet: Date | null = null;
  for (const ef of EF.values()) {
    if (!finProjet || ef > finProjet) finProjet = ef;
  }

  // Backward pass : LF et LS
  const LF = new Map<string, Date>();
  const LS = new Map<string, Date>();
  const reverseDeps = new Map<string, string[]>();
  for (const t of taches) reverseDeps.set(t.id, []);
  for (const t of taches) {
    for (const dep of t.dependances) {
      if (byId.has(dep)) reverseDeps.get(dep)!.push(t.id);
    }
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const successeurs = reverseDeps.get(id) ?? [];
    let latestFinish: Date;
    if (successeurs.length === 0) {
      latestFinish = finProjet ?? EF.get(id)!;
    } else {
      let min = LS.get(successeurs[0])!;
      for (let j = 1; j < successeurs.length; j++) {
        const ls = LS.get(successeurs[j])!;
        if (ls < min) min = ls;
      }
      latestFinish = min;
    }
    LF.set(id, latestFinish);
    LS.set(id, addDays(latestFinish, -duree.get(id)!));
  }

  // Construire les résultats
  const result: PertTaskResult[] = taches.map((t) => {
    const ef = EF.get(t.id)!;
    const lf = LF.get(t.id)!;
    const slack = diffDays(ef, lf);
    return {
      id: t.id,
      nom: t.nom,
      dureeJours: duree.get(t.id)!,
      level: level.get(t.id) ?? 0,
      ES: ES.get(t.id)!,
      EF: ef,
      LS: LS.get(t.id)!,
      LF: lf,
      slack,
      critical: slack === 0,
      dependances: t.dependances.filter((d) => byId.has(d)),
    };
  });

  // Niveaux : group by level
  const niveauxMap = new Map<number, string[]>();
  for (const r of result) {
    if (!niveauxMap.has(r.level)) niveauxMap.set(r.level, []);
    niveauxMap.get(r.level)!.push(r.id);
  }
  const niveaux: string[][] = [];
  const maxLevel = Math.max(...Array.from(niveauxMap.keys()), 0);
  for (let i = 0; i <= maxLevel; i++) {
    niveaux.push(niveauxMap.get(i) ?? []);
  }

  // Chemin critique : suivre les tâches critical en commençant par celles sans dep critique
  const cheminCritique: string[] = result
    .filter((r) => r.critical)
    .sort((a, b) => a.ES.getTime() - b.ES.getTime() || a.level - b.level)
    .map((r) => r.id);

  return { taches: result, niveaux, finProjet, cheminCritique };
}
