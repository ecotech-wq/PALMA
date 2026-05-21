"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { restoreItem, purgeItem, type Entity } from "./actions";

/**
 * Une ligne de la corbeille avec actions "Restaurer" et "Purger".
 */
export function TrashRow({
  entity,
  id,
  title,
  subtitle,
  deletedAtLabel,
  daysLeft,
}: {
  entity: Entity;
  id: string;
  title: string;
  subtitle: string;
  deletedAtLabel: string;
  daysLeft: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      try {
        await restoreItem(entity, id);
        toast.success("Restauré");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handlePurge() {
    if (
      !confirm(
        "Supprimer définitivement ? Cette action est irréversible."
      )
    )
      return;
    startTransition(async () => {
      try {
        await purgeItem(entity, id);
        toast.success("Purgé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const urgent = daysLeft <= 3;

  return (
    <li className="py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {subtitle}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          Supprimé le {deletedAtLabel} ·{" "}
          <span
            className={
              urgent
                ? "text-red-600 dark:text-red-400 font-medium"
                : ""
            }
          >
            {daysLeft > 0
              ? `purge dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`
              : "purge imminente"}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleRestore}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-emerald-300 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
        >
          <RotateCcw size={12} /> Restaurer
        </button>
        <button
          type="button"
          onClick={handlePurge}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          title="Suppression définitive"
        >
          <Trash2 size={12} /> Purger
        </button>
      </div>
    </li>
  );
}
