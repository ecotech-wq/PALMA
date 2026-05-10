import { calcMontantBrut } from "@/lib/calc-paie";
import { formatEuro } from "@/lib/utils";

type Pointage = { date: Date; joursTravailles: number };

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/**
 * Récap des 6 derniers mois pour un ouvrier : total jours pointés
 * + montant brut estimé selon son contrat. Sert d'aperçu rapide
 * (les vrais paiements sont dans la liste des paiements ci-dessous).
 */
export function MonthlyRecap({
  pointages,
  typeContrat,
  tarifBase,
  showAmount = true,
}: {
  pointages: Pointage[];
  typeContrat: "FIXE" | "JOUR" | "SEMAINE" | "MOIS" | "FORFAIT";
  tarifBase: number;
  showAmount?: boolean;
}) {
  // Construit les 6 derniers mois (du plus récent au plus ancien)
  const now = new Date();
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: monthFmt.format(d), start, end });
  }

  const monthsData = months.map((m) => {
    const ptsInMonth = pointages.filter((p) => {
      const d = new Date(p.date);
      return d >= m.start && d <= m.end;
    });
    const totalJours = ptsInMonth.reduce(
      (s, p) => s + Number(p.joursTravailles),
      0
    );
    const brutEstime = calcMontantBrut(typeContrat, tarifBase, totalJours);
    return { ...m, totalJours, brutEstime };
  });

  const hasData = monthsData.some((m) => m.totalJours > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {monthsData.map((m) => (
        <div
          key={m.key}
          className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2.5"
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 capitalize">
            {m.label}
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {m.totalJours} j
          </div>
          {m.totalJours > 0 ? (
            showAmount ? (
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                ≈ {formatEuro(m.brutEstime)}
              </div>
            ) : null
          ) : (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">—</div>
          )}
        </div>
      ))}
      {!hasData && (
        <div className="col-span-full text-xs text-slate-500 dark:text-slate-400 italic mt-1">
          Aucun pointage récent — ce récap se remplira automatiquement.
        </div>
      )}
    </div>
  );
}
