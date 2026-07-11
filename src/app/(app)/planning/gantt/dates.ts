/**
 * Petites fonctions de calendrier partagées par le Gantt.
 * Pures (aucune dépendance React) pour être testables et réutilisables.
 */

export const ONE_DAY = 24 * 60 * 60 * 1000;

/** Minuit local du jour donné (nouvelle instance). */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Nombre de jours entiers entre a et b (b - a), arrondi. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / ONE_DAY
  );
}

/** Décale une date de n jours (nouvelle instance, minuit local). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Numéro de semaine ISO (1..53), utile en mode « semaine ». */
export function getISOWeek(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // 0 = lundi
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return (
    1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000))
  );
}
