/**
 * Calcule le numéro de la prochaine réserve d'un PV de réception :
 * (max actuel) + 1, ou 1 si le PV n'a encore aucune réserve.
 *
 * Piège de concurrence identifié : le max DOIT être lu dans la même
 * transaction que la création de la réserve, sinon deux tags posés en
 * même temps peuvent produire deux réserves avec le même numéro.
 */
export function prochainNumero(maxActuel: number | null | undefined): number {
  return (maxActuel ?? 0) + 1;
}
