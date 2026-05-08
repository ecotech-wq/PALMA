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
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { fetchPointagesForMonth } from "./actions";
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
const weekdays = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, monthIdx: number): Date[][] {
  const firstDay = new Date(Date.UTC(year, monthIdx, 1));
  const dow = firstDay.getUTCDay();
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

function monthKey(year: number, monthIdx: number) {
  return `${year}-${monthIdx}`;
}

/**
 * Calendrier de pointage compact pour UN ouvrier.
 *
 * Le user navigue librement entre les mois (les pointages sont chargés à la
 * volée), et ses modifications survivent au changement de mois → on peut
 * sélectionner des jours sur plusieurs mois et tout enregistrer en une
 * fois. Seul le diff vs DB est envoyé.
 *
 * Clic sur un jour : cycle 0 → 1 j → ½ j → 0.
 */
export function PointageCalendar({
  ouvrierId,
  ouvriers,
  chantiers,
  initialPointages,
  defaultChantierId,
  year: initialYear,
  monthIdx: initialMonthIdx,
  basePath,
  action,
}: {
  ouvrierId?: string;
  ouvriers?: OuvrierOption[];
  chantiers: Chantier[];
  initialPointages: InitialPointage[];
  defaultChantierId: string | null;
  year: number;
  monthIdx: number;
  /** Pour la navigation quand on change d'ouvrier (pas pour les mois) */
  basePath: string;
  action: (formData: FormData) => Promise<unknown>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [loadingMonth, setLoadingMonth] = useState(false);

  // État DB de référence (rempli au fur et à mesure des chargements)
  const [initialDb, setInitialDb] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const p of initialPointages) m[p.date] = p.jours;
    return m;
  });

  // État courant (= ce que le user voit, modifié par ses clics)
  const [values, setValues] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const p of initialPointages) m[p.date] = p.jours;
    return m;
  });

  // Mois déjà chargés (clé "année-monthIdx")
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(
    () => new Set([monthKey(initialYear, initialMonthIdx)])
  );

  // Mois actuellement affiché
  const [visibleYear, setVisibleYear] = useState(initialYear);
  const [visibleMonthIdx, setVisibleMonthIdx] = useState(initialMonthIdx);
  const [chantierId, setChantierId] = useState<string>(defaultChantierId ?? "");

  const grid = useMemo(
    () => buildMonthGrid(visibleYear, visibleMonthIdx),
    [visibleYear, visibleMonthIdx]
  );
  const monthLabel = monthFmt.format(
    new Date(Date.UTC(visibleYear, visibleMonthIdx, 1))
  );
  const todayIso = isoUtc(new Date());

  async function navigateMonth(deltaMonths: number) {
    const newDate = new Date(
      Date.UTC(visibleYear, visibleMonthIdx + deltaMonths, 1)
    );
    const ny = newDate.getUTCFullYear();
    const nm = newDate.getUTCMonth();
    const key = monthKey(ny, nm);

    if (!loadedMonths.has(key) && ouvrierId) {
      setLoadingMonth(true);
      try {
        const data = await fetchPointagesForMonth(ouvrierId, ny, nm);
        setInitialDb((prev) => {
          const next = { ...prev };
          for (const p of data) next[p.date] = p.jours;
          return next;
        });
        setValues((prev) => {
          const next = { ...prev };
          // On n'écrase PAS les valeurs déjà modifiées par l'user :
          // on n'initialise que les jours qu'il n'a pas touchés
          for (const p of data) {
            if (!(p.date in next)) next[p.date] = p.jours;
          }
          return next;
        });
        setLoadedMonths((prev) => new Set([...prev, key]));
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Impossible de charger ce mois"
        );
      } finally {
        setLoadingMonth(false);
      }
    }
    setVisibleYear(ny);
    setVisibleMonthIdx(nm);
  }

  function goToToday() {
    const now = new Date();
    const ny = now.getFullYear();
    const nm = now.getMonth();
    if (ny === visibleYear && nm === visibleMonthIdx) return;
    // Calcule le delta pour réutiliser la logique de chargement
    const delta = (ny - visibleYear) * 12 + (nm - visibleMonthIdx);
    navigateMonth(delta);
  }

  function cycle(iso: string) {
    setValues((prev) => {
      const cur = prev[iso] ?? 0;
      const next = cur === 0 ? 1 : cur === 1 ? 0.5 : 0;
      return { ...prev, [iso]: next };
    });
  }

  function fillBusinessDays(v: number) {
    setValues((prev) => {
      const next = { ...prev };
      for (const week of grid) {
        for (const d of week) {
          if (d.getUTCMonth() !== visibleMonthIdx) continue;
          const dow = d.getUTCDay();
          if (dow === 0 || dow === 6) continue;
          next[isoUtc(d)] = v;
        }
      }
      return next;
    });
  }

  function clearVisibleMonth() {
    setValues((prev) => {
      const next = { ...prev };
      for (const week of grid) {
        for (const d of week) {
          if (d.getUTCMonth() !== visibleMonthIdx) continue;
          next[isoUtc(d)] = 0;
        }
      }
      return next;
    });
  }

  function resetAllChanges() {
    setValues({ ...initialDb });
  }

  // Diff sur tous les mois chargés
  const diff = useMemo(() => {
    const out: { date: string; jours: number }[] = [];
    const keys = new Set([
      ...Object.keys(values),
      ...Object.keys(initialDb),
    ]);
    for (const iso of keys) {
      const cur = values[iso] ?? 0;
      const init = initialDb[iso] ?? 0;
      if (cur !== init) out.push({ date: iso, jours: cur });
    }
    return out;
  }, [values, initialDb]);

  // Total mois visible
  const totalVisibleMonth = useMemo(() => {
    let sum = 0;
    for (const week of grid) {
      for (const d of week) {
        if (d.getUTCMonth() !== visibleMonthIdx) continue;
        sum += values[isoUtc(d)] ?? 0;
      }
    }
    return sum;
  }, [values, grid, visibleMonthIdx]);

  function changeOuvrier(newId: string) {
    const params = new URLSearchParams();
    if (basePath === "/pointage") params.set("mode", "plage");
    params.set("ouvrierId", newId);
    params.set(
      "month",
      `${visibleYear}-${String(visibleMonthIdx + 1).padStart(2, "0")}`
    );
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
        // DB est maintenant à jour avec les `values` courants → on aligne
        setInitialDb({ ...values });
        toast.success(
          `${diff.length} jour${diff.length > 1 ? "s" : ""} mis à jour`
        );
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Sélecteur d'ouvrier (uniquement si liste fournie) */}
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
        <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400 italic">
          Choisis un ouvrier pour afficher son calendrier.
        </div>
      ) : (
        <>
          {/* Header compact : flèches + libellé mois + Aujourd'hui */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              disabled={loadingMonth}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-50"
              title="Mois précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize flex items-center justify-center gap-1.5">
              {loadingMonth && (
                <Loader2 size={12} className="animate-spin text-slate-400" />
              )}
              {monthLabel}
            </div>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              disabled={loadingMonth}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-50"
              title="Mois suivant"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline ml-1"
            >
              Auj.
            </button>
          </div>

          {/* Grille calendrier compacte */}
          <div>
            <div className="grid grid-cols-7 mb-1">
              {weekdays.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "text-center text-[10px] font-medium py-1",
                    i >= 5
                      ? "text-slate-400 dark:text-slate-600"
                      : "text-slate-500 dark:text-slate-500"
                  )}
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.flatMap((w) => w).map((d) => {
                const iso = isoUtc(d);
                const inMonth = d.getUTCMonth() === visibleMonthIdx;
                const dow = d.getUTCDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = iso === todayIso;
                const v = values[iso] ?? 0;
                const init = initialDb[iso] ?? 0;
                const changed = v !== init;

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={!inMonth || loadingMonth}
                    onClick={() => cycle(iso)}
                    className={cn(
                      "relative aspect-square flex items-center justify-center text-xs rounded transition select-none",
                      // Couleur de fond selon valeur
                      v === 1 &&
                        inMonth &&
                        "bg-green-500 text-white font-semibold hover:bg-green-600",
                      v === 0.5 &&
                        inMonth &&
                        "bg-yellow-400 text-slate-900 font-semibold hover:bg-yellow-500",
                      v === 0 &&
                        inMonth &&
                        !isWeekend &&
                        "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                      v === 0 &&
                        inMonth &&
                        isWeekend &&
                        "text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60",
                      !inMonth && "text-slate-300 dark:text-slate-700 cursor-default",
                      // Aujourd'hui
                      isToday &&
                        inMonth &&
                        v === 0 &&
                        "ring-1 ring-brand-500 ring-inset",
                      isToday &&
                        inMonth &&
                        v > 0 &&
                        "ring-2 ring-brand-300 dark:ring-brand-400 ring-offset-0"
                    )}
                  >
                    {d.getUTCDate()}
                    {/* Marqueur "modifié" : petit point bleu en bas à droite */}
                    {changed && inMonth && (
                      <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-brand-500 ring-1 ring-white dark:ring-slate-900" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions compactes */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => fillBusinessDays(1)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Remplir les jours ouvrés du mois en 1 j"
            >
              <CalendarCheck size={12} /> Jours ouvrés
            </button>
            <button
              type="button"
              onClick={clearVisibleMonth}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Mettre tout le mois à 0"
            >
              <Eraser size={12} /> Effacer
            </button>
            <button
              type="button"
              onClick={resetAllChanges}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Annuler toutes les modifications (tous mois)"
            >
              <RotateCcw size={12} /> Annuler tout
            </button>
          </div>

          {/* Chantier appliqué (compact) */}
          <Field label="Chantier (optionnel)">
            <Select
              value={chantierId}
              onChange={(e) => setChantierId(e.target.value)}
              className="text-sm"
            >
              <option value="">— Équipe en cours —</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>

          {/* Footer : total + diff + submit */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs">
              <div className="text-slate-700 dark:text-slate-300">
                <span className="font-semibold">{totalVisibleMonth} j</span>
                <span className="text-slate-500 dark:text-slate-500"> ce mois</span>
              </div>
              <div
                className={cn(
                  "text-[11px]",
                  diff.length > 0
                    ? "text-amber-600 dark:text-amber-500 font-medium"
                    : "text-slate-400 dark:text-slate-500"
                )}
              >
                {diff.length > 0
                  ? `${diff.length} modif${diff.length > 1 ? "s" : ""} en attente`
                  : "Aucune modification"}
              </div>
            </div>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pending || diff.length === 0}
              size="sm"
            >
              <Save size={13} />
              {pending ? "…" : "Enregistrer"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
