"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import { deplacerTache } from "./actions";

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  parentId: string | null;
  equipe: { nom: string } | null;
  chantier: { nom: string };
  /** IDs des prédécesseurs (la tâche dépend d'eux). */
  dependances?: { id: string }[];
};

type ExtraEvent = {
  id: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date | string;
};

const ONE_DAY = 24 * 60 * 60 * 1000;

const statutBgColor: Record<string, string> = {
  A_FAIRE: "bg-slate-400",
  EN_COURS: "bg-blue-500",
  TERMINEE: "bg-green-500",
  BLOQUEE: "bg-red-500",
};

const statutBorderColor: Record<string, string> = {
  A_FAIRE: "border-slate-500",
  EN_COURS: "border-blue-600",
  TERMINEE: "border-green-600",
  BLOQUEE: "border-red-600",
};

const PRIO_FLAG: Record<number, string> = {
  1: "fill-red-500 stroke-red-600 text-red-600",
  2: "fill-orange-500 stroke-orange-600 text-orange-600",
  3: "fill-blue-400 stroke-blue-500 text-blue-500",
  4: "fill-transparent stroke-slate-400 text-slate-400",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / ONE_DAY
  );
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Gantt interactif style Monday.com :
 *  - Drag du milieu de la barre = déplacer (shift)
 *  - Drag des bords = redimensionner (resize start/end)
 *  - Snap au jour
 *  - Sauvegarde en BDD via deplacerTache au pointerup
 *  - Ligne "aujourd'hui" rouge verticale
 *  - Drapeaux de priorité dans le label
 */
export function GanttChartV2({
  taches,
  events,
  canEdit,
}: {
  taches: Tache[];
  events: ExtraEvent[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [overrides, setOverrides] = useState<
    Record<string, { offset: number; duration: number }>
  >({});

  // -- Calcul de l'échelle temporelle ---------------------------------------
  const { minDate, totalDays, dayWidth, labelWidth, days, months } = useMemo(() => {
    const allDates: Date[] = [];
    taches.forEach((t) => {
      allDates.push(new Date(t.dateDebut), new Date(t.dateFin));
    });
    events.forEach((e) => allDates.push(new Date(e.date)));
    if (allDates.length === 0) allDates.push(new Date());
    const minD = startOfDay(
      new Date(Math.min(...allDates.map((d) => d.getTime())))
    );
    const maxD = startOfDay(
      new Date(Math.max(...allDates.map((d) => d.getTime())))
    );
    // Marges : 7 jours avant/après pour pouvoir drag à l'extérieur
    const min = addDays(minD, -7);
    const max = addDays(maxD, 14);
    const total = Math.max(14, daysBetween(min, max) + 1);
    const dw = 32; // px / jour - un peu plus large pour les barres rondies
    const lw = 200;
    const ds: Date[] = [];
    for (let i = 0; i < total; i++) ds.push(addDays(min, i));
    const ms: { label: string; daysCount: number }[] = [];
    for (const d of ds) {
      const label = d.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      const last = ms[ms.length - 1];
      if (last && last.label === label) last.daysCount++;
      else ms.push({ label, daysCount: 1 });
    }
    return {
      minDate: min,
      totalDays: total,
      dayWidth: dw,
      labelWidth: lw,
      days: ds,
      months: ms,
    };
  }, [taches, events]);

  if (taches.length === 0 && events.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
        Aucune tâche planifiée. Ajoute des tâches pour visualiser le Gantt.
      </div>
    );
  }

  function offsetFor(t: Tache) {
    const o = overrides[t.id]?.offset;
    return typeof o === "number"
      ? o
      : daysBetween(minDate, new Date(t.dateDebut));
  }
  function durationFor(t: Tache) {
    const o = overrides[t.id]?.duration;
    return typeof o === "number"
      ? o
      : Math.max(
          1,
          daysBetween(new Date(t.dateDebut), new Date(t.dateFin)) + 1
        );
  }

  /** Démarre un drag sur une barre.
   *  mode: "move" = déplacer entier, "left" = redim début, "right" = redim fin
   */
  function startDrag(
    tache: Tache,
    mode: "move" | "left" | "right",
    e: React.PointerEvent
  ) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const initOffset = offsetFor(tache);
    const initDuration = durationFor(tache);

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const deltaDays = Math.round(dx / dayWidth);
      let nextOffset = initOffset;
      let nextDuration = initDuration;
      if (mode === "move") {
        nextOffset = initOffset + deltaDays;
      } else if (mode === "left") {
        nextOffset = initOffset + deltaDays;
        nextDuration = initDuration - deltaDays;
        if (nextDuration < 1) {
          const adjust = 1 - nextDuration;
          nextOffset -= adjust;
          nextDuration = 1;
        }
      } else if (mode === "right") {
        nextDuration = initDuration + deltaDays;
        if (nextDuration < 1) nextDuration = 1;
      }
      setOverrides((prev) => ({
        ...prev,
        [tache.id]: { offset: nextOffset, duration: nextDuration },
      }));
    }

    async function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const ov = overrides[tache.id];
      // overrides peut être stale ; on recalcule depuis l'événement final
      // via une closure : on s'appuie sur l'override courant via setOverrides
      setOverrides((prev) => {
        const cur = prev[tache.id];
        if (!cur) return prev;
        const newStart = addDays(minDate, cur.offset);
        const newEnd = addDays(newStart, cur.duration - 1);
        // Vérifie si différent
        const origStart = new Date(tache.dateDebut);
        const origEnd = new Date(tache.dateFin);
        if (
          newStart.getTime() === startOfDay(origStart).getTime() &&
          newEnd.getTime() === startOfDay(origEnd).getTime()
        ) {
          // pas de changement
          const next = { ...prev };
          delete next[tache.id];
          return next;
        }
        // Save async (don't await dans setState)
        deplacerTache(tache.id, newStart, newEnd)
          .then(() => {
            // L'override sera nettoyé via router.refresh
            router.refresh();
            setOverrides((p) => {
              const n = { ...p };
              delete n[tache.id];
              return n;
            });
          })
          .catch((err: unknown) => {
            toast.error(
              err instanceof Error ? err.message : "Erreur de déplacement"
            );
            // Annule l'override pour revenir aux dates serveur
            setOverrides((p) => {
              const n = { ...p };
              delete n[tache.id];
              return n;
            });
          });
        return prev;
      });
      // Pas besoin d'utiliser ov ici (on a recalculé via setOverrides)
      void ov;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const todayOffset = daysBetween(minDate, startOfDay(new Date()));
  const todayLeft = todayOffset >= 0 && todayOffset < totalDays
    ? todayOffset * dayWidth + dayWidth / 2
    : null;

  // Hauteur d'une ligne Gantt (doit matcher h-44 + bordure)
  const ROW_H = 44;
  // Index par id pour résoudre les dépendances (numéro de ligne)
  const taskRowIndex = new Map(taches.map((t, i) => [t.id, i]));

  // Construit les flèches de dépendance : pour chaque tache T et chaque
  // dep D, ligne de (right de D, milieu) → (left de T, milieu).
  type Arrow = {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    blocking: boolean;
  };
  const arrows: Arrow[] = [];
  taches.forEach((t, ti) => {
    if (!t.dependances || t.dependances.length === 0) return;
    const tStart = offsetFor(t) * dayWidth;
    const tCenterY = ti * ROW_H + ROW_H / 2;
    for (const dep of t.dependances) {
      const di = taskRowIndex.get(dep.id);
      if (di === undefined) continue;
      const d = taches[di];
      const dEnd = (offsetFor(d) + durationFor(d)) * dayWidth - 2;
      const dCenterY = di * ROW_H + ROW_H / 2;
      // "Bloquante" si la dep n'est pas terminée ET sa fin est après le
      // début de t (timing impossible).
      const blocking =
        d.statut !== "TERMINEE" &&
        new Date(d.dateFin) > new Date(t.dateDebut);
      arrows.push({
        fromX: dEnd,
        fromY: dCenterY,
        toX: tStart,
        toY: tCenterY,
        blocking,
      });
    }
  });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ minWidth: labelWidth + totalDays * dayWidth }}>
          {/* Header */}
          <div className="flex sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div
              className="shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-200 dark:border-slate-800"
              style={{ width: labelWidth }}
            >
              Tâche
            </div>
            <div className="flex-1 relative">
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="text-xs font-semibold text-slate-600 capitalize px-2 py-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 truncate"
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
                  const today =
                    startOfDay(new Date()).getTime() === d.getTime();
                  return (
                    <div
                      key={i}
                      className={cn(
                        "text-[10px] text-center text-slate-500 py-1 border-r border-slate-100 dark:border-slate-800 last:border-r-0",
                        isWeekend && "bg-slate-100 dark:bg-slate-800/40",
                        today &&
                          "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 font-semibold"
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
          <div className="relative">
            {/* Ligne "aujourd'hui" verticale */}
            {todayLeft !== null && (
              <div
                className="absolute top-0 bottom-0 z-[5] pointer-events-none"
                style={{ left: labelWidth + todayLeft }}
              >
                <div className="w-px h-full bg-red-400/70" />
              </div>
            )}

            {/* SVG overlay : flèches de dépendances entre tâches */}
            {arrows.length > 0 && (
              <svg
                className="absolute pointer-events-none z-[4]"
                style={{
                  left: labelWidth,
                  top: 0,
                  width: totalDays * dayWidth,
                  height: taches.length * ROW_H,
                }}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="arrow-blocking"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill="rgb(220 38 38)"
                    />
                  </marker>
                  <marker
                    id="arrow-ok"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill="rgb(100 116 139)"
                    />
                  </marker>
                </defs>
                {arrows.map((a, i) => {
                  // Trace en L : sortie horizontale sur 10px puis vertical
                  // puis horizontal jusqu'au début de la tâche suivante.
                  // Si la dep est plus à droite que t, on contourne par
                  // au-dessus.
                  const stroke = a.blocking
                    ? "rgb(220 38 38)"
                    : "rgb(100 116 139)";
                  const marker = a.blocking
                    ? "url(#arrow-blocking)"
                    : "url(#arrow-ok)";
                  const dashed = a.blocking ? "" : "4 3";
                  const midX = a.toX > a.fromX
                    ? a.fromX + Math.max(8, (a.toX - a.fromX) / 2)
                    : a.fromX + 12;
                  // Path : M from → H midX → V to.y → H to.x
                  const d = `M ${a.fromX} ${a.fromY} H ${midX} V ${a.toY} H ${a.toX}`;
                  return (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.5}
                      strokeDasharray={dashed}
                      markerEnd={marker}
                      opacity={a.blocking ? 0.9 : 0.6}
                    />
                  );
                })}
              </svg>
            )}

            {taches.map((t) => {
              const offset = offsetFor(t);
              const duration = durationFor(t);
              const left = offset * dayWidth;
              const width = duration * dayWidth - 4;
              const done = t.statut === "TERMINEE";
              const isSubtask = !!t.parentId;
              return (
                <div
                  key={t.id}
                  className="flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition"
                >
                  <div
                    className="shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-800 min-w-0 flex items-start gap-1.5"
                    style={{ width: labelWidth }}
                  >
                    {t.priorite < 4 && (
                      <Flag
                        size={12}
                        className={`shrink-0 mt-0.5 ${PRIO_FLAG[t.priorite]}`}
                      />
                    )}
                    <div className={isSubtask ? "pl-3 min-w-0" : "min-w-0"}>
                      <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {isSubtask && (
                          <span className="text-slate-400 mr-1">↳</span>
                        )}
                        {t.nom}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {t.chantier.nom}
                        {t.equipe && ` · ${t.equipe.nom}`}
                      </div>
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
                            "absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800/50",
                            isWeekend && "bg-slate-50 dark:bg-slate-800/20"
                          )}
                          style={{ left: i * dayWidth, width: dayWidth }}
                        />
                      );
                    })}
                    <div
                      onPointerDown={(e) => startDrag(t, "move", e)}
                      className={cn(
                        "absolute top-2 bottom-2 rounded-md shadow-sm overflow-hidden flex items-center text-xs select-none",
                        statutBgColor[t.statut] ?? "bg-slate-400",
                        statutBorderColor[t.statut],
                        "border",
                        canEdit ? "cursor-grab active:cursor-grabbing" : "",
                        done && "opacity-70"
                      )}
                      style={{
                        left,
                        width,
                        touchAction: "none",
                      }}
                      title={`${t.nom} — ${t.avancement}%`}
                    >
                      {/* Poignée gauche (resize start) */}
                      {canEdit && (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "left", e);
                          }}
                          className="absolute left-0 top-0 bottom-0 w-1.5 hover:w-2 hover:bg-white/30 cursor-ew-resize transition-all"
                          style={{ touchAction: "none" }}
                        />
                      )}
                      {/* Poignée droite (resize end) */}
                      {canEdit && (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "right", e);
                          }}
                          className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2 hover:bg-white/30 cursor-ew-resize transition-all"
                          style={{ touchAction: "none" }}
                        />
                      )}
                      {/* Avancement (overlay sombre) */}
                      <div
                        className="absolute inset-y-0 left-0 bg-black/20 pointer-events-none"
                        style={{ width: `${t.avancement}%` }}
                      />
                      {/* Texte centré */}
                      <span className="relative px-2 text-white truncate font-medium pointer-events-none">
                        {duration >= 3
                          ? t.avancement > 0
                            ? `${t.avancement}%`
                            : ""
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Event markers */}
            {events.map((ev) => {
              const offset = daysBetween(minDate, new Date(ev.date));
              const left = offset * dayWidth;
              return (
                <div
                  key={ev.id}
                  className="flex border-b border-slate-100 dark:border-slate-800"
                >
                  <div
                    className="shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-800"
                    style={{ width: labelWidth }}
                  >
                    <div className="text-[10px] text-slate-500">
                      {ev.type === "COMMANDE"
                        ? "📦 Livraison"
                        : "🚚 Restitution"}
                    </div>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {ev.label}
                    </div>
                  </div>
                  <div
                    className="relative flex-1"
                    style={{ height: 36, width: totalDays * dayWidth }}
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
      </div>
      {canEdit && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 px-3 py-2 border-t border-slate-100 dark:border-slate-800 italic">
          Astuce : glisser une barre pour déplacer la tâche · glisser le
          bord pour ajuster la durée. Ligne rouge = aujourd&apos;hui.
        </div>
      )}
    </div>
  );
}
