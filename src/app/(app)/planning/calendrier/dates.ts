/**
 * Petites fonctions de calendrier partagées par la vue Calendrier
 * (mois et semaine). Pures (aucune dépendance React) pour être
 * testables et réutilisables.
 *
 * Convention : un jour est identifié par sa clé locale "YYYY-MM-DD"
 * (minuit local). Les clés étant zéro-paddées, leur comparaison
 * lexicographique équivaut à la comparaison chronologique, ce qui
 * simplifie tous les tris et bornages.
 */

export const ONE_DAY = 24 * 60 * 60 * 1000;

/** Clé locale "YYYY-MM-DD" du jour donné. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Reconstruit une Date (minuit local) depuis une clé "YYYY-MM-DD". */
export function parseKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Décale une date d'un nombre de jours (nouvelle instance, minuit local). */
export function shiftDays(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

/** Décale une clé de n jours (reste une clé, franchit les mois/années). */
export function shiftKey(k: string, n: number): string {
  return dayKey(shiftDays(parseKey(k), n));
}

/** Nombre de jours entiers entre deux clés (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / ONE_DAY);
}

/** Premier jour du mois (minuit local). */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Lundi de la semaine du jour donné (minuit local, semaine ISO). */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // L=0, M=1, ... D=6
  x.setDate(x.getDate() - dow);
  return x;
}

/** Grille de 42 jours (6 semaines, lundi -> dimanche) couvrant le mois. */
export function buildMonthGrid(monthStart: Date): Date[] {
  const first = startOfWeek(startOfMonth(monthStart));
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/** Les 7 jours (lundi -> dimanche) de la semaine contenant la date donnée. */
export function buildWeek(d: Date): Date[] {
  const first = startOfWeek(d);
  const cells: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(first);
    x.setDate(x.getDate() + i);
    cells.push(x);
  }
  return cells;
}

/** Découpe une grille de 42 jours en 6 semaines de 7 jours. */
export function chunkWeeks(cells: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
