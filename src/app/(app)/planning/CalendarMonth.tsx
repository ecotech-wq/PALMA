"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Truck, Package } from "lucide-react";

/* -------------------------------------------------------------------------
 *  Vue calendrier mensuelle — alternative au Gantt pour la vision court
 *  terme. Grille 7 colonnes (L→D) × 6 lignes max. Chaque cellule rend :
 *    - le numéro du jour
 *    - les chips de tâches qui couvrent cette date (max 3 visibles, +N)
 *    - les événements (livraison commande, fin location) avec icône
 *
 *  Cliquer une tâche ouvre la modale d'édition (parent gère via onClickTask).
 * ----------------------------------------------------------------------- */

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
};

type Event = {
  id: string;
  realId: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date | string;
};

const monthFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

const PRIO_BAR: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-blue-500",
  4: "bg-slate-400",
};

const STATUT_OPACITY: Record<string, string> = {
  TERMINEE: "opacity-50 line-through",
  BLOQUEE: "opacity-70",
  EN_COURS: "",
  A_FAIRE: "",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Renvoie la grille (lundi=0) couvrant le mois donné + bordures. */
function buildGrid(monthStart: Date): Date[] {
  const first = new Date(monthStart);
  // Lundi de la première semaine (ISO : lundi = 1, dimanche = 0 en JS)
  const dow = (first.getDay() + 6) % 7; // L=0, M=1, … D=6
  first.setDate(first.getDate() - dow);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export function CalendarMonth({
  taches,
  events,
  canEdit,
  onClickTask,
  onEmptyCellClick,
  defaultChantierId,
  chantiers,
}: {
  taches: Tache[];
  events: Event[];
  canEdit: boolean;
  onClickTask?: (id: string) => void;
  onEmptyCellClick?: (date: Date, chantierNom: string) => void | Promise<void>;
  defaultChantierId?: string;
  chantiers: { id: string; nom: string }[];
}) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(today));

  const grid = useMemo(() => buildGrid(cursor), [cursor]);
  const monthIndex = cursor.getMonth();

  // Index tâches/événements par jour
  const tachesByDay = useMemo(() => {
    const map = new Map<string, Tache[]>();
    for (const t of taches) {
      const s = new Date(t.dateDebut);
      const e = new Date(t.dateFin);
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      for (
        const d = new Date(s);
        d <= e;
        d.setDate(d.getDate() + 1)
      ) {
        const k = dayKey(d);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      }
    }
    return map;
  }, [taches]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events]);

  function gotoMonth(delta: number) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + delta);
    setCursor(startOfMonth(next));
  }

  const chantierNom =
    chantiers.find((c) => c.id === defaultChantierId)?.nom ?? "";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header navigation */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => gotoMonth(-1)}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => gotoMonth(1)}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
          <Calendar size={14} className="inline -mt-0.5 mr-1" />
          {monthFmt.format(cursor)}
        </h2>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {taches.length} tâche{taches.length > 1 ? "s" : ""} ·{" "}
          {events.length} événement{events.length > 1 ? "s" : ""}
        </div>
      </div>

      {/* En-têtes jours semaine */}
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grille jours */}
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === monthIndex;
          const isToday = d.getTime() === today.getTime();
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const dayTaches = tachesByDay.get(k) ?? [];
          const dayEvents = eventsByDay.get(k) ?? [];
          const shown = dayTaches.slice(0, 3);
          const extra = dayTaches.length - shown.length;

          return (
            <div
              key={k}
              className={`min-h-[90px] border-r border-b border-slate-100 dark:border-slate-800 p-1 ${
                !inMonth ? "bg-slate-50/50 dark:bg-slate-900/40" : ""
              } ${isWeekend && inMonth ? "bg-slate-50/30 dark:bg-slate-800/20" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-medium ${
                    isToday
                      ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-600 text-white"
                      : !inMonth
                        ? "text-slate-300 dark:text-slate-600"
                        : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    {dayEvents.slice(0, 2).map((e) => {
                      const Icon = e.type === "COMMANDE" ? Package : Truck;
                      const color =
                        e.type === "COMMANDE"
                          ? "text-orange-600"
                          : "text-purple-600";
                      return (
                        <Icon
                          key={e.id}
                          size={10}
                          className={color}
                          aria-label={e.label}
                        />
                      );
                    })}
                  </span>
                )}
              </div>

              {/* Tâches du jour */}
              <ul className="space-y-0.5">
                {shown.map((t) => {
                  const isStart = dayKey(new Date(t.dateDebut)) === k;
                  return (
                    <li
                      key={`${t.id}-${k}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onClickTask) onClickTask(t.id);
                      }}
                      className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        STATUT_OPACITY[t.statut] ?? ""
                      }`}
                      title={`${t.nom} — ${t.chantier.nom}${t.equipe ? ` · ${t.equipe.nom}` : ""}`}
                    >
                      <span
                        className={`shrink-0 w-1 h-3 rounded-sm ${
                          PRIO_BAR[t.priorite] ?? PRIO_BAR[4]
                        }`}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300">
                        {!isStart && "↪ "}
                        {t.nom}
                      </span>
                    </li>
                  );
                })}
                {extra > 0 && (
                  <li className="text-[10px] text-slate-500 dark:text-slate-400 italic pl-1">
                    +{extra} autre{extra > 1 ? "s" : ""}
                  </li>
                )}
                {dayEvents.map((e) => (
                  <li
                    key={e.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded truncate text-slate-600 dark:text-slate-400 italic"
                    title={e.label}
                  >
                    {e.type === "COMMANDE" ? "📦 " : "🚚 "}
                    {e.label}
                  </li>
                ))}
              </ul>

              {/* Zone "ajouter une tâche" — visible si chantier sélectionné
                  et utilisateur peut éditer */}
              {canEdit &&
                inMonth &&
                onEmptyCellClick &&
                defaultChantierId &&
                chantierNom &&
                dayTaches.length === 0 &&
                dayEvents.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onEmptyCellClick(d, chantierNom)}
                    className="mt-1 w-full text-[10px] text-slate-300 dark:text-slate-700 hover:text-brand-600 dark:hover:text-brand-400 text-left"
                    title="Créer une tâche ici"
                  >
                    + ajouter
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-1 h-3 bg-red-500 rounded-sm" /> P1
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-3 bg-orange-500 rounded-sm" /> P2
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-3 bg-blue-500 rounded-sm" /> P3
        </span>
        <span className="flex items-center gap-1">
          <Package size={10} className="text-orange-600" /> Livraison commande
        </span>
        <span className="flex items-center gap-1">
          <Truck size={10} className="text-purple-600" /> Fin location
        </span>
      </div>
    </div>
  );
}
