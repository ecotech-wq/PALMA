"use client";

// ─── Feuille « Prochaine action » (libellé + échéance) ───────────────────────
// Extraite de ProchaineActionFil pour être ouvrable de deux endroits : la
// ligne tappable du bandeau et la feuille « + » du composer. Appelle
// majAffaire, qui pose aussi la trace système dans le fil.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { majAffaire } from "@/app/(app)/affaires/actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function FeuilleProchaineAction({
  affaireId,
  prochaineAction,
  prochaineActionLe,
  onClose,
}: {
  affaireId: string;
  prochaineAction: string | null;
  /** "AAAA-MM-JJ" ou null. */
  prochaineActionLe: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={fondOpaque}
        className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Prochaine action
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const texte = String(fd.get("prochaineAction") ?? "").trim();
            const date = String(fd.get("prochaineActionLe") ?? "");
            startTransition(async () => {
              try {
                await majAffaire(affaireId, {
                  prochaineAction: texte || null,
                  prochaineActionLe: date || null,
                });
                toast.success("Prochaine action mise à jour");
                onClose();
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erreur");
              }
            });
          }}
        >
          <input
            name="prochaineAction"
            defaultValue={prochaineAction ?? ""}
            placeholder="Rappeler le client, relancer la mairie..."
            className={inputCls}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Échéance
            </span>
            <input
              name="prochaineActionLe"
              type="date"
              defaultValue={prochaineActionLe ?? ""}
              className={inputCls}
            />
          </label>
          <Button type="submit" disabled={pending} className="w-full">
            Enregistrer
          </Button>
        </form>
      </div>
    </div>
  );
}
