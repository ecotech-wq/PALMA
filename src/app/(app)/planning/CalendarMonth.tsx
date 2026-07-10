"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, Truck, Package, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { deplacerTache } from "./actions";

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

/** Reconstruit une Date (minuit local) depuis une clé "YYYY-MM-DD". */
function parseKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Décale une date d'un nombre de jours (nouvelle instance, minuit). */
function shiftDays(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

const ONE_DAY = 24 * 60 * 60 * 1000;
/** Nombre de jours entiers entre deux clés (b - a). */
function daysBetweenKeys(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / ONE_DAY);
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
  const router = useRouter();
  const toast = useToast();
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(today));

  // Glisser-déposer d'une tâche vers un autre jour (reprogrammation).
  // Basé sur les Pointer Events : fonctionne à la souris ET au tactile
  // (l'app est utilisée à 99 % sur téléphone). On ne déplace pas la puce
  // visuellement ; on surligne la case cible et on décale les dates au
  // relâchement, en conservant la durée.
  const dragRef = useRef<{
    taskId: string;
    grabKey: string;
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Détail d'un jour (ouvert via « +N autres ») : liste complète du jour.
  const [dayDetailKey, setDayDetailKey] = useState<string | null>(null);

  function cellKeyFromPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest?.("[data-daykey]") as HTMLElement | null;
    return cell?.dataset.daykey ?? null;
  }

  function onChipPointerDown(
    e: React.PointerEvent,
    tache: Tache,
    grabKey: string
  ) {
    if (!canEdit) {
      if (onClickTask) onClickTask(tache.id);
      return;
    }
    // Ignore un second doigt / clic pendant qu'un drag est déjà actif :
    // sinon dragRef serait écrasé et la mauvaise tâche déplacée.
    if (dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture le pointeur : on continue de recevoir les événements même si
    // le doigt sort de la puce (fiable au tactile).
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture indisponible : on continue sans. */
    }
    const pointerId = e.pointerId;
    dragRef.current = {
      taskId: tache.id,
      grabKey,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
    };

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragRef.current = null;
      setDraggingId(null);
      setOverKey(null);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const st = dragRef.current;
      if (!st) return;
      const dist = Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY);
      if (!st.moved && dist > 6) {
        st.moved = true;
        setDraggingId(st.taskId);
      }
      if (!st.moved) return;
      setOverKey(cellKeyFromPoint(ev.clientX, ev.clientY));
    }

    // Interruption (2e doigt, notification, geste navigateur) : on annule
    // proprement sans déplacer ni ouvrir la modale.
    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const st = dragRef.current;
      const moved = st?.moved ?? false;
      const taskId = st?.taskId;
      const gKey = st?.grabKey;
      cleanup();
      if (!taskId || !gKey) return;

      // Simple clic (pas de déplacement) : on ouvre l'édition.
      if (!moved) {
        if (onClickTask) onClickTask(taskId);
        return;
      }
      const dropKey = cellKeyFromPoint(ev.clientX, ev.clientY);
      if (!dropKey || dropKey === gKey) return;
      const delta = daysBetweenKeys(gKey, dropKey);
      if (delta === 0) return;
      const t = taches.find((x) => x.id === taskId);
      if (!t) return;
      const newDebut = shiftDays(t.dateDebut, delta);
      const newFin = shiftDays(t.dateFin, delta);
      setSavingId(taskId);
      deplacerTache(taskId, newDebut, newFin)
        .then(() => router.refresh())
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Erreur de déplacement")
        )
        .finally(() => setSavingId(null));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

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

          const isOver = overKey === k && draggingId !== null;
          return (
            <div
              key={k}
              data-daykey={k}
              className={`min-h-[90px] border-r border-b border-slate-100 dark:border-slate-800 p-1 transition-colors ${
                !inMonth ? "bg-slate-50/50 dark:bg-slate-900/40" : ""
              } ${isWeekend && inMonth ? "bg-slate-50/30 dark:bg-slate-800/20" : ""} ${
                isOver
                  ? "outline outline-2 -outline-offset-2 outline-brand-500 bg-brand-50/60 dark:bg-brand-950/30"
                  : ""
              }`}
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
                  const isDragging = draggingId === t.id;
                  return (
                    <li
                      key={`${t.id}-${k}`}
                      onPointerDown={(e) => onChipPointerDown(e, t, k)}
                      style={canEdit ? { touchAction: "none" } : undefined}
                      className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                      } ${isDragging ? "opacity-40" : ""} ${savingId === t.id ? "animate-pulse" : ""} ${
                        STATUT_OPACITY[t.statut] ?? ""
                      }`}
                      title={`${t.nom} — ${t.chantier.nom}${t.equipe ? ` · ${t.equipe.nom}` : ""}${canEdit ? " · glisser vers un autre jour pour reprogrammer" : ""}`}
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
                  <li>
                    <button
                      type="button"
                      onClick={() => setDayDetailKey(k)}
                      className="text-[10px] text-brand-700 dark:text-brand-400 italic pl-1 hover:underline"
                    >
                      +{extra} autre{extra > 1 ? "s" : ""}
                    </button>
                  </li>
                )}
                {dayEvents.map((e) => {
                  const Icon = e.type === "COMMANDE" ? Package : Truck;
                  return (
                    <li
                      key={e.id}
                      className="flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded text-slate-600 dark:text-slate-400 italic"
                      title={e.label}
                    >
                      <Icon size={10} className="shrink-0" />
                      <span className="truncate">{e.label}</span>
                    </li>
                  );
                })}
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
          <Package size={10} className="text-slate-500" /> Livraison commande
        </span>
        <span className="flex items-center gap-1">
          <Truck size={10} className="text-slate-500" /> Fin location
        </span>
        {canEdit && (
          <span className="ml-auto text-slate-400 dark:text-slate-500">
            Glisser une tâche vers un autre jour pour la reprogrammer
          </span>
        )}
      </div>

      {/* Détail d'un jour (ouvert via « +N autres ») */}
      {dayDetailKey && (
        <DayDetail
          dayKey={dayDetailKey}
          taches={tachesByDay.get(dayDetailKey) ?? []}
          events={eventsByDay.get(dayDetailKey) ?? []}
          onClickTask={onClickTask}
          onClose={() => setDayDetailKey(null)}
        />
      )}
    </div>
  );
}

const dayDetailFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Fenêtre listant toutes les tâches et tous les événements d'un jour. */
function DayDetail({
  dayKey: k,
  taches,
  events,
  onClickTask,
  onClose,
}: {
  dayKey: string;
  taches: Tache[];
  events: Event[];
  onClickTask?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
            {dayDetailFmt.format(parseKey(k))}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {taches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (onClickTask) onClickTask(t.id);
                onClose();
              }}
              className="w-full flex items-center gap-2 text-left text-sm px-2 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span
                className={`shrink-0 w-1.5 h-4 rounded-sm ${
                  PRIO_BAR[t.priorite] ?? PRIO_BAR[4]
                }`}
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-slate-800 dark:text-slate-200">
                  {t.nom}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {t.chantier.nom}
                  {t.equipe ? ` · ${t.equipe.nom}` : ""}
                </span>
              </span>
            </button>
          ))}
          {events.map((e) => {
            const Icon = e.type === "COMMANDE" ? Package : Truck;
            return (
              <div
                key={e.id}
                className="flex items-center gap-2 text-sm px-2 py-2 text-slate-600 dark:text-slate-400 italic"
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{e.label}</span>
              </div>
            );
          })}
          {taches.length === 0 && events.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
              Rien ce jour.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
