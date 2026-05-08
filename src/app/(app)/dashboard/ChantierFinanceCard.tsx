import Link from "next/link";
import { Banknote, ShoppingCart, Truck, ChevronRight } from "lucide-react";
import { ChantierStatutBadge } from "@/app/(app)/chantiers/ChantierStatutBadge";
import { formatEuro } from "@/lib/utils";
import type { FinanceChantier } from "@/lib/finances-chantier";

type ChantierLite = {
  id: string;
  nom: string;
  statut: string;
  _count: { equipes: number };
};

/**
 * Carte récap budget pour un chantier : budget total, engagé, marge,
 * barre de progression, ventilation des coûts (M.O. / commandes / locations).
 * Cliquable → fiche chantier complète.
 */
export function ChantierFinanceCard({
  chantier,
  finance,
}: {
  chantier: ChantierLite;
  finance: FinanceChantier;
}) {
  const consommePct =
    finance.budgetTotal > 0
      ? Math.min(100, Math.round((finance.coutTotal / finance.budgetTotal) * 100))
      : 0;
  const isOver = finance.coutTotal > finance.budgetTotal && finance.budgetTotal > 0;
  const margeAmount = finance.budgetTotal - finance.coutTotal;
  const noBudget = finance.budgetTotal === 0;

  return (
    <Link
      href={`/chantiers/${chantier.id}`}
      className="group block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-400 hover:shadow-sm transition p-4"
    >
      {/* Header : nom + statut + chevron */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-brand-700 dark:group-hover:text-brand-700">
            {chantier.nom}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {chantier._count.equipes} équipe{chantier._count.equipes > 1 ? "s" : ""} ·{" "}
            {finance.jourshomme} j-h pointé{finance.jourshomme > 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ChantierStatutBadge statut={chantier.statut} />
          <ChevronRight
            size={16}
            className="text-slate-300 dark:text-slate-600 group-hover:text-brand-500 group-hover:translate-x-0.5 transition"
          />
        </div>
      </div>

      {/* Trois chiffres principaux */}
      {noBudget ? (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
          Aucun budget défini.{" "}
          <span className="text-brand-600 group-hover:underline">
            Configure depuis la fiche →
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Budget
              </div>
              <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatEuro(finance.budgetTotal)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Engagé
              </div>
              <div
                className={`text-base sm:text-lg font-bold ${
                  isOver ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {formatEuro(finance.coutTotal)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Marge
              </div>
              <div
                className={`text-base sm:text-lg font-bold ${
                  margeAmount < 0
                    ? "text-red-600"
                    : "text-green-600 dark:text-green-500"
                }`}
              >
                {margeAmount >= 0 ? "+" : ""}
                {formatEuro(margeAmount)}
              </div>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full transition-all ${
                isOver
                  ? "bg-red-500"
                  : consommePct >= 80
                  ? "bg-amber-500"
                  : "bg-brand-500"
              }`}
              style={{ width: `${consommePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-3">
            <span>{consommePct}% consommé</span>
            <span>{finance.margePct.toFixed(0)}% de marge</span>
          </div>

          {/* Ventilation des coûts */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Banknote size={11} />
                <span>M.O.</span>
              </div>
              <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                {formatEuro(finance.coutMainOeuvre)}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <ShoppingCart size={11} />
                <span>Commandes</span>
              </div>
              <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                {formatEuro(finance.coutCommandes)}
                {finance.commandesCount > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1">
                    ({finance.commandesCount})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Truck size={11} />
                <span>Locations</span>
              </div>
              <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                {formatEuro(finance.coutLocations)}
                {finance.locationsCount > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1">
                    ({finance.locationsCount})
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Link>
  );
}
