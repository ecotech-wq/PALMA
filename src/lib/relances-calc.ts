// ─── Relances financières : classification PURE (testable, sans accès base) ──
// Le moteur de relances CONSTATE et NOTIFIE L'ÉQUIPE ; il n'écrit jamais au
// client et ne change jamais un statut métier. Ici ne vit que la règle de
// classement par paliers (échéances bornées au jour, comme le reste du dépôt) ;
// la lecture base et la notification vivent dans src/lib/relances.ts.
// Paliers d'usage BTP : préavis d'échéance, relance amiable (1), relance
// formelle (2), courrier recommandé (3), mise en demeure au-delà de 30 jours.

import { bornerJour } from "@/lib/suivi-commercial-calc";

const JOUR_MS = 24 * 3600 * 1000;

/** Paliers propres au cycle de règlement d'une facture. */
export type PalierFacture =
  | "PREAVIS_ECHEANCE"
  | "RELANCE_1"
  | "RELANCE_2"
  | "RELANCE_3"
  | "MISE_EN_DEMEURE";

/** Tous les paliers du moteur (miroir de l'enum Prisma PalierRelance).
 *  ESSAI_ECHU vient du module labo : sa classification pure vit dans
 *  src/lib/labo-calc.ts (classerEssai), pas ici. AFFAIRE_DORMANTE vient du
 *  module affaires (CRM) : sa classification pure vit dans
 *  src/lib/affaires.ts (estDormante). */
export type PalierRelance =
  | PalierFacture
  | "DEVIS_SANS_REPONSE"
  | "SITUATION_A_FACTURER"
  | "RETENUE_LIBERABLE"
  | "ESSAI_ECHU"
  | "AFFAIRE_DORMANTE";

/**
 * Constat de classification : le palier atteint et l'écart en jours qui sert
 * aux libellés. Le SENS de `jours` dépend de la fonction (documenté sur
 * chacune) : jours de retard, jours d'attente, ou jours avant une échéance.
 */
export interface ConstatPalier<P extends PalierRelance = PalierRelance> {
  palier: P;
  jours: number;
}

/**
 * Écart en jours ENTIERS entre deux dates, chacune ramenée à minuit UTC :
 * l'heure de passage du balayage ne décale jamais un palier.
 * Positif si `a` est après `de`.
 */
export function diffJours(de: Date, a: Date): number {
  return Math.round(
    (bornerJour(a).getTime() - bornerJour(de).getTime()) / JOUR_MS
  );
}

// ── Facture : préavis puis 4 paliers de retard ───────────────────────────────

export interface FactureAClasser {
  /** StatutEmission : seules EMISE et ENVOYEE sont relançables. */
  statutEmission: string;
  /** StatutReglement : seules NON_PAYEE et PARTIELLEMENT_PAYEE le sont. */
  statutReglement: string;
  dateEcheance: Date | null;
}

/**
 * Classe une facture par rapport à son échéance :
 * - PREAVIS_ECHEANCE : échéance dans 0 à 7 jours à venir (`jours` = jours
 *   AVANT l'échéance, 0..7) ;
 * - RELANCE_1 : échue de 1 à 7 jours ; RELANCE_2 : 8 à 15 ; RELANCE_3 :
 *   16 à 30 ; MISE_EN_DEMEURE : au-delà de 30 (`jours` = jours de RETARD).
 * Renvoie null hors périmètre (brouillon, annulée, payée, sans échéance,
 * ou échéance à plus de 7 jours).
 */
export function classerFacture(
  f: FactureAClasser,
  aujourdHui: Date
): ConstatPalier<PalierFacture> | null {
  if (f.statutEmission !== "EMISE" && f.statutEmission !== "ENVOYEE") {
    return null;
  }
  if (
    f.statutReglement !== "NON_PAYEE" &&
    f.statutReglement !== "PARTIELLEMENT_PAYEE"
  ) {
    return null;
  }
  if (!f.dateEcheance) return null;

  const retard = diffJours(f.dateEcheance, aujourdHui); // > 0 = échue
  if (retard > 30) return { palier: "MISE_EN_DEMEURE", jours: retard };
  if (retard >= 16) return { palier: "RELANCE_3", jours: retard };
  if (retard >= 8) return { palier: "RELANCE_2", jours: retard };
  if (retard >= 1) return { palier: "RELANCE_1", jours: retard };
  // « + 0 » évite le zéro négatif (-0) quand l'échéance tombe aujourd'hui.
  if (retard >= -7) return { palier: "PREAVIS_ECHEANCE", jours: -retard + 0 };
  return null;
}

// ── Devis : sans réponse après 14 jours (ou relance reprogrammée échue) ─────

/** Délai de réponse accordé au client avant le premier signalement. */
export const DELAI_REPONSE_DEVIS_JOURS = 14;

export interface DevisAClasser {
  /** StatutDevis : seuls ENVOYE et RELANCE sont surveillés. */
  statut: string;
  dateEmission: Date | null;
  dateEnvoi: Date | null;
  /** Prochaine relance PROGRAMMÉE (posée par majStatutDevis sur RELANCE). */
  prochaineRelance: Date | null;
}

/**
 * DEVIS_SANS_REPONSE si la relance programmée est échue (prochaineRelance
 * <= aujourd'hui), ou, sans relance programmée, si l'envoi (dateEnvoi, à
 * défaut dateEmission) date d'au moins 14 jours. Une prochaineRelance posée
 * dans le FUTUR retient le signalement, même sur un envoi ancien.
 * `jours` = jours écoulés depuis l'envoi (à défaut depuis la relance due),
 * pour le libellé « sans réponse depuis N j ».
 */
export function classerDevis(
  d: DevisAClasser,
  aujourdHui: Date
): ConstatPalier<"DEVIS_SANS_REPONSE"> | null {
  if (d.statut !== "ENVOYE" && d.statut !== "RELANCE") return null;

  const envoi = d.dateEnvoi ?? d.dateEmission;
  let due = false;
  if (d.prochaineRelance) {
    due = diffJours(d.prochaineRelance, aujourdHui) >= 0;
  } else if (envoi) {
    due = diffJours(envoi, aujourdHui) >= DELAI_REPONSE_DEVIS_JOURS;
  }
  if (!due) return null;

  const jours = envoi
    ? diffJours(envoi, aujourdHui)
    : diffJours(d.prochaineRelance as Date, aujourdHui);
  return { palier: "DEVIS_SANS_REPONSE", jours };
}

// ── Situation : visée ou acceptée mais toujours pas facturée ─────────────────

/** Délai avant de signaler une situation validée restée sans facture. */
export const DELAI_FACTURATION_SITUATION_JOURS = 7;

export interface SituationAClasser {
  /** StatutSituation : seuls VISEE_MOE et ACCEPTEE sont surveillés. */
  statut: string;
  /** NULL = pas encore facturée (seule population concernée). */
  factureId: string | null;
  dateVisaMOE: Date | null;
  dateEtablissement: Date;
}

/**
 * SITUATION_A_FACTURER si la situation est visée MOE ou acceptée, sans
 * facture rattachée, et que la validation (dateVisaMOE, à défaut
 * dateEtablissement) date d'au moins 7 jours. `jours` = jours écoulés
 * depuis cette validation.
 */
export function classerSituation(
  s: SituationAClasser,
  aujourdHui: Date
): ConstatPalier<"SITUATION_A_FACTURER"> | null {
  if (s.statut !== "VISEE_MOE" && s.statut !== "ACCEPTEE") return null;
  if (s.factureId) return null;

  const reference = s.dateVisaMOE ?? s.dateEtablissement;
  const jours = diffJours(reference, aujourdHui);
  if (jours < DELAI_FACTURATION_SITUATION_JOURS) return null;
  return { palier: "SITUATION_A_FACTURER", jours };
}

// ── Retenue de garantie : échéance de libération à moins de 30 jours ─────────

/** Préavis avant l'échéance de libération de la retenue. */
export const PREAVIS_LIBERATION_RETENUE_JOURS = 30;

export interface RetenueAClasser {
  /** StatutRetenue : seuls RETENUE et CONSIGNEE sont surveillés. */
  statut: string;
  dateEcheanceLiberation: Date | null;
}

/**
 * RETENUE_LIBERABLE si l'échéance de libération tombe dans les 30 jours à
 * venir ou est déjà passée. `jours` = jours AVANT l'échéance (0..30) ;
 * négatif si l'échéance est dépassée (libération en souffrance).
 */
export function classerRetenue(
  r: RetenueAClasser,
  aujourdHui: Date
): ConstatPalier<"RETENUE_LIBERABLE"> | null {
  if (r.statut !== "RETENUE" && r.statut !== "CONSIGNEE") return null;
  if (!r.dateEcheanceLiberation) return null;

  const jours = diffJours(aujourdHui, r.dateEcheanceLiberation);
  if (jours > PREAVIS_LIBERATION_RETENUE_JOURS) return null;
  return { palier: "RETENUE_LIBERABLE", jours };
}
