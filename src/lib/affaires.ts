// ─── Module Affaires (CRM) : pipelines, checklists et dormance ───────────────
// Logique PURE (aucune dépendance serveur) : testée dans affaires.test.ts.
// Une affaire est une opportunité commerciale typée (permis de construire,
// étude structure, travaux, essais labo) qui avance d'étape en étape sur un
// pipeline propre à sa typologie, jusqu'à être GAGNEE (et convertie en
// chantier) ou PERDUE. Les clés d'étape sont STABLES (stockées en base dans
// Affaire.etapeCle) ; seuls les libellés sont affichables.

import { bornerJour } from "@/lib/suivi-commercial-calc";
import { diffJours } from "@/lib/relances-calc";

/** Miroir de l'enum Prisma TypologieAffaire (import type interdit ici pour
 *  garder la lib importable par les tests sans client généré). */
export type TypologieAffaire =
  | "PERMIS_CONSTRUIRE"
  | "ETUDE_STRUCTURE"
  | "TRAVAUX"
  | "LABO";

export interface EtapePipeline {
  /** Clé stable, stockée dans Affaire.etapeCle. Ne jamais renommer. */
  cle: string;
  libelle: string;
}

/** Libellés des typologies pour les onglets et les fiches. */
export const LIBELLES_TYPOLOGIE: Record<TypologieAffaire, string> = {
  PERMIS_CONSTRUIRE: "Permis de construire",
  ETUDE_STRUCTURE: "Étude structure",
  TRAVAUX: "Travaux",
  LABO: "Labo",
};

/** Ordre d'affichage des onglets de typologie. */
export const TYPOLOGIES: TypologieAffaire[] = [
  "PERMIS_CONSTRUIRE",
  "ETUDE_STRUCTURE",
  "TRAVAUX",
  "LABO",
];

/**
 * Pipelines validés (2026-07-17). Les issues GAGNEE / PERDUE ne sont pas des
 * étapes : elles vivent dans Affaire.statut, l'affaire garde sa dernière
 * étape au moment de l'issue.
 */
export const PIPELINES: Record<TypologieAffaire, EtapePipeline[]> = {
  PERMIS_CONSTRUIRE: [
    { cle: "contact", libelle: "Prise de contact" },
    { cle: "qualification", libelle: "Qualification" },
    { cle: "visite", libelle: "Visite et relevé" },
    { cle: "pieces", libelle: "Pièces client" },
    { cle: "conception", libelle: "Conception" },
    { cle: "devis", libelle: "Devis envoyé" },
    { cle: "dossier", libelle: "Dossier en cours" },
    { cle: "depose", libelle: "Déposé en mairie" },
    { cle: "instruction", libelle: "Instruction" },
  ],
  ETUDE_STRUCTURE: [
    { cle: "contact", libelle: "Prise de contact" },
    { cle: "qualification", libelle: "Qualification" },
    { cle: "pieces", libelle: "Pièces reçues" },
    { cle: "devis", libelle: "Devis d'honoraires" },
    { cle: "accepte", libelle: "Accepté" },
    { cle: "etude", libelle: "Étude en cours" },
    { cle: "livree", libelle: "Livrée" },
  ],
  TRAVAUX: [
    { cle: "contact", libelle: "Prise de contact" },
    { cle: "qualification", libelle: "Qualification" },
    { cle: "visite", libelle: "Visite de site" },
    { cle: "devis", libelle: "Métré et devis" },
    { cle: "negociation", libelle: "Négociation" },
    { cle: "signe", libelle: "Marché signé" },
  ],
  LABO: [
    { cle: "demande", libelle: "Demande" },
    { cle: "devis", libelle: "Devis" },
    { cle: "echantillons", libelle: "Échantillons reçus" },
    { cle: "essais", libelle: "Essais en cours" },
    { cle: "rapport", libelle: "Rapport livré" },
  ],
};

/** Étapes (ordonnées) du pipeline d'une typologie. */
export function etapesDe(typologie: TypologieAffaire): EtapePipeline[] {
  return PIPELINES[typologie];
}

/** Libellé d'une étape ; repli sur la clé si elle est inconnue (donnée
 *  historique après une évolution de pipeline : on affiche, on ne casse pas). */
export function libelleEtape(
  typologie: TypologieAffaire,
  cle: string
): string {
  return PIPELINES[typologie].find((e) => e.cle === cle)?.libelle ?? cle;
}

/** Élément de la checklist portée par Affaire.checklist (Json). */
export interface ChecklistItem {
  cle: string;
  libelle: string;
  fait: boolean;
}

/**
 * Checklist type posée à la création selon la typologie. Seul le permis de
 * construire a une liste de pièces canonique ; les autres typologies partent
 * vides (l'utilisateur pourra en ajouter plus tard si le besoin émerge).
 */
export function checklistType(typologie: TypologieAffaire): ChecklistItem[] {
  if (typologie === "PERMIS_CONSTRUIRE") {
    return [
      { cle: "cadastre", libelle: "Plan cadastral", fait: false },
      { cle: "geometre", libelle: "Plan de géomètre", fait: false },
      { cle: "topo", libelle: "Relevé topographique", fait: false },
      { cle: "cu", libelle: "Certificat d'urbanisme", fait: false },
      { cle: "photos", libelle: "Photos du site", fait: false },
    ];
  }
  return [];
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
