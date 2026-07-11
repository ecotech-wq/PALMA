import type { CategorieDocChantier } from "@/generated/prisma/enums";

// ─── GED chantier : libellés des catégories, un seul endroit ────────────────
// Séparation contenu / présentation : ces libellés sont utilisés par la page
// documents du chantier ET par /mes-documents côté client.

export const ORDRE_CATEGORIES: CategorieDocChantier[] = [
  "PLAN",
  "CONTRAT",
  "DEVIS",
  "FACTURE",
  "PV",
  "RAPPORT",
  "AUTRE",
];

export const LABEL_CATEGORIE: Record<CategorieDocChantier, string> = {
  PLAN: "Plan",
  CONTRAT: "Contrat",
  DEVIS: "Devis",
  FACTURE: "Facture",
  PV: "PV",
  RAPPORT: "Rapport",
  AUTRE: "Autre",
};

export const LABEL_GROUPE: Record<CategorieDocChantier, string> = {
  PLAN: "Plans",
  CONTRAT: "Contrats",
  DEVIS: "Devis",
  FACTURE: "Factures",
  PV: "PV",
  RAPPORT: "Rapports",
  AUTRE: "Autres",
};
