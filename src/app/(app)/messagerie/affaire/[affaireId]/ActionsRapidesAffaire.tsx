"use client";

// ─── Bandeau compact du fil d'affaire : étape + prochaine action + « ... » ───
// UNE seule ligne pour que le fil de messages garde le maximum de hauteur :
// le select d'étape (geste le plus fréquent, à un tap), la prochaine action
// tappable (children : ProchaineActionFil) et un menu « ... » en feuille bas
// d'écran qui regroupe le reste (Fiche, Dossier client avec compteur,
// Confier une action). Mêmes gardes qu'avant : édition seulement quand
// l'affaire est EN_COURS, actions réservées aux pilotes par la page.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FolderOpen,
  MoreHorizontal,
  UserPlus,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { changerEtape } from "@/app/(app)/affaires/actions";
import { FeuilleConfier } from "./FeuilleConfier";

export function ActionsRapidesAffaire({
  affaireId,
  etapeCle,
  etapes,
  cibles,
  statut,
  nbDocsDossier,
  children,
}: {
  affaireId: string;
  etapeCle: string;
  etapes: { cle: string; libelle: string }[];
  cibles: { id: string; name: string }[];
  statut: "EN_COURS" | "GAGNEE" | "PERDUE";
  /** Compteur du Dossier client affiché dans le menu « ... ». */
  nbDocsDossier: number;
  /** La prochaine action tappable (ProchaineActionFil), au centre. */
  children?: React.ReactNode;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [confierOuvert, setConfierOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const active = statut === "EN_COURS";

  const optionCls =
    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {/* Changer d'étape : le geste le plus fréquent, à un tap. */}
      <select
        aria-label="Changer d'étape"
        value={etapeCle}
        disabled={!active || pending}
        onChange={(e) => {
          const cle = e.target.value;
          if (cle === etapeCle) return;
          startTransition(async () => {
            try {
              await changerEtape(affaireId, cle);
              toast.success("Étape mise à jour");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Erreur");
            }
          });
        }}
        className="h-11 max-w-[45%] shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {etapes.map((e) => (
          <option key={e.cle} value={e.cle}>
            {e.libelle}
          </option>
        ))}
      </select>

      {/* Prochaine action tappable : prend toute la place restante. */}
      <div className="min-w-0 flex-1">{children}</div>

      <button
        type="button"
        onClick={() => setMenuOuvert(true)}
        aria-haspopup="menu"
        aria-expanded={menuOuvert}
        aria-label="Autres actions de l'affaire"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <MoreHorizontal size={18} />
      </button>

      {/* Menu « ... » : feuille bas d'écran (centrée sur grand écran). */}
      {menuOuvert && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOuvert(false);
          }}
        >
          <div
            style={{
              ...fondOpaque,
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
            className="w-full rounded-t-2xl border border-slate-200 p-3 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
            role="menu"
          >
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Affaire
              </span>
              <button
                type="button"
                onClick={() => setMenuOuvert(false)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <Link
              href={`/affaires/${affaireId}`}
              role="menuitem"
              className={optionCls}
            >
              <ExternalLink size={15} className="shrink-0 text-slate-500" />
              Fiche de l&apos;affaire
            </Link>
            <Link
              href={`/affaires/${affaireId}/documents`}
              role="menuitem"
              className={optionCls}
            >
              <FolderOpen size={15} className="shrink-0 text-slate-500" />
              Dossier client
              <span className="tabular-nums text-slate-500">
                ({nbDocsDossier})
              </span>
            </Link>
            {active && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOuvert(false);
                  setConfierOuvert(true);
                }}
                className={optionCls}
              >
                <UserPlus size={15} className="shrink-0 text-slate-500" />
                Confier une action
              </button>
            )}
          </div>
        </div>
      )}

      {confierOuvert && (
        <FeuilleConfier
          affaireId={affaireId}
          cibles={cibles}
          onClose={() => setConfierOuvert(false)}
        />
      )}
    </div>
  );
}
