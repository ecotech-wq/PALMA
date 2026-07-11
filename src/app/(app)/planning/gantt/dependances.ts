/**
 * Graphe de dépendances côté client (Gantt). Fonctions pures, sans
 * accès base : le serveur reste l'autorité (ajouterDependance refait la
 * détection de cycle en BDD), ces helpers servent à pré-valider le geste
 * et à entraîner visuellement les successeurs pendant le drag.
 *
 * Convention : `dependances` = prédécesseurs (la tâche dépend d'eux).
 * Un « successeur » de T est donc une tâche dont `dependances` contient T.
 */

export type TacheGraphe = {
  id: string;
  dependances?: { id: string }[];
};

export const PROFONDEUR_MAX = 100;

/** Map id -> ids des successeurs directs (tâches qui dépendent de id). */
export function construireSuccesseurs(
  taches: TacheGraphe[]
): Map<string, string[]> {
  const succ = new Map<string, string[]>();
  for (const t of taches) {
    for (const dep of t.dependances ?? []) {
      const list = succ.get(dep.id);
      if (list) list.push(t.id);
      else succ.set(dep.id, [t.id]);
    }
  }
  return succ;
}

/**
 * Successeurs transitifs de `id` (id exclu), parcours en largeur avec
 * garde anti-cycle (ensemble visité) et profondeur bornée.
 */
export function successeursTransitifs(
  id: string,
  successeurs: Map<string, string[]>,
  profondeurMax: number = PROFONDEUR_MAX
): Set<string> {
  const resultat = new Set<string>();
  const visites = new Set<string>([id]);
  let frontiere = [id];
  for (let prof = 0; prof < profondeurMax && frontiere.length > 0; prof++) {
    const suivante: string[] = [];
    for (const cur of frontiere) {
      for (const s of successeurs.get(cur) ?? []) {
        if (visites.has(s)) continue;
        visites.add(s);
        resultat.add(s);
        suivante.push(s);
      }
    }
    frontiere = suivante;
  }
  return resultat;
}

/**
 * Pré-contrôle client : ajouter « tacheId dépend de depId » créerait-il
 * un cycle ? Vrai si depId dépend déjà (directement ou non) de tacheId,
 * c'est-à-dire si tacheId est atteignable depuis depId en remontant les
 * prédécesseurs.
 */
export function creeraitUnCycle(
  tacheId: string,
  depId: string,
  taches: TacheGraphe[],
  profondeurMax: number = PROFONDEUR_MAX
): boolean {
  if (tacheId === depId) return true;
  const parId = new Map(taches.map((t) => [t.id, t]));
  const visites = new Set<string>([depId]);
  let frontiere = [depId];
  for (let prof = 0; prof < profondeurMax && frontiere.length > 0; prof++) {
    const suivante: string[] = [];
    for (const cur of frontiere) {
      for (const pred of parId.get(cur)?.dependances ?? []) {
        if (pred.id === tacheId) return true;
        if (visites.has(pred.id)) continue;
        visites.add(pred.id);
        suivante.push(pred.id);
      }
    }
    frontiere = suivante;
  }
  return false;
}
