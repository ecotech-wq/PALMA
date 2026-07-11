/**
 * Mise en page du réseau PERT : colonnes par niveau topologique, réduction
 * simple des croisements par tri barycentrique (méthode de Sugiyama allégée,
 * la même heuristique que les outils CPM open source type pyCritical).
 *
 * Fonctions pures, sans accès DOM : testables unitairement.
 */

export const PERT_NODE_W = 200;
export const PERT_NODE_H = 120;
export const PERT_COL_GAP = 90;
export const PERT_ROW_GAP = 40;
export const PERT_PADDING = 24;

/**
 * Réordonne les noeuds de chaque niveau par barycentre : un noeud est placé
 * à la hauteur moyenne de ses prédécesseurs (passe avant), puis de ses
 * successeurs (passe arrière). Deux allers-retours suffisent en pratique à
 * éliminer la plupart des croisements de flèches sur des graphes de chantier.
 *
 * `predecesseurs` : id -> ids des tâches dont il dépend.
 * Le tri est stable : sans information, un noeud garde sa place.
 */
export function ordonnerNiveauxParBarycentre(
  niveaux: string[][],
  predecesseurs: Map<string, string[]>,
  nbPasses = 2
): string[][] {
  // Successeurs dérivés des prédécesseurs (id -> tâches qui dépendent de id).
  const successeurs = new Map<string, string[]>();
  for (const [id, preds] of predecesseurs) {
    for (const p of preds) {
      const liste = successeurs.get(p);
      if (liste) liste.push(id);
      else successeurs.set(p, [id]);
    }
  }

  const ordre = niveaux.map((n) => [...n]);
  // Rang courant (index de ligne) de chaque noeud dans son niveau.
  const rang = new Map<string, number>();
  const majRangs = (niveau: string[]) =>
    niveau.forEach((id, i) => rang.set(id, i));
  ordre.forEach(majRangs);

  const trier = (niveau: string[], voisins: Map<string, string[]>) => {
    const bary = new Map<string, number>();
    niveau.forEach((id, i) => {
      const vs = (voisins.get(id) ?? []).filter((v) => rang.has(v));
      bary.set(
        id,
        vs.length === 0
          ? i
          : vs.reduce((s, v) => s + (rang.get(v) ?? 0), 0) / vs.length
      );
    });
    niveau.sort((a, b) => (bary.get(a) ?? 0) - (bary.get(b) ?? 0));
    majRangs(niveau);
  };

  for (let passe = 0; passe < nbPasses; passe++) {
    for (let l = 1; l < ordre.length; l++) trier(ordre[l], predecesseurs);
    for (let l = ordre.length - 2; l >= 0; l--) trier(ordre[l], successeurs);
  }
  return ordre;
}

/**
 * Positions absolues (coin haut-gauche) de chaque noeud, colonnes centrées
 * verticalement, plus les dimensions totales du monde SVG.
 */
export function calculerPositionsPert(niveaux: string[][]): {
  positions: Map<string, { x: number; y: number }>;
  largeur: number;
  hauteur: number;
} {
  const maxLignes = Math.max(1, ...niveaux.map((n) => n.length));
  const hauteurUtile =
    maxLignes * PERT_NODE_H + (maxLignes - 1) * PERT_ROW_GAP;

  const positions = new Map<string, { x: number; y: number }>();
  niveaux.forEach((ids, niveau) => {
    const hCol =
      ids.length * PERT_NODE_H + Math.max(0, ids.length - 1) * PERT_ROW_GAP;
    const yBase = PERT_PADDING + (hauteurUtile - hCol) / 2;
    ids.forEach((id, ligne) => {
      positions.set(id, {
        x: PERT_PADDING + niveau * (PERT_NODE_W + PERT_COL_GAP),
        y: yBase + ligne * (PERT_NODE_H + PERT_ROW_GAP),
      });
    });
  });

  const nbNiveaux = Math.max(1, niveaux.length);
  return {
    positions,
    largeur:
      PERT_PADDING * 2 + nbNiveaux * PERT_NODE_W + (nbNiveaux - 1) * PERT_COL_GAP,
    hauteur: PERT_PADDING * 2 + hauteurUtile,
  };
}
