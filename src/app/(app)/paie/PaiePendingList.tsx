"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Wallet, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/Toast";
import { marquerPaye, marquerPayesBulk } from "./actions";
import { formatEuro, formatDate, cn } from "@/lib/utils";

type PendingPaiement = {
  id: string;
  ouvrierId: string;
  ouvrierNom: string;
  periodeDebut: Date | string;
  periodeFin: Date | string;
  joursTravailles: number;
  montantNet: number;
  mode: "ESPECES" | "VIREMENT";
};

/**
 * Liste des paiements "à verser" (statut CALCULE) avec sélection multiple
 * et bouton bulk pour marquer tous les sélectionnés payés en un clic.
 */
export function PaiePendingList({ paiements }: { paiements: PendingPaiement[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === paiements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paiements.map((p) => p.id)));
    }
  }

  function payOne(id: string) {
    startTransition(async () => {
      try {
        await marquerPaye(id);
        toast.success("Paiement marqué payé");
        // Plus besoin de garder l'id en sélection
        setSelected((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function payBulk() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      try {
        const count = await marquerPayesBulk(ids);
        toast.success(
          `${count} paiement${count > 1 ? "s" : ""} marqué${count > 1 ? "s" : ""} payé${count > 1 ? "s" : ""}`
        );
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (paiements.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 italic py-2 px-4">
        Aucun paiement en attente de versement.
      </div>
    );
  }

  const allSelected = selected.size === paiements.length;
  const totalSelected = paiements
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + p.montantNet, 0);

  return (
    <div>
      {/* Barre de contrôle bulk */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-sm flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-slate-400 text-brand-600 focus:ring-brand-500 shrink-0"
          />
          <span className="text-slate-700 dark:text-slate-300 truncate">
            {selected.size === 0
              ? "Tout sélectionner"
              : `${selected.size} séléct. · ${formatEuro(totalSelected)}`}
          </span>
        </label>
        <Button
          type="button"
          size="sm"
          onClick={payBulk}
          disabled={selected.size === 0 || pending}
        >
          <Wallet size={14} />
          {pending
            ? "…"
            : selected.size > 0
              ? `Payer ${selected.size}`
              : "Payer"}
        </Button>
      </div>

      {/* Liste */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {paiements.map((p) => {
          const isSel = selected.has(p.id);
          return (
            <li
              key={p.id}
              className={cn(
                "px-3 sm:px-4 py-2.5 transition",
                isSel
                  ? "bg-amber-50/50 dark:bg-amber-950/20"
                  : "hover:bg-slate-50 dark:hover:bg-slate-900"
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(p.id)}
                  className="rounded border-slate-400 text-brand-600 focus:ring-brand-500 mt-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Sélectionner ${p.ouvrierNom}`}
                />

                <div className="flex-1 min-w-0">
                  {/* Ligne 1 : nom + montant à droite */}
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/ouvriers/${p.ouvrierId}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 truncate"
                    >
                      {p.ouvrierNom}
                    </Link>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                      {formatEuro(p.montantNet)}
                    </div>
                  </div>
                  {/* Ligne 2 : badges + détails */}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <Badge color="yellow">À verser</Badge>
                    <span>
                      {formatDate(p.periodeDebut)} → {formatDate(p.periodeFin)}
                    </span>
                    <span>· {p.joursTravailles} j</span>
                    <span>
                      · {p.mode === "ESPECES" ? "Espèces" : "Virement"}
                    </span>
                  </div>
                  {/* Ligne 3 : actions, alignées à droite */}
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <Link
                      href={`/paie/${p.id}`}
                      className="text-xs px-2 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                      title="Voir le détail"
                    >
                      <ExternalLink size={12} /> Détail
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => payOne(p.id)}
                      disabled={pending}
                      title="Marquer ce paiement payé"
                    >
                      <Check size={14} />
                      Payer
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
