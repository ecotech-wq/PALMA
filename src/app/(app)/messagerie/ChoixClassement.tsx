"use client";

// ─── Choix de classement d'une pièce du dossier client ───────────────────────
// Sélecteur partagé façon Trello : les six sous-dossiers standard, les
// dossiers personnalisés de l'affaire, « Nouveau dossier... » (création à la
// volée) et, en option, « Ne pas classer ». Utilisé par le composer (sur
// chaque puce de fichier AVANT envoi), par la feuille de classement du fil
// (rangement après coup) et par la page Dossier client (dépôt, déplacement).

import { useState, useTransition } from "react";
import { FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import {
  LABEL_GROUPE_AFFAIRE,
  LIBELLE_DOSSIER_MAX,
  ORDRE_CATEGORIES_AFFAIRE,
  type CategorieDocAffaire,
  type DossierPerso,
} from "@/lib/ged-affaire";
import { creerDossierPerso } from "@/app/(app)/affaires/[id]/documents/actions";

/** Destination décodée d'une pièce ; null = « Ne pas classer ». */
export type DestinationClassement = {
  categorie: CategorieDocAffaire;
  dossierPerso: string | null;
} | null;

/** Valeur spéciale du select qui déclenche la création d'un dossier. */
export const VALEUR_NOUVEAU_DOSSIER = "__nouveau";

export function encoderDestination(d: DestinationClassement): string {
  if (!d) return "aucun";
  return d.dossierPerso ? `perso:${d.dossierPerso}` : `cat:${d.categorie}`;
}

export function decoderDestination(valeur: string): DestinationClassement {
  if (valeur.startsWith("cat:")) {
    return {
      categorie: valeur.slice(4) as CategorieDocAffaire,
      dossierPerso: null,
    };
  }
  if (valeur.startsWith("perso:")) {
    // Un document rangé dans un dossier perso garde une catégorie neutre.
    return { categorie: "AUTRE", dossierPerso: valeur.slice(6) };
  }
  return null;
}

const selectCls =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

/**
 * Le select de destination. « Nouveau dossier... » n'est pas une valeur :
 * sa sélection appelle onNouveauDossier et la valeur affichée ne bouge pas
 * (le parent la mettra à jour quand le dossier sera créé).
 */
export function ChoixClassement({
  valeur,
  onChange,
  dossiers,
  onNouveauDossier,
  avecAucun = false,
  ariaLabel = "Classer dans",
  className,
}: {
  /** Valeur encodée : "cat:<CATEGORIE>", "perso:<cle>" ou "aucun". */
  valeur: string;
  onChange: (valeur: string) => void;
  dossiers: DossierPerso[];
  onNouveauDossier: () => void;
  /** Propose « Ne pas classer » (composer : la pièce reste dans le fil). */
  avecAucun?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={valeur}
      onChange={(e) => {
        const v = e.target.value;
        if (v === VALEUR_NOUVEAU_DOSSIER) {
          onNouveauDossier();
          return;
        }
        onChange(v);
      }}
      className={className ?? selectCls}
    >
      <optgroup label="Sous-dossiers">
        {ORDRE_CATEGORIES_AFFAIRE.map((c) => (
          <option key={c} value={`cat:${c}`}>
            {LABEL_GROUPE_AFFAIRE[c]}
          </option>
        ))}
      </optgroup>
      {dossiers.length > 0 && (
        <optgroup label="Dossiers personnalisés">
          {dossiers.map((d) => (
            <option key={d.cle} value={`perso:${d.cle}`}>
              {d.libelle}
            </option>
          ))}
        </optgroup>
      )}
      <option value={VALEUR_NOUVEAU_DOSSIER}>Nouveau dossier...</option>
      {avecAucun && <option value="aucun">Ne pas classer</option>}
    </select>
  );
}

/**
 * Feuille bas d'écran « Nouveau dossier » : un nom, la création passe par
 * creerDossierPerso (écriture conditionnelle optimiste côté serveur,
 * idempotente sur le même nom). z-[60] : elle s'ouvre souvent PAR-DESSUS
 * une autre feuille (classement, dépôt) qui vit en z-50.
 */
export function FeuilleNouveauDossier({
  affaireId,
  onCree,
  onClose,
}: {
  affaireId: string;
  /** Reçoit le dossier créé (ou existant si le nom était déjà pris). */
  onCree: (dossier: DossierPerso) => void;
  onClose: () => void;
}) {
  const [libelle, setLibelle] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

  function creer() {
    const nom = libelle.trim();
    if (nom === "") return;
    startTransition(async () => {
      try {
        const dossier = await creerDossierPerso(affaireId, nom);
        toast.success(`Dossier « ${dossier.libelle} » prêt`);
        onCree(dossier);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={fondOpaque}
        className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <FolderPlus size={17} className="text-slate-500" />
            Nouveau dossier
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
            creer();
          }}
        >
          <input
            autoFocus
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={LIBELLE_DOSSIER_MAX}
            placeholder="Mairie, Sous-traitants, Béton..."
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <Button
            type="submit"
            disabled={pending || libelle.trim() === ""}
            className="w-full"
          >
            {pending ? "Création..." : "Créer le dossier"}
          </Button>
        </form>
      </div>
    </div>
  );
}
