"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  Eraser,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

type Chantier = { id: string; nom: string };
type OuvrierOption = {
  id: string;
  nom: string;
  prenom: string | null;
  equipeNom?: string | null;
  defaultChantierId?: string | null;
};

type InitialPointage = { date: string /* yyyy-MM-dd */; jours: number };

const monthFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});
const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Renvoie 6 semaines × 7 jours pour le mois donné (déborde sur mois précédent/suivant) */
function buildMonthGrid(year: number, monthIdx: number): Date[][] {
  const firstDay = new Date(Date.UTC(year, monthIdx, 1));
  const dow = firstDay.getUTCDay(); // 0 = dim
  const offsetMon = dow === 0 ? 6 : dow - 1;
  const start = new Date(firstDay);
  start.setUTCDate(start.getUTCDate() - offsetMon);

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Calendrier de pointage pour UN ouvrier sur UN mois.
 *
 * Interaction :
 *  - Clic sur un jour : cycle 0 → 1j → ½j → 0
 *  - Boutons rapides : "Tous les jours ouvrés" / "Effacer le mois" / "Réinitialiser"
 *
 * Seules les modifications par rapport à l'état initial (DB) sont envoyées
 * au serveur. Les jours non touchés ne sont pas réécrits.
 */
export function PointageCalendar({
  ouvrierId,
  ouvriers,
  chantiers,
  initialPointages,
  defaultChantierId,
  year,
  monthIdx,
  basePath,
  action,
}: {
  ouvrierId?: string;
  ouvriers?: OuvrierOption[];
  chantiers: Chantier[];
  initialPointages: InitialPointage[];
  defaultChantierId: string | null;
  year: number;
  /** 0-11 */
  monthIdx: number;
  /** URL de base pour la navigation (ex: "/pointage" ou "/ouvriers/xxx") */
  basePath: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // Map<isoDate, jours> initial venu de la DB
  const initialMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of initialPointages) m[p.date] = p.jours;
    return m;
  }, [initialPointages]);

  const [values, setValues] = useState<Record<string, number>>(initialMap);
  const [chantierId, setChantierId] = useState<string>(defaultChantierId ?? "");

  const grid = useMemo(() => buildMonthGrid(year, monthIdx), [year, monthIdx]);
  const monthLabel = monthFmt.format(new Date(Date.UTC(year, monthIdx, 1)));
  const todayIso = isoUtc(new Date());

  function cycle(iso: string) {
    setValues((prev) => {
      const cur = prev[iso] ?? 0;
      let next: number;
      if (cur === 0) next = 1;
      else if (cur === 1) next = 0.5;
      else next = 0;
      return { ...prev, [iso]: next };
    });
  }

  function setVal(iso: string, v: number) {
    setValues((prev) => ({ ...prev, [iso]: v }));
  }

  function fillBusinessDays(v: number) {
    setValues((prev) => {
      const next = { ...prev };
      for (const week of grid) {
        for (const d of week) {
          if (d.getUTCMonth() !== monthIdx) continue;
          const dow = d.getUTCDay();
          if (dow === 0 || dow === 6) continue;
          next[isoUtc(d)] = v;
        }
      }
      return next;
    });
  }

  function clearMonth() {
    setValues((prev) => {
      const next = { ...prev };
      for (const week of grid) {
        for (const d of week) {
          if (d.getUTCMonth() !== monthIdx) continue;
          next[isoUtc(d)] = 0;
        }
      }
      return next;
    });
  }

  function resetToInitial() {
    setValues(initialMap);
  }

  // Calcul du diff vs DB initial — uniquement les changements partent au serveur
  const diff = useMemo(() => {
    const out: { date: string; jours: number }[] = [];
    const seen = new Set<string>();
    for (const week of grid) {
      for (const d of week) {
        if (d.getUTCMonth() !== monthIdx) continue;
        const iso = isoUtc(d);
        seen.add(iso);
        const cur = values[iso] ?? 0;
        const init = initialMap[iso] ?? 0;
        if (cur !== init) out.push({ date: iso, jours: cur });
      }
    }
    // Inclut aussi les pointages initiaux du mois mis à 0 (suppressions)
    for (const [iso, init] of Object.entries(initialMap)) {
      if (seen.has(iso)) continue;
      // hors fenêtre visible → on n'envoie rien
      void init;
    }
    return out;
  }, [values, initialMap, grid, monthIdx]);

  const totalJours = useMemo(() => {
    let sum = 0;
    for (const week of grid) {
      for (const d of week) {
        if (d.getUTCMonth() !== monthIdx) continue;
        sum += values[isoUtc(d)] ?? 0;
      }
    }
    return sum;
  }, [values, grid, monthIdx]);

  function navigateMonth(deltaMonths: number) {
    const newDate = new Date(Date.UTC(year, monthIdx + deltaMonths, 1));
    const ny = newDate.getUTCFullYear();
    const nm = newDate.getUTCMonth() + 1;
    const params = new URLSearchParams();
    if (basePath === "/pointage") params.set("mode", "plage");
    if (ouvrierId) params.set("ouvrierId", ouvrierId);
    params.set("month", `${ny}-${String(nm).padStart(2, "0")}`);
    router.push(`${basePath}?${params.toString()}`);
  }

  function changeOuvrier(newId: string) {
    const params = new URLSearchParams();
    params.set("mode", "plage");
    params.set("ouvrierId", newId);
    params.set("month", `${year}-${String(monthIdx + 1).padStart(2, "0")}`);
    router.push(`${basePath}?${params.toString()}`);
  }

  function onSubmit() {
    if (diff.length === 0) {
      toast.info("Aucune modification");
      return;
    }
    if (!ouvrierId) {
      toast.error("Choisis un ouvrier");
      return;
    }
    const fd = new FormData();
    fd.set("ouvrierId", ouvrierId);
    fd.set("chantierId", chantierId);
    fd.set("entries", JSON.stringify(diff));
    startTransition(async () => {
      try {
        await action(fd);
        toast.success(
          `${diff.length} jour${diff.length > 1 ? "s" : ""} mis à jour`
        );
        // L'état initial n'est pas re-fetché automatiquement, on le refresh via router
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Sélecteur d'ouvrier (uniquement en mode multi-ouvriers) */}
      {ouvriers && (
        <Field label="Ouvrier" required>
          <Select
            value={ouvrierId ?? ""}
            onChange={(e) => changeOuvrier(e.target.value)}
          >
            {!ouvrierId && <option value="">— Choisis un ouvrier —</option>}
            {ouvriers.map((o) => {
              const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
              return (
                <option key={o.id} value={o.id}>
                  {fullName}
                  {o.equipeNom ? ` — ${o.equipeNom}` : ""}
                </option>
              );
            })}
          </Select>
        </Field>
      )}

      {!ouvrierId ? (
        <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400 italic">
          Choisis un ouvrier pour afficher son calendrier de pointage.
        </div>
      ) : (
        <>
          {/* Navigation mois */}
          <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(-1)}
              type="button"
              title="Mois précédent"
            >
              <ChevronLeft size={18} />
            </Button>
            <div className="font-semibold text-slate-900 dark:text-slate-100 capitalize text-sm sm:text-base">
              {monthLabel}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(1)}
              type="button"
              title="Mois suivant"
            >
              <ChevronRight size={18} />
            </Button>
          </div>

          {/* Légende */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-700 ring-1 ring-green-400" />
              1 jour
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-700 ring-1 ring-yellow-400" />
              ½ jour
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-300 dark:ring-slate-700" />
              vide
            </span>
            <span className="text-slate-400 dark:text-slate-500">
              · Clic = 1j → ½j → vide
            </span>
          </div>

          {/* Grille calendrier */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
              {weekdays.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "px-2 py-1.5 text-[11px] font-medium text-center uppercase tracking-wider",
                    i >= 5
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-600 dark:text-slate-300"
                  )}
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((week) =>
                week.map((d) => {
                  const iso = isoUtc(d);
                  const inMonth = d.getUTCMonth() === monthIdx;
                  const dow = d.getUTCDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = iso === todayIso;
                  const v = values[iso] ?? 0;
                  const init = initialMap[iso] ?? 0;
                  const changed = v !== init;

                  let bg = "bg-white dark:bg-slate-900";
                  let label = "";
                  if (v === 1) {
                    bg = "bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200";
                    label = "1 j";
                  } else if (v === 0.5) {
                    bg = "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200";
                    label = "½ j";
                  } else if (isWeekend && inMonth) {
                    bg = "bg-slate-50 dark:bg-slate-900/60";
                  }

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!inMonth}
                      onClick={() => cycle(iso)}
                      className={cn(
                        "relative h-16 sm:h-20 border-r border-b border-slate-100 dark:border-slate-800 p-1.5 text-left transition",
                        inMonth
                          ? "hover:ring-2 hover:ring-brand-300 hover:z-10 cursor-pointer"
                          : "opacity-40 cursor-not-allowed",
                        bg,
                        isToday && inMonth && "ring-1 ring-brand-500"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isToday && inMonth && "text-brand-700 dark:text-brand-400"
                          )}
                        >
                          {d.getUTCDate()}
                        </span>
                        {changed && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-brand-500"
                            title="Modifié"
                          />
                        )}
                      </div>
                      {label && (
                        <div className="mt-1 text-xs sm:text-sm font-bold">
                          {label}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Actions rapides */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillBusinessDays(1)}
            >
              <CalendarCheck size={14} />
              Tous les jours ouvrés en 1 j
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearMonth}
            >
              <Eraser size={14} />
              Effacer le mois
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToInitial}
            >
              <RotateCcw size={14} />
              Réinitialiser
            </Button>
          </div>

          {/* Chantier */}
          <Field label="Chantier appliqué aux jours modifiés (optionnel)">
            <Select
              value={chantierId}
              onChange={(e) => setChantierId(e.target.value)}
            >
              <option value="">— Équipe en cours —</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>

          {/* Footer : total + submit */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm">
              <div className="text-slate-500 dark:text-slate-400 text-xs">
                Total mois
              </div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {totalJours} j ·{" "}
                <span
                  className={cn(
                    "text-xs",
                    diff.length > 0
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-slate-500 dark:text-slate-500"
                  )}
                >
                  {diff.length} modification{diff.length > 1 ? "s" : ""} en attente
                </span>
              </div>
            </div>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pending || diff.length === 0}
              size="lg"
            >
              <Save size={16} />
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
