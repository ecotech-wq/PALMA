/**
 * Calcul de paie — logique métier pure (sans I/O).
 *
 * Règles :
 * - FIXE / MOIS  : salaire mensuel ramené à la journée sur base 23 jours/mois
 * - JOUR         : tarif × jours travaillés
 * - SEMAINE      : tarif × jours travaillés / 6 jours par semaine
 * - FORFAIT      : montant forfaitaire fixe (indépendant des jours)
 *
 * Avances : toutes les avances passées en paramètre sont déduites en totalité.
 * Outils personnels : la mensualité est retenue, plafonnée au restant dû.
 * Le net peut être négatif si avances + retenues > brut (l'utilisateur en est alerté côté UI).
 */

export type TypeContrat = "FIXE" | "JOUR" | "SEMAINE" | "MOIS" | "FORFAIT";

export interface AvanceInput {
  id: string;
  montant: number;
}

export interface OutilPersonnelInput {
  id: string;
  mensualite: number;
  restantDu: number;
}

export interface CalcPaieInput {
  typeContrat: TypeContrat;
  tarifBase: number;
  joursTravailles: number;
  avances: AvanceInput[];
  outilsPersonnels: OutilPersonnelInput[];
}

export interface RetenueOutilCalc {
  outilId: string;
  montant: number;
}

export interface CalcPaieResult {
  montantBrut: number;
  avancesDeduites: number;
  avancesIds: string[];
  retenueOutil: number;
  retenuesParOutil: RetenueOutilCalc[];
  montantNet: number;
}

/** Valeurs par défaut, surchargeables via getAppSettings() */
export const JOURS_PAR_MOIS = 23;
export const JOURS_PAR_SEMAINE = 6;

export type CalcOptions = {
  joursParMois?: number;
  joursParSemaine?: number;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcMontantBrut(
  typeContrat: TypeContrat,
  tarifBase: number,
  joursTravailles: number,
  options?: CalcOptions
): number {
  if (tarifBase < 0 || joursTravailles < 0) {
    throw new Error("tarifBase et joursTravailles doivent être positifs");
  }
  const jpm = options?.joursParMois ?? JOURS_PAR_MOIS;
  const jps = options?.joursParSemaine ?? JOURS_PAR_SEMAINE;
  switch (typeContrat) {
    case "FIXE":
    case "MOIS":
      return round2((tarifBase * joursTravailles) / jpm);
    case "JOUR":
      return round2(tarifBase * joursTravailles);
    case "SEMAINE":
      return round2((tarifBase * joursTravailles) / jps);
    case "FORFAIT":
      return round2(tarifBase);
  }
}

export function calcPaie(
  input: CalcPaieInput,
  options?: CalcOptions
): CalcPaieResult {
  const montantBrut = calcMontantBrut(
    input.typeContrat,
    input.tarifBase,
    input.joursTravailles,
    options
  );

  const avancesDeduites = round2(
    input.avances.reduce((sum, a) => sum + a.montant, 0)
  );
  const avancesIds = input.avances.map((a) => a.id);

  const retenuesParOutil: RetenueOutilCalc[] = input.outilsPersonnels
    .map((o) => ({
      outilId: o.id,
      montant: round2(Math.min(o.mensualite, o.restantDu)),
    }))
    .filter((r) => r.montant > 0);

  const retenueOutil = round2(
    retenuesParOutil.reduce((sum, r) => sum + r.montant, 0)
  );

  const montantNet = round2(montantBrut - avancesDeduites - retenueOutil);

  return {
    montantBrut,
    avancesDeduites,
    avancesIds,
    retenueOutil,
    retenuesParOutil,
    montantNet,
  };
}
