"use client";

// ─── Dossier client : l'arborescence virtuelle et ses gestes ─────────────────
// Les six sous-dossiers sont toujours affichés, avec leur compteur : le
// dossier se lit d'un coup d'œil, même à moitié vide. Chaque document
// montre son nom, sa taille, sa date, son déposant, la pièce de checklist
// qu'il valide le cas échéant, et le lien vers le message d'origine quand
// il vient du fil. Dépôt direct possible dans une catégorie (le « + » du
// sous-dossier pré-remplit la catégorie), suppression avec confirmation.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import type { CategorieDocAffaire as CategorieDocAffairePrisma } from "@/generated/prisma/enums";
import type { ChecklistItem } from "@/lib/affaires";
import { ACCEPT_DOCUMENTS, formatTailleFichier } from "@/lib/pieces-jointes";
import {
  DESCRIPTION_GROUPE_AFFAIRE,
  LABEL_GROUPE_AFFAIRE,
  ORDRE_CATEGORIES_AFFAIRE,
  type CategorieDocAffaire,
} from "@/lib/ged-affaire";
import { ajouterDocumentAffaire, supprimerDocumentAffaire } from "./actions";

export type DocAffaire = {
  id: string;
  categorie: CategorieDocAffairePrisma;
  checklistCle: string | null;
  nom: string;
  fichier: string;
  mimeType: string | null;
  taille: number | null;
  note: string | null;
  messageId: string | null;
  createdAt: Date | string;
  creePar: string | null;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function DocumentsAffaire({
  affaireId,
  docs,
  checklist,
}: {
  affaireId: string;
  docs: DocAffaire[];
  checklist: ChecklistItem[];
}) {
  // Catégorie pré-remplie du formulaire de dépôt ; null = formulaire fermé.
  const [depotDans, setDepotDans] = useState<CategorieDocAffaire | null>(null);
  const libelleParCle = new Map(checklist.map((c) => [c.cle, c.libelle]));

  return (
    <div>
      {depotDans === null ? (
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => setDepotDans("AUTRE")}>
            <Plus size={14} /> Déposer une pièce
          </Button>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Nouvelle pièce du dossier
            </h3>
            <button
              type="button"
              onClick={() => setDepotDans(null)}
              className="flex h-11 w-11 items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <FormulaireDepot
            affaireId={affaireId}
            categorieInitiale={depotDans}
            checklist={checklist}
            onDone={() => setDepotDans(null)}
          />
        </div>
      )}

      <div className="space-y-5">
        {ORDRE_CATEGORIES_AFFAIRE.map((categorie) => {
          const dedans = docs.filter((d) => d.categorie === categorie);
          return (
            <section key={categorie}>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {LABEL_GROUPE_AFFAIRE[categorie]}{" "}
                  <span className="tabular-nums">({dedans.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setDepotDans(categorie)}
                  aria-label={`Déposer dans ${LABEL_GROUPE_AFFAIRE[categorie]}`}
                  title={`Déposer dans ${LABEL_GROUPE_AFFAIRE[categorie]}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <Plus size={14} />
                </button>
              </div>
              {dedans.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  {DESCRIPTION_GROUPE_AFFAIRE[categorie]} : rien pour
                  l&apos;instant.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {dedans.map((d) => (
                    <LignePiece
                      key={d.id}
                      affaireId={affaireId}
                      doc={d}
                      libelleChecklist={
                        d.checklistCle
                          ? (libelleParCle.get(d.checklistCle) ??
                            d.checklistCle)
                          : null
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LignePiece({
  affaireId,
  doc,
  libelleChecklist,
}: {
  affaireId: string;
  doc: DocAffaire;
  libelleChecklist: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const Icone = doc.mimeType?.startsWith("image/") ? ImageIcon : FileText;

  return (
    <li className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Icone size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <a
            href={doc.fichier}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
          >
            {doc.nom}
          </a>
          {doc.note && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {doc.note}
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-500">
            {doc.taille !== null && doc.taille > 0 && (
              <span>{formatTailleFichier(doc.taille)} ·</span>
            )}
            <span>{dateFmt.format(new Date(doc.createdAt))}</span>
            {doc.creePar && <span>· {doc.creePar}</span>}
          </p>
          {(libelleChecklist || doc.messageId) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {libelleChecklist && (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <CheckSquare size={11} />
                  Valide : {libelleChecklist}
                </span>
              )}
              {doc.messageId && (
                <Link
                  href={`/messagerie/affaire/${affaireId}`}
                  className="inline-flex items-center gap-1 text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                >
                  <MessageSquare size={11} />
                  Rangée depuis le fil : voir le message
                </Link>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              !confirm(
                `Retirer « ${doc.nom} » du dossier client ?` +
                  (doc.messageId
                    ? " Le fichier restera visible dans le fil de l'affaire."
                    : " Cette action est définitive.")
              )
            ) {
              return;
            }
            startTransition(async () => {
              try {
                await supprimerDocumentAffaire(doc.id);
                toast.success("Pièce retirée du dossier");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erreur");
              }
            });
          }}
          disabled={pending}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-400 hover:text-red-600"
          title="Retirer du dossier"
          aria-label={`Retirer ${doc.nom} du dossier`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

function FormulaireDepot({
  affaireId,
  categorieInitiale,
  checklist,
  onDone,
}: {
  affaireId: string;
  categorieInitiale: CategorieDocAffaire;
  checklist: ChecklistItem[];
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [categorie, setCategorie] =
    useState<CategorieDocAffaire>(categorieInitiale);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    if (!file) {
      setError("Sélectionnez un fichier");
      return;
    }
    formData.set("file", file);
    startTransition(async () => {
      try {
        await ajouterDocumentAffaire(affaireId, formData);
        toast.success("Pièce déposée dans le dossier");
        formRef.current?.reset();
        setFile(null);
        onDone();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-3">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_DOCUMENTS}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Upload size={14} />
          {file ? "Changer le fichier" : "Choisir un fichier"}
        </button>
        {file && (
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            <strong>{file.name}</strong> · {formatTailleFichier(file.size)}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          PDF, images, Word, Excel, PowerPoint, DWG/DXF, TXT, CSV, ZIP (max 25
          Mo).
        </p>
      </div>

      <Field label="Nom" hint="Laissez vide pour reprendre le nom du fichier">
        <Input name="nom" placeholder="Ex : Plan cadastral, CU, esquisse RDC" />
      </Field>

      <Field label="Sous-dossier" required>
        <Select
          name="categorie"
          required
          value={categorie}
          onChange={(e) =>
            setCategorie(e.target.value as CategorieDocAffaire)
          }
        >
          {ORDRE_CATEGORIES_AFFAIRE.map((c) => (
            <option key={c} value={c}>
              {LABEL_GROUPE_AFFAIRE[c]}
            </option>
          ))}
        </Select>
      </Field>

      {categorie === "PIECES_CLIENT" && checklist.length > 0 && (
        <Field
          label="Pièce du dossier validée"
          hint="La case correspondante de la checklist sera cochée (trace « Pièce reçue » dans le fil)"
        >
          <Select name="checklistCle" defaultValue="">
            <option value="">Aucune pièce précise</option>
            {checklist.map((c) => (
              <option key={c.cle} value={c.cle}>
                {c.libelle}
                {c.fait ? " (déjà reçue)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Note (optionnel)">
        <Textarea
          name="note"
          rows={2}
          placeholder="Précisions utiles au dossier..."
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={pending || !file}>
          {pending ? "Envoi..." : "Déposer la pièce"}
        </Button>
      </div>
    </form>
  );
}
