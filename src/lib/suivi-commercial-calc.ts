// ─── Suivi financier : calculs PURS (testables, sans accès base) ─────────────
// Séparé de suivi-commercial.ts (qui, lui, est server-only et touche la base)
// pour rester unitairement testable sous vitest, comme calc-paie.ts. Aucune
// dépendance runtime : que de l'arithmétique métier.

/** Arrondi au centime. */
export function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Calcul d'une situation de travaux ────────────────────────────────────────

export interface EntreeSituation {
  /** Montant de référence : marché courant (travaux) ou forfait de phase (BE). */
  montantReferenceHT: number;
  /** Avancement cumulé constaté, en pourcentage 0..100. */
  avancementCumulePct: number;
  /** Cumul HT déjà facturé par les situations antérieures. */
  montantCumuleAnterieurHT: number;
  /** Taux de retenue de garantie appliqué (0 en BE). */
  tauxRetenueGarantie: number;
  /** Acompte encore à imputer sur cette situation (déduit du net). */
  imputationAcompte?: number;
  tauxTVA: number;
  autoliquidation?: boolean;
}

export interface CalculSituation {
  montantCumuleHT: number;
  montantPeriodeHT: number;
  retenueGarantiePeriode: number;
  imputationAcompte: number;
  baseTVA: number;
  montantTVA: number;
  netAPayerPeriode: number;
}

/**
 * Formule canonique du BTP (sources Graneet / Obat) : le montant HT de la
 * période = (référence x avancement) - déjà facturé. On prélève ensuite la
 * retenue de garantie et on impute l'acompte, puis la TVA (ou autoliquidation).
 * Retenue, imputation et TVA se calculent sur la part POSITIVE de la période :
 * une régularisation à la baisse (période négative) reste possible mais ne
 * génère ni retenue ni TVA négatives.
 */
export function calculerSituation(e: EntreeSituation): CalculSituation {
  const montantCumuleHT = euros(
    (e.montantReferenceHT * e.avancementCumulePct) / 100
  );
  const montantPeriodeHT = euros(montantCumuleHT - e.montantCumuleAnterieurHT);
  const basePositive = Math.max(0, montantPeriodeHT);
  const retenueGarantiePeriode = euros(
    (basePositive * Math.max(0, e.tauxRetenueGarantie)) / 100
  );
  const imputationAcompte = euros(
    Math.min(Math.max(0, e.imputationAcompte ?? 0), basePositive)
  );
  const baseTVA = euros(
    montantPeriodeHT - retenueGarantiePeriode - imputationAcompte
  );
  const montantTVA = e.autoliquidation
    ? 0
    : euros((Math.max(0, baseTVA) * e.tauxTVA) / 100);
  const netAPayerPeriode = euros(baseTVA + montantTVA);
  return {
    montantCumuleHT,
    montantPeriodeHT,
    retenueGarantiePeriode,
    imputationAcompte,
    baseTVA,
    montantTVA,
    netAPayerPeriode,
  };
}

// ── Échéance d'une facture ───────────────────────────────────────────────────

/**
 * Date d'échéance dérivée : émission + délai, éventuellement reportée à la fin
 * de mois. Bornée à minuit UTC (comme le reste du dépôt) pour que « facture
 * échue » ne se décale pas d'un jour selon l'heure.
 */
export function calculerEcheance(
  dateEmission: Date,
  delaiJours: number,
  finDeMois: boolean
): Date {
  const d = new Date(dateEmission);
  d.setUTCDate(d.getUTCDate() + delaiJours);
  if (finDeMois) {
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    d.setTime(fin.getTime());
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Minuit UTC du jour de `d` (comparaison d'échéance stable). */
export function bornerJour(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Range une facture dans une tranche d'ancienneté selon son échéance. */
export function trancheDe(echeance: Date | null, aujourdHui: Date): string {
  if (!echeance) return "non_echu";
  const ech = bornerJour(echeance);
  const auj = bornerJour(aujourdHui);
  if (ech >= auj) return "non_echu";
  const jours = Math.floor((auj.getTime() - ech.getTime()) / (24 * 3600 * 1000));
  if (jours <= 30) return "0_30";
  if (jours <= 60) return "31_60";
  if (jours <= 90) return "61_90";
  return "plus_90";
}
