import { cn } from "@/lib/utils";

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date;
  dateFin: Date;
  avancement: number;
  statut: string;
  equipe: { nom: string } | null;
  chantier: { nom: string };
};

type ExtraEvent = {
  id: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date;
};

const ONE_DAY = 24 * 60 * 60 * 1000;

const statutBgColor: Record<string, string> = {
  A_FAIRE: "bg-slate-300",
  EN_COURS: "bg-blue-500",
  TERMINEE: "bg-green-500",
  BLOQUEE: "bg-red-400",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / ONE_DAY);
}

export function GanttChart({
  taches,
  events,
}: {
  taches: Tache[];
  events: ExtraEvent[];
}) {
  if (taches.length === 0 && events.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-500">
        Aucune tâche planifiée. Crée des tâches pour visualiser le Gantt.
      </div>
    );
  }

  const allDates: Date[] = [];
  taches.forEach((t) => {
    allDates.push(t.dateDebut, t.dateFin);
  });
  events.forEach((e) => allDates.push(e.date));

  const minDate = startOfDay(new Date(Math.min(...allDates.map((d) => d.getTime()))));
  const maxDate = startOfDay(new Date(Math.max(...allDates.map((d) => d.getTime()))));
  const totalDays = Math.max(7, daysBetween(minDate, maxDate) + 1);
  const dayWidth = 24; // px per day - smaller for mobile fit
  const labelWidth = 160; // px - réduit de 240px

  // Build day list
  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  // Group days by month
  const months: { label: string; daysCount: number }[] = [];
  for (const d of days) {
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const last = months[months.length - 1];
    if (last && last.label === label) {
      last.daysCount += 1;
    } else {
      months.push({ label, daysCount: 1 });
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <div style={{ minWidth: labelWidth + totalDays * dayWidth }}>
          {/* Header */}
          <div className="flex sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div
              className="shrink-0 px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800"
              style={{ width: labelWidth }}
            >
              Tâche
            </div>
            <div className="flex-1">
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-500 capitalize px-2 py-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 truncate"
                    style={{ width: m.daysCount * dayWidth }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="flex">
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const today = startOfDay(new Date()).getTime() === d.getTime();
                  return (
                    <div
                      key={i}
                      className={cn(
                        "text-[10px] text-center text-slate-500 dark:text-slate-500 py-1 border-r border-slate-100 last:border-r-0",
                        isWeekend && "bg-slate-100 dark:bg-slate-800",
                        today && "bg-brand-50 text-brand-700 font-semibold"
                      )}
                      style={{ width: dayWidth }}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tasks */}
          {taches.map((t) => {
            const offset = daysBetween(minDate, t.dateDebut);
            const duration = Math.max(1, daysBetween(t.dateDebut, t.dateFin) + 1);
            const left = offset * dayWidth;
            const width = duration * dayWidth - 2;

            return (
              <div
                key={t.id}
                className="flex border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
              >
                <div
                  className="shrink-0 px-2 py-2 border-r border-slate-200 dark:border-slate-800 min-w-0"
                  style={{ width: labelWidth }}
                >
                  <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {t.nom}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-500 truncate">
                    {t.chantier.nom}
                    {t.equipe && ` · ${t.equipe.nom}`}
                  </div>
                </div>
                <div
                  className="relative flex-1"
                  style={{ height: 44, width: totalDays * dayWidth }}
                >
                  {days.map((d, i) => {
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-0 bottom-0 border-r border-slate-100",
                          isWeekend && "bg-slate-50 dark:bg-slate-900"
                        )}
                        style={{ left: i * dayWidth, width: dayWidth }}
                      />
                    );
                  })}
                  <div
                    className={cn(
                      "absolute top-2 bottom-2 rounded shadow-sm overflow-hidden flex items-center text-xs",
                      statutBgColor[t.statut] ?? "bg-slate-300"
                    )}
                    style={{ left, width }}
                    title={`${t.nom} — ${t.avancement}%`}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-black/15"
                      style={{ width: `${t.avancement}%` }}
                    />
                    <span className="relative px-2 text-white truncate font-medium">
                      {t.avancement > 0 ? `${t.avancement}%` : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Event markers */}
          {events.map((ev) => {
            const offset = daysBetween(minDate, ev.date);
            const left = offset * dayWidth;
            return (
              <div key={ev.id} className="flex border-b border-slate-100">
                <div
                  className="shrink-0 px-2 py-2 border-r border-slate-200 dark:border-slate-800"
                  style={{ width: labelWidth }}
                >
                  <div className="text-[10px] text-slate-500 dark:text-slate-500">
                    {ev.type === "COMMANDE" ? "📦 Livraison" : "🚚 Restitution"}
                  </div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{ev.label}</div>
                </div>
                <div
                  className="relative flex-1"
                  style={{ height: 32, width: totalDays * dayWidth }}
                >
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 w-3 rounded-sm flex items-center justify-center text-white text-[10px] font-bold",
                      ev.type === "COMMANDE" ? "bg-orange-500" : "bg-purple-500"
                    )}
                    style={{ left }}
                    title={ev.label}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="md:hidden text-[11px] text-slate-400 dark:text-slate-500 px-3 py-2 border-t border-slate-100 italic">
        Glisse horizontalement pour voir tout le planning →
      </div>
    </div>
  );
}
