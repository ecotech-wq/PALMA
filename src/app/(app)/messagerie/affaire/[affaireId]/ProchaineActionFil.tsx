"use client";

// ─── Prochaine action éditable en place, dans le bandeau du fil ──────────────
// Le constat d'usage : replanifier la prochaine action se faisait uniquement
// sur la fiche, alors que le pilotage quotidien vit dans la messagerie. Ce
// composant rend la ligne « prochaine action » du bandeau tappable : une
// feuille bas d'écran (libellé + date) appelle majAffaire, qui pose aussi la
// trace système dans le fil. Même motif que ProchaineActionEdit de la fiche.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { majAffaire } from "@/app/(app)/affaires/actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

// Échéance @db.Date (minuit UTC) : formatage en UTC pour ne jamais glisser
// d'un jour selon le fuseau de l'appareil.
const dateCourteFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function ProchaineActionFil({
  affaireId,
  prochaineAction,
  prochaineActionLe,
  enRetard,
  canEdit,
}: {
  affaireId: string;
  prochaineAction: string | null;
  /** "AAAA-MM-JJ" ou null. */
  prochaineActionLe: string | null;
  enRetard: boolean;
  canEdit: boolean;
}) {
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

  const affichage = (
    <>
      <CalendarClock
        size={13}
        className={enRetard ? "shrink-0 text-brand-600" : "shrink-0 text-slate-400"}
      />
      {prochaineAction ? (
        <span className="min-w-0 truncate">
          {prochaineAction}
          {prochaineActionLe && (
            <span
              className={
                enRetard
                  ? "ml-1 font-medium text-brand-700 dark:text-brand-400"
                  : "ml-1 text-slate-500"
              }
            >
              ({dateCourteFmt.format(new Date(prochaineActionLe + "T00:00:00.000Z"))})
            </span>
          )}
        </span>
      ) : (
        <span className="italic text-slate-400">
          {canEdit
            ? "Planifier la prochaine action"
            : "Aucune prochaine action planifiée"}
        </span>
      )}
    </>
  );

  if (!canEdit) {
    return (
      <span className="flex w-full items-center gap-1.5 text-slate-600 dark:text-slate-400 sm:w-auto">
        {affichage}
      </span>
    );
  }

  return (
    <>
      {/* Toute la ligne est le bouton (pleine largeur au téléphone) ; le
          crayon rend l'édition découvrable sans survol. */}
      <button
        type="button"
        onClick={() => setFeuilleOuverte(true)}
        aria-label="Modifier la prochaine action"
        className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60 sm:w-auto sm:px-1"
      >
        {affichage}
        <Pencil size={12} className="shrink-0 text-slate-400" />
      </button>

      {/* Feuille bas d'écran : libellé + échéance, comme sur la fiche. */}
      {feuilleOuverte && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFeuilleOuverte(false);
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
                onClick={() => setFeuilleOuverte(false)}
                aria-label="Fermer"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                    setFeuilleOuverte(false);
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
      )}
    </>
  );
}
