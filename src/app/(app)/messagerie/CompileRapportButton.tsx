"use client";

import { useState } from "react";
import { FileDown, Users, Send } from "lucide-react";

/**
 * Bouton "Compiler en rapport" : ouvre un mini dialogue avec
 *  - sélecteur de période (aujourd'hui / 7j / 30j / personnalisé)
 *  - 2 boutons d'export : rapport équipe (tout) / rapport client (filtré)
 * Ouvre la page d'impression dans un nouvel onglet.
 */
export function CompileRapportButton({ chantierId }: { chantierId: string }) {
  const [open, setOpen] = useState(false);
  const today = todayIso();
  const [from, setFrom] = useState(daysAgoIso(6));
  const [to, setTo] = useState(today);

  function setPreset(days: number) {
    setFrom(daysAgoIso(days - 1));
    setTo(todayIso());
  }

  function openPrint(audience: "equipe" | "client") {
    const url = `/chantiers/${chantierId}/rapport/print?from=${from}&to=${to}&for=${audience}`;
    window.open(url, "_blank", "noopener");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <FileDown size={14} /> Compiler en rapport
      </button>

      {open && (
        <>
          {/* Backdrop pour fermer en cliquant ailleurs */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Période
            </div>
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => setPreset(1)}
                className="flex-1 text-[11px] px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Aujourd&apos;hui
              </button>
              <button
                type="button"
                onClick={() => setPreset(7)}
                className="flex-1 text-[11px] px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                7 jours
              </button>
              <button
                type="button"
                onClick={() => setPreset(30)}
                className="flex-1 text-[11px] px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                30 jours
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Du
                </span>
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-0.5 w-full text-xs px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
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
                  className="mt-0.5 w-full text-xs px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => openPrint("equipe")}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm hover:opacity-90"
              >
                <Users size={14} /> Rapport équipe (tout)
              </button>
              <button
                type="button"
                onClick={() => openPrint("client")}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
              >
                <Send size={14} /> Rapport client (filtré)
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 leading-snug">
              Le rapport client exclut les messages marqués «&nbsp;caché du
              client&nbsp;» et les mouvements de matériel.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
