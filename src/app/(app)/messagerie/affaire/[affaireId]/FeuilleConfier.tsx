"use client";

// ─── Feuille « Confier une action » ──────────────────────────────────────────
// Extraite d'ActionsRapidesAffaire pour être ouvrable de deux endroits :
// le menu « ... » du bandeau du fil et la feuille « + » du composer.
// Crée une tâche perso du destinataire reliée à l'affaire (assignerAction :
// garde pilote + espace, notification, trace « Action confiée » dans le fil).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { assignerAction } from "@/app/(app)/affaires/actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function FeuilleConfier({
  affaireId,
  cibles,
  onClose,
}: {
  affaireId: string;
  cibles: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const aujourdhui = new Date().toISOString().slice(0, 10);

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
            Confier une action
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
            startTransition(async () => {
              try {
                await assignerAction(affaireId, {
                  cibleId: String(fd.get("cibleId") ?? ""),
                  nom: String(fd.get("nom") ?? ""),
                  dateDebut: String(fd.get("dateDebut") ?? aujourdhui),
                  dateFin: String(fd.get("dateFin") ?? aujourdhui),
                });
                toast.success("Action confiée");
                onClose();
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erreur");
              }
            });
          }}
        >
          <input
            name="nom"
            required
            placeholder="Préparer le devis, appeler le géomètre..."
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Pour
              </span>
              <select name="cibleId" required className={inputCls}>
                {cibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Échéance
              </span>
              <input
                name="dateFin"
                type="date"
                required
                defaultValue={aujourdhui}
                className={inputCls}
              />
            </label>
          </div>
          <input type="hidden" name="dateDebut" value={aujourdhui} />
          <Button type="submit" disabled={pending} className="w-full">
            Confier
          </Button>
        </form>
      </div>
    </div>
  );
}
