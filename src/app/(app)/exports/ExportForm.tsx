"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Mini formulaire de téléchargement : pickers from/to (préset 30j/an/etc)
 * + bouton Download. Construit l'URL et déclenche un click sur un <a>
 * pour récupérer le fichier sans navigation.
 */
export function ExportForm({
  endpoint,
  filenamePrefix,
  withSiren = false,
}: {
  endpoint: string;
  filenamePrefix: string;
  withSiren?: boolean;
}) {
  const today = todayIso();
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(today);
  const [siren, setSiren] = useState("");

  function setPreset(days: number) {
    setFrom(daysAgoIso(days));
    setTo(todayIso());
  }

  function handleDownload() {
    const params = new URLSearchParams({ from, to });
    if (withSiren && siren) params.set("siren", siren);
    const url = `${endpoint}?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}_${from}_${to}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPreset(30)}
          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          30 jours
        </button>
        <button
          type="button"
          onClick={() => setPreset(90)}
          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          3 mois
        </button>
        <button
          type="button"
          onClick={() => setPreset(365)}
          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          1 an
        </button>
        <button
          type="button"
          onClick={() => {
            const y = new Date().getFullYear();
            setFrom(`${y}-01-01`);
            setTo(todayIso());
          }}
          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Année en cours
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Du
          </span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Au
          </span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </label>
      </div>

      {withSiren && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            SIREN (9 chiffres) — utilisé pour nommer le fichier
          </span>
          <input
            type="text"
            value={siren}
            onChange={(e) => setSiren(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
            placeholder="000000000"
            inputMode="numeric"
            className="mt-0.5 w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </label>
      )}

      <button
        type="button"
        onClick={handleDownload}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
      >
        <Download size={14} /> Télécharger
      </button>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
