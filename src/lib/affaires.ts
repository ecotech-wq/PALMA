// ─── Module Affaires (CRM) : checklists, dormance et traces ─────────────────
// Logique PURE (aucune dépendance serveur) : testée dans affaires.test.ts.
// Une affaire est une opportunité commerciale qui avance d'étape en étape
// sur la PROCÉDURE (pipeline) de son entreprise, jusqu'à être GAGNEE (et
// convertie en chantier) ou PERDUE. Depuis le 2026-07-18, les pipelines
// sont des DONNÉES éditables par espace (modèle PipelineAffaire) : leur
// logique pure (palette, étapes, validation, modèles par défaut) vit dans
// lib/pipelines.ts. Les clés d'étape restent STABLES (stockées en base
// dans Affaire.etapeCle) ; seuls les libellés sont affichables.

import { bornerJour } from "@/lib/suivi-commercial-calc";
import { diffJours } from "@/lib/relances-calc";

/** Miroir de l'enum Prisma TypologieAffaire (import type interdit ici pour
 *  garder la lib importable par les tests sans client généré). Compat :
 *  la colonne reste en base, plus utilisée pour l'affichage (le pipeline
 *  porte libellé, couleur et étapes). */
export type TypologieAffaire =
  | "PERMIS_CONSTRUIRE"
  | "ETUDE_STRUCTURE"
  | "TRAVAUX"
  | "LABO";

/** Élément de la checklist portée par Affaire.checklist (Json). La liste
 *  naît de PipelineAffaire.checklistModele (checklistInitiale de
 *  lib/pipelines.ts) puis vit sa vie propre à l'affaire. */
export interface ChecklistItem {
  cle: string;
  libelle: string;
  fait: boolean;
}

/** Relit la checklist stockée en Json en tolérant les données inattendues. */
export function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ChecklistItem[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as { cle?: unknown }).cle === "string" &&
      typeof (it as { libelle?: unknown }).libelle === "string"
    ) {
      items.push({
        cle: (it as { cle: string }).cle,
        libelle: (it as { libelle: string }).libelle,
        fait: (it as { fait?: unknown }).fait === true,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------
 *  Traces système du fil d'affaire (canal = journal vivant)
 *
 *  Chaque geste de pilotage (replanifier la prochaine action, changer le
 *  responsable, cocher une pièce, confier une action) laisse une phrase
 *  dans le canal de l'affaire, comme changerEtape le fait déjà. Textes
 *  construits ici (logique pure, testée) ; l'écriture reste dans les
 *  server actions (tracerDansCanal).
 * ----------------------------------------------------------------------- */

/** "JJ/MM" pour les échéances @db.Date (minuit UTC) : le fuseau UTC évite
 *  le décalage d'un jour sur un serveur à l'ouest ou à l'est de Greenwich. */
const traceDateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** « Prochaine action : LIBELLÉ pour le JJ/MM (Auteur). » Les variantes
 *  sans date, sans libellé ou effacée restent des phrases complètes. */
export function texteTraceProchaineAction(
  libelle: string | null,
  echeance: Date | null,
  auteur: string
): string {
  if (!libelle && !echeance) return `Prochaine action effacée (${auteur}).`;
  const corps = libelle
    ? `Prochaine action : ${libelle}`
    : "Prochaine action";
  const quand = echeance ? ` pour le ${traceDateFmt.format(echeance)}` : "";
  return `${corps}${quand} (${auteur}).`;
}

/** « Responsable : NOM (Auteur). » ; null = responsable retiré. */
export function texteTraceResponsable(
  nom: string | null,
  auteur: string
): string {
  return nom
    ? `Responsable : ${nom} (${auteur}).`
    : `Responsable retiré (${auteur}).`;
}

/** « Pièce reçue : Plan cadastral (Auteur). » / « Pièce décochée : ... ». */
export function texteTracePiece(
  libelle: string,
  fait: boolean,
  auteur: string
): string {
  return fait
    ? `Pièce reçue : ${libelle} (${auteur}).`
    : `Pièce décochée : ${libelle} (${auteur}).`;
}

/** « Action confiée à PRÉNOM : LIBELLÉ pour le JJ/MM (Auteur). » */
export function texteTraceActionConfiee(
  cible: string,
  nom: string,
  echeance: Date,
  auteur: string
): string {
  return (
    `Action confiée à ${cible} : ${nom}` +
    ` pour le ${traceDateFmt.format(echeance)} (${auteur}).`
  );
}

/** Ce que la dormance a besoin de connaître d'une affaire. */
export interface AffaireDormance {
  statut: string;
  /** Échéance de la prochaine action (@db.Date, minuit UTC) ; null = aucune. */
  prochaineActionLe: Date | null;
  /** Date d'entrée dans l'étape courante (dernier mouvement du pipeline). */
  etapeDepuis: Date;
}

export type MotifDormance = "ACTION_EN_RETARD" | "SANS_ACTION";

export interface ConstatDormance {
  motif: MotifDormance;
  /** ACTION_EN_RETARD : jours de retard (>= 1).
   *  SANS_ACTION : jours passés dans l'étape sans prochaine action (>= 14). */
  jours: number;
}

/** Sans prochaine action planifiée, une affaire EN_COURS devient dormante
 *  après ce nombre de jours passés dans la même étape. */
export const SEUIL_DORMANCE_JOURS = 14;

/**
 * Une affaire est DORMANTE (pastille ambre au kanban, palier
 * AFFAIRE_DORMANTE au balayage des relances) quand elle est EN_COURS et :
 *  - sa prochaine action est échue (prochaineActionLe strictement avant
 *    aujourd'hui : une action due aujourd'hui n'est pas en retard) ; ou
 *  - aucune prochaine action n'est planifiée depuis au moins 14 jours
 *    dans l'étape courante (etapeDepuis fait foi).
 * Renvoie null si l'affaire est active (ou close) ; sinon le motif et
 * l'écart en jours qui sert aux libellés.
 */
export function estDormante(
  affaire: AffaireDormance,
  aujourdhui: Date
): ConstatDormance | null {
  if (affaire.statut !== "EN_COURS") return null;
  if (affaire.prochaineActionLe) {
    const retard = diffJours(affaire.prochaineActionLe, aujourdhui);
    return retard > 0 ? { motif: "ACTION_EN_RETARD", jours: retard } : null;
  }
  const inactif = diffJours(affaire.etapeDepuis, aujourdhui);
  return inactif >= SEUIL_DORMANCE_JOURS
    ? { motif: "SANS_ACTION", jours: inactif }
    : null;
}

/** Ancienneté dans l'étape courante, en jours entiers (affichage cartes). */
export function joursDansEtape(etapeDepuis: Date, aujourdhui: Date): number {
  return Math.max(0, diffJours(etapeDepuis, aujourdhui));
}

/**
 * Valeur du pipeline : somme des valeurs estimées par étape (clé -> euros).
 * Les affaires sans valeur comptent pour zéro ; les étapes sans affaire
 * n'apparaissent pas dans le résultat.
 */
export function valeurPipeline(
  affaires: { etapeCle: string; valeurEstimee: number | null }[]
): Record<string, number> {
  const parEtape: Record<string, number> = {};
  for (const a of affaires) {
    parEtape[a.etapeCle] = (parEtape[a.etapeCle] ?? 0) + (a.valeurEstimee ?? 0);
  }
  return parEtape;
}

export { bornerJour };
