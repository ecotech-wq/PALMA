/**
 * Helpers de date partageables entre client et server (pas de I/O).
 */

/** Renvoie le lundi UTC de la semaine contenant `d`. */
export function lundiDeLaSemaine(d: Date): Date {
  const day = d.getUTCDay();
  const offsetMon = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - offsetMon);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Renvoie une date ISO (YYYY-MM-DD) UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
