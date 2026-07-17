"use client";

// ─── Checklist des pièces, dépliable et cochable dans le fil ─────────────────
// La checklist du dossier (pièces du permis de construire) vivait uniquement
// sur la fiche. Ici elle se déplie sous le bandeau du fil et se coche d'un
// tap : état OPTIMISTE local (la case répond immédiatement), server action
// cocherChecklist (qui pose la trace « Pièce reçue : ... » dans le fil),
// puis revalidation (router.refresh). Une pièce peut aussi être validée par
// un document de la GED d'affaire (AffaireDocument.checklistCle) : le
// trombone renvoie alors vers le fichier.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ChecklistItem } from "@/lib/affaires";
import { cocherChecklist } from "@/app/(app)/affaires/actions";

/** Document de GED qui valide une pièce (le plus récent par clé). */
export type DocPiece = { url: string; nom: string };

export function ChecklistFil({
  affaireId,
  items,
  docs,
  canEdit,
}: {
  affaireId: string;
  items: ChecklistItem[];
  /** cle de checklist -> document validant (AffaireDocument.checklistCle). */
  docs: Record<string, DocPiece>;
  canEdit: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Surcouche optimiste : cle -> valeur affichée en attendant le serveur.
  // Conservée après succès (elle coïncide alors avec l'état revalidé).
  const [optimiste, setOptimiste] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (items.length === 0) return null;

  const affiches = items.map((it) => ({
    ...it,
    fait: optimiste[it.cle] ?? it.fait,
  }));
  const faits = affiches.filter((it) => it.fait).length;

  function cocher(cle: string, fait: boolean) {
    setOptimiste((prev) => ({ ...prev, [cle]: fait }));
    startTransition(async () => {
      try {
        await cocherChecklist(affaireId, cle, fait);
        router.refresh();
      } catch (err) {
        // Échec : la case revient à sa valeur serveur.
        setOptimiste((prev) => {
          const suivant = { ...prev };
          delete suivant[cle];
          return suivant;
        });
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <div className="mt-1.5 border-t border-slate-100 pt-1 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex min-h-[36px] w-full items-center gap-1.5 rounded-md px-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
      >
        {ouvert ? (
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-slate-400" />
        )}
        Pièces du dossier
        <span
          className={`tabular-nums ${
            faits === items.length
              ? "text-green-700 dark:text-green-400"
              : "text-slate-500"
          }`}
        >
          {faits}/{items.length}
        </span>
      </button>

      {ouvert && (
        <ul className="pb-1">
          {affiches.map((it) => {
            const doc = docs[it.cle];
            return (
              <li key={it.cle} className="flex items-center gap-1">
                <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={it.fait}
                    disabled={!canEdit}
                    onChange={(e) => cocher(it.cle, e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-200"
                  />
                  <span
                    className={
                      it.fait
                        ? "min-w-0 truncate text-slate-400 line-through"
                        : "min-w-0 truncate text-slate-800 dark:text-slate-200"
                    }
                  >
                    {it.libelle}
                  </span>
                </label>
                {/* Pièce validée par un document de la GED : le trombone
                    ouvre le fichier (cible 44px, jamais au survol seul). */}
                {doc && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`Voir le document : ${doc.nom}`}
                    aria-label={`Voir le document : ${doc.nom}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <Paperclip size={15} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
