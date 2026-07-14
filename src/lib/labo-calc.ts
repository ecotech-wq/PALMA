// ─── Module labo : règles PURES (testables, sans accès base) ─────────────────
// Seuil de conformité dérivé de la classe de résistance prescrite, classement
// des échéances d'essais (à échéance / échu) et verdict de conformité. La
// lecture base, les notifications et le journal de relances vivent dans
// src/app/(app)/labo/actions.ts et src/lib/relances.ts ; ici, rien que des
// fonctions déterministes verrouillées par labo-calc.test.ts.

import { diffJours } from "@/lib/relances-calc";

// ── Flux béton chantier : échéances d'écrasement par défaut ─────────────────

/** Écrasement d'information à 7 jours (suivi de montée en résistance). */
export const ECHEANCE_INFO_BETON_JOURS = 7;
/** Écrasement normatif à 28 jours (NF EN 12390-3, verdict de conformité). */
export const ECHEANCE_NORMATIVE_BETON_JOURS = 28;

/** Fenêtre de préavis : un essai est « à échéance » à 3 jours ou moins. */
export const PREAVIS_ECHEANCE_ESSAI_JOURS = 3;

// ── Codes d'éprouvettes ──────────────────────────────────────────────────────

const LETTRES_EPROUVETTES = "ABCDEFGHIJKL";

/** Plafond d'éprouvettes par prélèvement (une lettre par éprouvette). */
export const MAX_EPROUVETTES_PRELEVEMENT = LETTRES_EPROUVETTES.length;

/**
 * Code imprimable d'une éprouvette : la référence du prélèvement suffixée
 * d'une lettre (« BET-014-A », « BET-014-B »...). L'unicité globale est
 * portée par la contrainte @unique d'EprouvetteLabo.code.
 */
export function codeEprouvette(reference: string, index: number): string {
  if (index < 0 || index >= MAX_EPROUVETTES_PRELEVEMENT) {
    throw new Error(
      `Index d'éprouvette hors bornes (0..${MAX_EPROUVETTES_PRELEVEMENT - 1})`
    );
  }
  return `${reference}-${LETTRES_EPROUVETTES[index]}`;
}

// ── Seuil de conformité depuis la classe prescrite ──────────────────────────

/**
 * Seuil de conformité (MPa) dérivé d'une classe de résistance prescrite :
 * « C25/30 » -> 25, la résistance caractéristique sur CYLINDRE (fck,cyl),
 * référence du contrôle en France (éprouvettes cylindriques 16x32,
 * NF EN 206/CN et NF EN 12390-3). Tolère la casse et les espaces, les
 * bétons légers (« LC25/28 »), un suffixe de prescription après la classe
 * (« C25/30 XC1 », courant sur les bons de commande : classe + classe
 * d'exposition) et, à défaut du couple cylindre/cube, une valeur
 * caractéristique seule (« C25 », « 25 »).
 *
 * Si `geometrie` désigne une éprouvette CUBIQUE (le libellé contient
 * « cube »), la référence devient la valeur CUBE de la classe (fck,cube,
 * « C25/30 » -> 30) : comparer un écrasement cube au seuil cylindre serait
 * non conservatif (environ 5 MPa trop clément). Sans valeur cube dans la
 * classe, renvoie null plutôt qu'un seuil faux.
 *
 * Renvoie null si la classe est illisible : l'essai reste alors sans seuil
 * et le verdict de conformité sera neutre (null), jamais un faux
 * « conforme ».
 */
export function seuilDepuisClasse(
  classe: string | null | undefined,
  geometrie?: string | null
): number | null {
  if (!classe) return null;
  // Motif ancré en tête ; la suite éventuelle (classes d'exposition,
  // consistance...) doit être séparée par un espace et est ignorée.
  const m = classe
    .trim()
    .toUpperCase()
    .match(/^(?:LC|C)?\s*(\d{1,3})\s*(?:\/\s*(\d{1,3}))?(?:\s+.*)?$/);
  if (!m) return null;
  if (geometrie && /cube/i.test(geometrie)) {
    const cube = m[2] ? Number(m[2]) : null;
    return cube != null && cube > 0 ? cube : null;
  }
  const cylindre = Number(m[1]);
  return cylindre > 0 ? cylindre : null;
}

// ── Classement d'un essai par rapport à son échéance ────────────────────────

export interface EssaiAClasser {
  /** StatutEssaiLabo : seuls PLANIFIE et EN_COURS sont surveillés. */
  statut: string;
  echeance: Date | null;
}

export type ClasseEssai = "A_ECHEANCE" | "ECHU";

/**
 * Constat de classement : la classe atteinte et l'écart en jours qui sert
 * aux libellés. ECHU : `jours` = jours de RETARD (>= 1). A_ECHEANCE :
 * `jours` = jours AVANT l'échéance (0..3, 0 = aujourd'hui).
 */
export interface ConstatEssai {
  classe: ClasseEssai;
  jours: number;
}

/**
 * Classe un essai par rapport à son échéance, en jours bornés à minuit UTC
 * (l'heure du balayage ne décale jamais le classement, même convention que
 * relances-calc) :
 * - ECHU : échéance passée d'au moins 1 jour ;
 * - A_ECHEANCE : échéance aujourd'hui ou dans les 3 jours à venir.
 * Renvoie null hors périmètre : essai déjà validé ou annulé, sans échéance,
 * ou échéance à plus de 3 jours.
 */
export function classerEssai(
  e: EssaiAClasser,
  aujourdHui: Date
): ConstatEssai | null {
  if (e.statut !== "PLANIFIE" && e.statut !== "EN_COURS") return null;
  if (!e.echeance) return null;

  const retard = diffJours(e.echeance, aujourdHui); // > 0 = échéance passée
  if (retard >= 1) return { classe: "ECHU", jours: retard };
  // « + 0 » évite le zéro négatif (-0) quand l'échéance tombe aujourd'hui.
  if (retard >= -PREAVIS_ECHEANCE_ESSAI_JOURS) {
    return { classe: "A_ECHEANCE", jours: -retard + 0 };
  }
  return null;
}

// ── Verdict de conformité ────────────────────────────────────────────────────

/**
 * Verdict de conformité d'un résultat : conforme si la valeur atteint le
 * seuil (valeur >= seuil). Sans seuil exploitable, verdict neutre (null) :
 * on ne déclare jamais conforme ou non conforme sans référence.
 */
export function verdictConformite(
  valeur: number,
  seuil: number | null | undefined
): boolean | null {
  if (seuil == null || !Number.isFinite(seuil)) return null;
  return valeur >= seuil;
}
