"use client";

// ─── Feuille « Pièce du dossier » : joindre le fichier ou cocher à vide ──────
// Ouverte quand on coche une pièce de la checklist qu'AUCUN document ne
// valide encore : plutôt que de cocher « à vide », la feuille propose de
// joindre le fichier tout de suite. « Joindre le fichier » passe par
// l'action existante ajouterDocumentAffaire (catégorie « Pièces client » +
// clé de checklist) : le document est rangé dans le dossier client, la case
// se coche et la trace « Pièce reçue : ... » part dans le fil, en un seul
// aller serveur (cocherChecklist y est déjà appelée et elle est idempotente,
// donc pas de double coche ni de double trace côté client). « Marquer reçue
// sans fichier » garde le geste historique : le PARENT applique son état
// optimiste habituel (cocherChecklist + rollback + toast). Décocher une
// pièce, ou cocher une pièce déjà validée par un fichier, ne passe JAMAIS
// par cette feuille (geste direct chez le parent).
// Partagée par le fil (ChecklistFil) et la fiche (ChecklistAffaire).
// z-[60] : elle s'ouvre souvent PAR-DESSUS la feuille checklist du fil (z-50).

import { useRef, useState } from "react";
import { CheckSquare, ClipboardCheck, Loader2, Paperclip, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import {
  ACCEPT_DOCUMENTS,
  TAILLE_MAX_DOCUMENT_OCTETS,
  controlerTaillesEnvoi,
} from "@/lib/pieces-jointes";
import { ajouterDocumentAffaire } from "@/app/(app)/affaires/[id]/documents/actions";

/** Document de GED qui valide une pièce de checklist (le plus récent par
 *  clé). Type partagé entre le fil, la fiche et le composer. */
export type DocPiece = { url: string; nom: string };

const choixCls =
  "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800";

export function FeuillePiece({
  affaireId,
  cle,
  libelle,
  onMarquerSansFichier,
  onFichierJoint,
  onClose,
}: {
  affaireId: string;
  /** Clé de la pièce dans la checklist de l'affaire. */
  cle: string;
  libelle: string;
  /** Coche « à vide » : le parent applique son état optimiste habituel
   *  (cocherChecklist + rollback + toast) ; la feuille se ferme aussitôt. */
  onMarquerSansFichier: () => void;
  /** Appelé après un upload réussi : le serveur a déjà coché la case et
   *  posé la trace ; le parent reflète la coche (optimiste) et rafraîchit. */
  onFichierJoint: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const fileRef = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);

  // Pendant l'upload, la feuille reste ouverte (indicateur de progression)
  // et ne se ferme ni au voile ni au X : fermer en plein envoi laisserait
  // croire que rien ne se passe alors que le serveur travaille.
  function fermer() {
    if (envoi) return;
    onClose();
  }

  function surFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Input vidé tout de suite : re-choisir le même fichier après un refus
    // ou un échec doit redéclencher onChange.
    if (e.target) e.target.value = "";
    if (!file) return;
    // Plafond CLIENT : miroir exact du chemin serveur emprunté ici,
    // ajouterDocumentAffaire -> saveUploadedDocument (25 Mo pour TOUT,
    // images comprises : le dépôt direct passe par le pipeline document,
    // pas par celui des photos du fil). Le contrôle et le message français
    // viennent de lib/pieces-jointes.ts ; refuser avant l'envoi évite
    // d'uploader en entier un fichier voué au refus.
    const { refus } = controlerTaillesEnvoi(
      [],
      [{ nom: file.name, taille: file.size }],
      TAILLE_MAX_DOCUMENT_OCTETS
    );
    if (refus.length > 0) {
      for (const message of refus) toast.error(message);
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("categorie", "PIECES_CLIENT");
    fd.set("checklistCle", cle);
    setEnvoi(true);
    void (async () => {
      try {
        await ajouterDocumentAffaire(affaireId, fd);
        toast.success("Pièce reçue, fichier rangé dans le dossier client");
        onFichierJoint();
        onClose();
      } catch (err) {
        // Échec : la feuille reste ouverte, rien n'a été coché (le parent
        // n'a pas posé d'état optimiste pour ce chemin).
        toast.error(err instanceof Error ? err.message : "Erreur");
        setEnvoi(false);
      }
    })();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div
        style={fondOpaque}
        className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <ClipboardCheck size={17} className="shrink-0 text-slate-500" />
            <span className="truncate">Pièce : {libelle}</span>
          </h2>
          <button
            type="button"
            onClick={fermer}
            disabled={envoi}
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Le fichier joint est rangé dans « Pièces client » du dossier client
          et valide cette pièce (trace « Pièce reçue » dans le fil).
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_DOCUMENTS}
          onChange={surFichier}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={envoi}
          className={choixCls}
        >
          {envoi ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-slate-500" />
          ) : (
            <Paperclip size={16} className="shrink-0 text-slate-500" />
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              {envoi ? "Envoi du fichier..." : "Joindre le fichier"}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              PDF, image ou document, 25 Mo au plus
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (envoi) return;
            onMarquerSansFichier();
            onClose();
          }}
          disabled={envoi}
          className={choixCls}
        >
          <CheckSquare size={16} className="shrink-0 text-slate-500" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Marquer reçue sans fichier
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              La case se coche, sans document au dossier
            </span>
          </span>
        </button>

        <button type="button" onClick={fermer} disabled={envoi} className={choixCls}>
          <X size={16} className="shrink-0 text-slate-500" />
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Annuler
          </span>
        </button>
      </div>
    </div>
  );
}
