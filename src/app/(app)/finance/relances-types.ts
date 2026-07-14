import type { PalierRelance } from "@/lib/relances-calc";

// ─── Relances : types et présentation partagés serveur/client ────────────────
// Module PUR (ni "use client" ni "server-only") : les pages serveur y
// prennent les types des constats qu'elles dérivent, les composants client y
// prennent les badges et l'ordre des groupes. La sémantique couleur suit la
// charte : ambre bg-brand-* = signal d'engagement (« à relancer »),
// terracotta red-* = grave (mise en demeure), slate = information.

/** Constat OUVERT dérivé en direct (jamais lu depuis RelanceLog). */
export interface ConstatRelanceUI {
  /** Clé de rendu stable : `${objetType}:${objetId}`. */
  cle: string;
  objetType: "FACTURE" | "DEVIS" | "SITUATION" | "RETENUE";
  objetId: string;
  palier: PalierRelance;
  /** Écart en jours tel que classé (sens documenté dans relances-calc). */
  jours: number;
  /** « Facture FAC-2026-041 », « Devis D-12 », « Situation n°3 »... */
  libelle: string;
  /** Client ou marché, déjà composé (« Client X · marché Y »). */
  contexte: string | null;
  /** Ancienneté rédigée : « échue depuis 12 j », « sans réponse depuis 15 j ». */
  agePhrase: string;
  /** Reste dû (facture), TTC (devis), net à payer (situation), cumul (retenue). */
  montant: number;
  chantierId: string | null;
  chantierNom: string | null;
  /** Texte de relance prêt à copier (factures RELANCE_2 et au-delà). */
  texteRelance: string | null;
}

/** Ligne d'historique RelanceLog sérialisée pour le client. */
export interface RelanceLogUI {
  id: string;
  resume: string;
  /** ISO 8601 (sérialisation RSC simple et sans surprise). */
  envoyeLe: string;
}

/** Badge par palier : libellé TOUJOURS présent (jamais la couleur seule). */
export const PALIER_BADGE: Record<
  PalierRelance,
  { label: string; classe: string }
> = {
  PREAVIS_ECHEANCE: {
    label: "Préavis",
    classe: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  RELANCE_1: { label: "Relance 1", classe: "bg-brand-100 text-brand-700" },
  RELANCE_2: { label: "Relance 2", classe: "bg-brand-100 text-brand-800" },
  RELANCE_3: { label: "Relance 3", classe: "bg-brand-200 text-brand-900" },
  MISE_EN_DEMEURE: {
    label: "Mise en demeure",
    classe: "bg-red-100 text-red-700",
  },
  DEVIS_SANS_REPONSE: {
    label: "À relancer",
    classe: "bg-brand-100 text-brand-700",
  },
  SITUATION_A_FACTURER: {
    label: "À facturer",
    classe: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  RETENUE_LIBERABLE: {
    label: "Retenue libérable",
    classe: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  // Palier du module labo (essai à échéance dépassée) : terracotta = retard,
  // comme la mise en demeure. Le cockpit finance ne l'affiche pas (groupes
  // ci-dessous) ; le badge sert aux écrans labo.
  ESSAI_ECHU: {
    label: "Essai en retard",
    classe: "bg-red-100 text-red-700",
  },
};

/** Ordre de gravité décroissante pour trier les constats. */
export const RANG_PALIER: Record<PalierRelance, number> = {
  MISE_EN_DEMEURE: 0,
  RELANCE_3: 1,
  RELANCE_2: 2,
  RELANCE_1: 3,
  PREAVIS_ECHEANCE: 4,
  DEVIS_SANS_REPONSE: 5,
  SITUATION_A_FACTURER: 6,
  RETENUE_LIBERABLE: 7,
  ESSAI_ECHU: 8,
};

/** Groupes de rendu, dans l'ordre d'affichage. */
export const GROUPES_RELANCES: {
  objetType: ConstatRelanceUI["objetType"];
  titre: string;
}[] = [
  { objetType: "FACTURE", titre: "Factures" },
  { objetType: "DEVIS", titre: "Devis à relancer" },
  { objetType: "SITUATION", titre: "Situations à facturer" },
  { objetType: "RETENUE", titre: "Retenues de garantie" },
];
