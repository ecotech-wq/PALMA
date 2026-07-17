"use client";

// ─── Feuille « Ranger dans le dossier client » ───────────────────────────────
// Apparaît juste APRÈS l'envoi d'un message avec pièces jointes dans un fil
// d'AFFAIRE : non bloquante (le message est déjà parti ; « Ignorer » laisse
// les fichiers en simples pièces jointes du fil). Pour chaque pièce, la
// catégorie est pré-suggérée (image -> Photos, sinon Autres) ; la catégorie
// « Pièces client » propose en plus la pièce de checklist validée (cadastre,
// géomètre, topo, CU, photos) : valider crée les AffaireDocument (messageId
// = message d'origine) et coche automatiquement la checklist (trace « Pièce
// reçue » dans le fil, via l'action existante cocherChecklist).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import type { ChecklistItem } from "@/lib/affaires";
import {
  LABEL_GROUPE_AFFAIRE,
  ORDRE_CATEGORIES_AFFAIRE,
  suggererCategorie,
  type CategorieDocAffaire,
} from "@/lib/ged-affaire";
import { rangerPiecesJointes } from "@/app/(app)/affaires/[id]/documents/actions";

/** Une pièce jointe envoyée, telle que stockée sur le message. */
export type PieceEnvoyee = {
  url: string;
  nom: string;
  mimeType: string;
};

const selectCls =
  "min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function RangerDossierClient({
  affaireId,
  messageId,
  pieces,
  checklist,
  onClose,
}: {
  affaireId: string;
  messageId: string;
  pieces: PieceEnvoyee[];
  /** Checklist du dossier (pièces du permis) ; vide hors permis. */
  checklist: ChecklistItem[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const premiereNonRecue =
    checklist.find((c) => !c.fait)?.cle ?? checklist[0]?.cle ?? "";

  // Un choix par pièce : catégorie pré-suggérée, pièce de checklist vide
  // tant que la catégorie n'est pas « Pièces client ».
  const [choix, setChoix] = useState(
    pieces.map((p) => ({
      categorie: suggererCategorie(p.mimeType),
      checklistCle: "",
    }))
  );

  function changerCategorie(index: number, categorie: CategorieDocAffaire) {
    setChoix((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              categorie,
              // En passant sur « Pièces client », proposer d'office la
              // première pièce encore attendue ; sinon pas de clé.
              checklistCle:
                categorie === "PIECES_CLIENT" ? premiereNonRecue : "",
            }
          : c
      )
    );
  }

  function changerPiece(index: number, checklistCle: string) {
    setChoix((prev) =>
      prev.map((c, i) => (i === index ? { ...c, checklistCle } : c))
    );
  }

  function ranger() {
    startTransition(async () => {
      try {
        const res = await rangerPiecesJointes({
          affaireId,
          messageId,
          pieces: pieces.map((p, i) => ({
            url: p.url,
            nom: p.nom,
            categorie: choix[i].categorie,
            checklistCle: choix[i].checklistCle,
          })),
        });
        toast.success(
          res.rangees === 0
            ? "Ces pièces étaient déjà dans le dossier client"
            : res.rangees > 1
              ? `${res.rangees} pièces rangées dans le dossier client`
              : "Pièce rangée dans le dossier client"
        );
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
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
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <FolderOpen size={17} className="text-slate-500" />
            Ranger dans le dossier client
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer sans ranger"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Le message est envoyé. Chaque pièce jointe peut rejoindre le
          sous-dossier correspondant du dossier de l&apos;affaire ;
          « Ignorer » la laisse en simple pièce jointe du fil.
        </p>

        <ul className="space-y-3">
          {pieces.map((p, i) => {
            const estImage = p.mimeType.startsWith("image/");
            const Icone = estImage ? ImageIcon : FileText;
            return (
              <li
                key={p.url}
                className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
              >
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <Icone size={15} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 truncate font-medium">{p.nom}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600 dark:text-slate-400">
                      Sous-dossier
                    </span>
                    <select
                      value={choix[i].categorie}
                      onChange={(e) =>
                        changerCategorie(
                          i,
                          e.target.value as CategorieDocAffaire
                        )
                      }
                      className={selectCls}
                    >
                      {ORDRE_CATEGORIES_AFFAIRE.map((c) => (
                        <option key={c} value={c}>
                          {LABEL_GROUPE_AFFAIRE[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {choix[i].categorie === "PIECES_CLIENT" &&
                    checklist.length > 0 && (
                      <label className="block text-xs">
                        <span className="mb-1 block font-medium text-slate-600 dark:text-slate-400">
                          Pièce du dossier validée
                        </span>
                        <select
                          value={choix[i].checklistCle}
                          onChange={(e) => changerPiece(i, e.target.value)}
                          className={selectCls}
                        >
                          <option value="">Aucune pièce précise</option>
                          {checklist.map((c) => (
                            <option key={c.cle} value={c.cle}>
                              {c.libelle}
                              {c.fait ? " (déjà reçue)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            Ignorer
          </Button>
          <Button type="button" disabled={pending} onClick={ranger}>
            {pending ? "Rangement..." : "Ranger"}
          </Button>
        </div>
      </div>
    </div>
  );
}
