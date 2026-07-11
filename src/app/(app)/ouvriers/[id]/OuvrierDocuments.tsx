"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Download, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";

type DocumentOuvrier = {
  id: string;
  nom: string;
  categorie: string;
  fichier: string;
  mimeType: string | null;
  taille: number | null;
  note: string | null;
  createdAt: Date;
  creePar: string | null;
};

/** Ordre d'affichage et libellés français des catégories de documents. */
const CATEGORIES: { value: string; label: string }[] = [
  { value: "CV", label: "CV" },
  { value: "HABILITATION", label: "Habilitation" },
  { value: "CONTRAT", label: "Contrat" },
  { value: "IDENTITE", label: "Pièce d'identité" },
  { value: "MEDICAL", label: "Visite médicale" },
  { value: "AUTRE", label: "Autre" },
];

/** Extensions acceptées côté client (alignées sur saveUploadedDocument). */
const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.dwg,.dxf,.txt,.csv,.zip";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Taille lisible : octets bruts sous 1 Ko, sinon Ko ou Mo (virgule fr). */
function formatTaille(octets: number | null): string | null {
  if (octets == null) return null;
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function OuvrierDocuments({
  documents,
  onAdd,
  onDelete,
}: {
  documents: DocumentOuvrier[];
  onAdd: (formData: FormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [formOuvert, setFormOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  function soumettre(formData: FormData) {
    startTransition(async () => {
      try {
        await onAdd(formData);
        formRef.current?.reset();
        setFormOuvert(false);
        toast.success("Document ajouté");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function supprimer(doc: DocumentOuvrier) {
    if (
      !confirm(
        `Supprimer le document « ${doc.nom} » ? Le fichier sera définitivement effacé.`
      )
    )
      return;
    startTransition(async () => {
      try {
        await onDelete(doc.id);
        toast.success("Document supprimé");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const groupes = CATEGORIES.map((cat) => ({
    ...cat,
    docs: documents.filter((d) => d.categorie === cat.value),
  })).filter((g) => g.docs.length > 0);

  return (
    <div>
      {groupes.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucun document. Ajoute ici le CV, les habilitations, le contrat et
          les pièces de l&apos;ouvrier : tout son dossier au même endroit.
        </p>
      ) : (
        <div className="space-y-4">
          {groupes.map((g) => (
            <div key={g.value}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.label}
                <span className="ml-1 font-normal normal-case text-slate-400 dark:text-slate-500">
                  ({g.docs.length})
                </span>
              </h3>
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
                {g.docs.map((d) => (
                  <li key={d.id} className="py-2.5 flex items-start gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mt-0.5">
                      <FileText size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a
                        href={d.fichier}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline break-words"
                      >
                        {d.nom}
                      </a>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {[
                          formatTaille(d.taille),
                          dateFmt.format(new Date(d.createdAt)),
                          d.creePar ? `par ${d.creePar}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {d.note && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 italic mt-0.5">
                          {d.note}
                        </div>
                      )}
                    </div>
                    <a
                      href={d.fichier}
                      download={d.nom}
                      className="w-10 h-10 shrink-0 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title="Télécharger"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => supprimer(d)}
                      disabled={pending}
                      className="w-10 h-10 shrink-0 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {formOuvert ? (
        <form
          ref={formRef}
          action={soumettre}
          className="mt-4 space-y-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4"
        >
          <Field
            label="Fichier"
            required
            hint="PDF, image, Word, Excel, DWG... 25 Mo max"
          >
            <input
              name="fichier"
              type="file"
              accept={ACCEPT}
              required
              className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 dark:file:text-slate-300"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Catégorie" required>
              <Select name="categorie" defaultValue="AUTRE" required>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Nom du document"
              hint="Laisser vide pour garder le nom du fichier"
            >
              <Input name="nom" placeholder="Ex. : CACES R489, CNI..." />
            </Field>
          </div>
          <Field label="Note">
            <Input name="note" placeholder="Ex. : valable jusqu'au 12/2027" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOuvert(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Envoi..." : "Ajouter"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setFormOuvert(true)}
        >
          <Plus size={14} /> Ajouter un document
        </Button>
      )}
    </div>
  );
}
