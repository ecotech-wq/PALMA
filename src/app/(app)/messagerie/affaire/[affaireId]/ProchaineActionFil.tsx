"use client";

// ─── Prochaine action éditable en place, dans le bandeau du fil ──────────────
// Le constat d'usage : replanifier la prochaine action se faisait uniquement
// sur la fiche, alors que le pilotage quotidien vit dans la messagerie. Ce
// composant rend la ligne « prochaine action » du bandeau tappable : la
// feuille bas d'écran partagée FeuilleProchaineAction (libellé + date)
// appelle majAffaire, qui pose aussi la trace système dans le fil.

import { useState } from "react";
import { CalendarClock, Pencil } from "lucide-react";
import { FeuilleProchaineAction } from "./FeuilleProchaineAction";

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
      <span className="flex w-full items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
        {affichage}
      </span>
    );
  }

  return (
    <>
      {/* Toute la ligne est le bouton (44 px de hauteur de tap) ; le
          crayon rend l'édition découvrable sans survol. */}
      <button
        type="button"
        onClick={() => setFeuilleOuverte(true)}
        aria-label="Modifier la prochaine action"
        className="flex min-h-11 w-full items-center gap-1.5 rounded-md py-1 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60 sm:px-1"
      >
        {affichage}
        <Pencil size={12} className="shrink-0 text-slate-400" />
      </button>

      {feuilleOuverte && (
        <FeuilleProchaineAction
          affaireId={affaireId}
          prochaineAction={prochaineAction}
          prochaineActionLe={prochaineActionLe}
          onClose={() => setFeuilleOuverte(false)}
        />
      )}
    </>
  );
}
