"use client";

// ─── Feuille « Ranger dans le dossier client » (après coup) ──────────────────
// Ouverte d'un tap sur le bouton dossier d'une pièce jointe encore non
// rangée d'un message du fil d'affaire. Destination : catégorie standard,
// dossier personnalisé ou nouveau dossier créé à la volée ; en « Pièces
// client », la pièce de checklist validée peut être choisie. Le rangement
// passe par rangerPiecesJointes (gardes, idempotence par index unique,
// coche de checklist et trace « Pièce reçue » dans le fil).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import type { ChecklistItem } from "@/lib/affaires";
import { suggererCategorie, type DossierPerso } from "@/lib/ged-affaire";
import { rangerPiecesJointes } from "@/app/(app)/affaires/[id]/documents/actions";
import {
  ChoixClassement,
  FeuilleNouveauDossier,
  decoderDestination,
  encoderDestination,
} from "./ChoixClassement";

/** Une pièce jointe d'un message du fil, telle que stockée. */
export type PieceAClasser = {
  url: string;
  nom: string;
  mimeType: string;
};

const selectCls =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function FeuilleClassement({
  affaireId,
  messageId,
  piece,
  checklist,
  dossiers,
  onClose,
}: {
  affaireId: string;
  messageId: string;
  piece: PieceAClasser;
  /** Checklist du dossier (pièces du permis) ; vide hors permis. */
  checklist: ChecklistItem[];
  dossiers: DossierPerso[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const premiereNonRecue =
    checklist.find((c) => !c.fait)?.cle ?? checklist[0]?.cle ?? "";

  const [valeur, setValeur] = useState(
    encoderDestination({
      categorie: suggererCategorie(piece.mimeType),
      dossierPerso: null,
    })
  );
  const [checklistCle, setChecklistCle] = useState("");
  // Dossiers créés depuis cette feuille, en plus de ceux de l'affaire.
  const [dossiersCrees, setDossiersCrees] = useState<DossierPerso[]>([]);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);

  const tousDossiers = [
    ...dossiers,
    ...dossiersCrees.filter((d) => !dossiers.some((e) => e.cle === d.cle)),
  ];
  const estPiecesClient = valeur === "cat:PIECES_CLIENT";

  function changerDestination(v: string) {
    setValeur(v);
    // En arrivant sur « Pièces client », proposer d'office la première
    // pièce encore attendue ; en repartant, plus de clé.
    setChecklistCle(v === "cat:PIECES_CLIENT" ? premiereNonRecue : "");
  }

  function ranger() {
    const destination = decoderDestination(valeur);
    if (!destination) {
      onClose();
      return;
    }
    startTransition(async () => {
      try {
        const res = await rangerPiecesJointes({
          affaireId,
          messageId,
          pieces: [
            {
              url: piece.url,
              nom: piece.nom,
              categorie: destination.categorie,
              checklistCle: destination.dossierPerso ? "" : checklistCle,
              dossierPerso: destination.dossierPerso ?? "",
            },
          ],
        });
        toast.success(
          res.rangees === 0
            ? "Cette pièce était déjà dans le dossier client"
            : "Pièce rangée dans le dossier client"
        );
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  const estImage = piece.mimeType.startsWith("image/");
  const Icone = estImage ? ImageIcon : FileText;

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

          <div className="mb-3 flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <Icone size={15} className="shrink-0 text-slate-500" />
            <span className="min-w-0 truncate font-medium">{piece.nom}</span>
          </div>

          <div className="space-y-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-400">
                Destination
              </span>
              <ChoixClassement
                valeur={valeur}
                onChange={changerDestination}
                dossiers={tousDossiers}
                onNouveauDossier={() => setNouveauOuvert(true)}
              />
            </label>

            {estPiecesClient && checklist.length > 0 && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-400">
                  Pièce du dossier validée
                </span>
                <select
                  value={checklistCle}
                  onChange={(e) => setChecklistCle(e.target.value)}
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onClose}
              >
                Annuler
              </Button>
              <Button type="button" disabled={pending} onClick={ranger}>
                {pending ? "Rangement..." : "Ranger"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {nouveauOuvert && (
        <FeuilleNouveauDossier
          affaireId={affaireId}
          onCree={(d) => {
            setDossiersCrees((prev) =>
              prev.some((x) => x.cle === d.cle) ? prev : [...prev, d]
            );
            setValeur(`perso:${d.cle}`);
            setChecklistCle("");
          }}
          onClose={() => setNouveauOuvert(false)}
        />
      )}
    </>
  );
}
