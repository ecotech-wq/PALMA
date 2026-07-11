import { addDays, daysBetween, getISOWeek, startOfDay } from "./dates";

/**
 * Échelles temporelles du Gantt. Le « trimestre » (~2 px/jour) donne la
 * vision long terme façon Monday : seul le bandeau mois est affiché.
 */
export type Echelle = "jour" | "semaine" | "mois" | "trimestre";

export const ECHELLES: readonly Echelle[] = [
  "jour",
  "semaine",
  "mois",
  "trimestre",
] as const;

/** Largeur d'un jour en pixels selon l'échelle. */
export const DAY_WIDTH: Record<Echelle, number> = {
  jour: 32,
  semaine: 10,
  mois: 4,
  trimestre: 2,
};

/**
 * Marges (en jours) avant et après la plage des tâches, proportionnelles
 * à l'échelle : plus on dézoome, plus il faut de jours pour remplir
 * l'écran et permettre la replanification en avant comme en arrière.
 */
export const MARGES: Record<Echelle, { avant: number; apres: number }> = {
  jour: { avant: 7, apres: 21 },
  semaine: { avant: 21, apres: 70 },
  mois: { avant: 45, apres: 200 },
  trimestre: { avant: 90, apres: 400 },
};

export type SegmentMois = { label: string; daysCount: number };
export type SegmentSemaine = {
  label: string;
  daysCount: number;
  startIdx: number;
};

export type EchelleCalculee = {
  minDate: Date;
  totalDays: number;
  labelWidth: number;
  days: Date[];
  months: SegmentMois[];
  weeks: SegmentSemaine[];
};

/**
 * Construit la grille temporelle : borne min/max des dates fournies,
 * marges selon l'échelle, liste des jours, segments mois et semaines.
 * Fonction pure : la mémoïsation reste côté composant.
 */
export function construireEchelle(
  dates: Date[],
  scale: Echelle
): EchelleCalculee {
  const allDates = dates.length > 0 ? dates : [new Date()];
  const minD = startOfDay(
    new Date(Math.min(...allDates.map((d) => d.getTime())))
  );
  const maxD = startOfDay(
    new Date(Math.max(...allDates.map((d) => d.getTime())))
  );
  const marges = MARGES[scale];
  const min = addDays(minD, -marges.avant);
  const max = addDays(maxD, marges.apres);
  const total = Math.max(14, daysBetween(min, max) + 1);
  const lw = 200;
  const ds: Date[] = [];
  for (let i = 0; i < total; i++) ds.push(addDays(min, i));

  // Bandeau mois : libellé court en « trimestre » (2 px/jour, un mois
  // fait ~60 px : « juillet 2026 » ne tiendrait pas).
  const ms: SegmentMois[] = [];
  for (const d of ds) {
    const label =
      scale === "trimestre"
        ? d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
        : d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const last = ms[ms.length - 1];
    if (last && last.label === label) last.daysCount++;
    else ms.push({ label, daysCount: 1 });
  }

  // Groupement par semaine (2e bandeau du mode « semaine »)
  const ws: SegmentSemaine[] = [];
  let cur: SegmentSemaine | null = null;
  ds.forEach((d, i) => {
    const isMonday = d.getDay() === 1;
    if (!cur || isMonday) {
      if (cur) ws.push(cur);
      cur = { label: `S${getISOWeek(d)}`, daysCount: 1, startIdx: i };
    } else {
      cur.daysCount++;
    }
  });
  if (cur) ws.push(cur);

  return {
    minDate: min,
    totalDays: total,
    labelWidth: lw,
    days: ds,
    months: ms,
    weeks: ws,
  };
}
