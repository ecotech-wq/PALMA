"use client";

// ─── Checklist des pièces du dossier, en feuille bas d'écran ─────────────────
// La checklist du dossier (pièces du permis de construire) vivait dépliée
// sous le bandeau du fil ; elle vit désormais dans la feuille « + » du
// composer (« Pièces du dossier ») pour laisser toute la hauteur au fil.
// Même mécanique qu'avant : état OPTIMISTE local (la case répond
// immédiatement), server action cocherChecklist (qui pose la trace
// « Pièce reçue : ... » dans le fil), rollback + toast en échec, puis
// revalidation (router.refresh). Une pièce peut aussi être validée par un
// document de la GED d'affaire (AffaireDocument.checklistCle) : le
// trombone renvoie alors vers le fichier. Cocher une pièce qu'AUCUN
// document ne valide encore ouvre la feuille partagée FeuillePiece
// (joindre le fichier, ou marquer reçue sans fichier) ; décocher, ou
// cocher une pièce déjà validée par un fichier, reste un geste direct.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Paperclip, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import type { ChecklistItem } from "@/lib/affaires";
import { cocherChecklist } from "@/app/(app)/affaires/actions";
import { FeuillePiece, type DocPiece } from "@/app/(app)/affaires/FeuillePiece";

/** Réexport de compatibilité : le type vit désormais avec la feuille
 *  partagée (utilisé aussi par la fiche affaire et le composer). */
export type { DocPiece };

export function ChecklistFil({
  affaireId,
  items,
  docs,
  canEdit,
  onClose,
}: {
  affaireId: string;
  items: ChecklistItem[];
  /** cle de checklist -> document validant (AffaireDocument.checklistCle). */
  docs: Record<string, DocPiece>;
  canEdit: boolean;
  onClose: () => void;
}) {
  // Surcouche optimiste : cle -> valeur affichée en attendant le serveur.
  // Conservée après succès (elle coïncide alors avec l'état revalidé).
  const [optimiste, setOptimiste] = useState<Record<string, boolean>>({});
  // Pièce dont la coche est en attente dans la feuille « joindre le
  // fichier » (null = feuille fermée).
  const [feuillePiece, setFeuillePiece] = useState<ChecklistItem | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

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
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={fondOpaque}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <ClipboardCheck size={17} className="text-slate-500" />
            Pièces du dossier
            <span
              className={`text-sm font-medium tabular-nums ${
                faits === items.length
                  ? "text-green-700 dark:text-green-400"
                  : "text-slate-500"
              }`}
            >
              {faits}/{items.length}
            </span>
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

        <ul>
          {affiches.map((it) => {
            const doc = docs[it.cle];
            return (
              <li key={it.cle} className="flex items-center gap-1">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={it.fait}
                    disabled={!canEdit}
                    onChange={(e) => {
                      // Cocher une pièce que rien ne valide encore :
                      // proposer d'abord de joindre le fichier (feuille
                      // partagée). Décocher, ou cocher une pièce déjà
                      // validée par un document : geste direct.
                      if (e.target.checked && !doc) {
                        setFeuillePiece(it);
                        return;
                      }
                      cocher(it.cle, e.target.checked);
                    }}
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
      </div>
    </div>

    {/* Feuille « joindre le fichier » : par-dessus la checklist (z-60). */}
    {feuillePiece && (
      <FeuillePiece
        affaireId={affaireId}
        cle={feuillePiece.cle}
        libelle={feuillePiece.libelle}
        onMarquerSansFichier={() => cocher(feuillePiece.cle, true)}
        onFichierJoint={() => {
          // Le serveur a déjà coché la case et posé la trace : la
          // surcouche optimiste la montre tout de suite, la revalidation
          // (router.refresh) confirme et fait apparaître le trombone.
          setOptimiste((prev) => ({ ...prev, [feuillePiece.cle]: true }));
          router.refresh();
        }}
        onClose={() => setFeuillePiece(null)}
      />
    )}
    </>
  );
}
