"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  PenLine,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import type {
  CategorieDocChantier,
  StatutSignatureDoc,
} from "@/generated/prisma/enums";
import {
  ajouterDocumentChantier,
  majDocumentChantier,
  supprimerDocumentChantier,
} from "./actions";
import { ORDRE_CATEGORIES, LABEL_CATEGORIE, LABEL_GROUPE } from "./categories";
import { SignerDocumentBox } from "./SignerDocumentBox";

// ─── Zone documentaire du chantier ──────────────────────────────────────────
// Équipe : dépôt, classement par catégorie, visibilité client et circuit de
// signature. Client : uniquement les pièces ouvertes, avec le pavé de
// signature pour celles en attente.

export type DocChantier = {
  id: string;
  nom: string;
  categorie: CategorieDocChantier;
  fichier: string;
  mimeType: string | null;
  taille: number | null;
  note: string | null;
  visibleClient: boolean;
  statutSignature: StatutSignatureDoc;
  signatureClientUrl: string | null;
  signatureClientLe: Date | string | null;
  signatureClientPar: string | null;
  createdAt: Date | string;
  creePar: string | null;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function tailleStr(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function iconFor(mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return ImageIcon;
  return FileText;
}

export function DocumentsChantier({
  chantierId,
  docs,
  isClient,
}: {
  chantierId: string;
  docs: DocChantier[];
  isClient: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

  const groupes = ORDRE_CATEGORIES.map((categorie) => ({
    categorie,
    docs: docs.filter((d) => d.categorie === categorie),
  })).filter((g) => g.docs.length > 0);

  return (
    <div>
      {!isClient && !showForm && (
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Ajouter un document
          </Button>
        </div>
      )}

      {!isClient && showForm && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Nouveau document
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="p-2 text-slate-400 hover:text-slate-600"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <FormulaireAjout
            chantierId={chantierId}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {docs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-500 dark:text-slate-400">
          {isClient
            ? "Aucun document partagé pour le moment."
            : "Aucun document pour ce chantier. Déposez plans, contrats, devis, factures, PV ou rapports, puis ouvrez au client ce qui le concerne."}
        </p>
      ) : (
        <div className="space-y-5">
          {groupes.map((g) => (
            <section key={g.categorie}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {LABEL_GROUPE[g.categorie]} ({g.docs.length})
              </h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {g.docs.map((d) => (
                  <LigneDocument key={d.id} doc={d} isClient={isClient} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function LigneDocument({
  doc,
  isClient,
}: {
  doc: DocChantier;
  isClient: boolean;
}) {
  const Icon = iconFor(doc.mimeType);
  return (
    <li className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={doc.fichier}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
            >
              {doc.nom}
            </a>
            {doc.statutSignature === "A_SIGNER" && (
              <Badge color="blue">À signer</Badge>
            )}
            {doc.statutSignature === "SIGNE" && (
              <Badge color="green">
                Signé
                {doc.signatureClientLe
                  ? ` le ${dateFmt.format(new Date(doc.signatureClientLe))}`
                  : ""}
              </Badge>
            )}
          </div>
          {doc.note && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {doc.note}
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-500">
            <span>{LABEL_CATEGORIE[doc.categorie]}</span>
            {doc.taille !== null && <span>· {tailleStr(doc.taille)}</span>}
            <span>· {dateFmt.format(new Date(doc.createdAt))}</span>
            {doc.creePar && <span>· {doc.creePar}</span>}
          </p>
        </div>
        {!isClient && <BoutonSuppression documentId={doc.id} nom={doc.nom} />}
      </div>

      {/* Équipe : visibilité client, demande / annulation de signature, vignette */}
      {!isClient && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BasculeVisibleClient doc={doc} />
          {doc.statutSignature === "SANS" && (
            <BoutonStatutSignature
              documentId={doc.id}
              cible="A_SIGNER"
              libelle="Demander la signature"
            />
          )}
          {doc.statutSignature === "A_SIGNER" && (
            <BoutonStatutSignature
              documentId={doc.id}
              cible="SANS"
              libelle="Annuler la demande"
            />
          )}
        </div>
      )}
      {!isClient && doc.signatureClientUrl && (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={doc.signatureClientUrl}
            alt="Signature du client"
            className="max-h-12 rounded bg-white"
          />
          <div className="text-xs text-green-800 dark:text-green-300">
            {doc.signatureClientPar && (
              <span className="block font-medium">
                {doc.signatureClientPar}
              </span>
            )}
            {doc.signatureClientLe && (
              <span className="block">
                le {dateFmt.format(new Date(doc.signatureClientLe))}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Client : pavé de signature (à signer) ou preuve de signature */}
      {isClient &&
        (doc.statutSignature === "A_SIGNER" ||
          doc.statutSignature === "SIGNE") && (
          <SignerDocumentBox
            documentId={doc.id}
            fichier={doc.fichier}
            signeUrl={doc.signatureClientUrl}
            signeLe={doc.signatureClientLe}
            signePar={doc.signatureClientPar}
          />
        )}
    </li>
  );
}

/** Bascule « Visible client ». État actif = encre (charte LYNX). Verrouillée
 *  tant qu'une signature est en attente : la pièce doit rester lisible. */
function BasculeVisibleClient({ doc }: { doc: DocChantier }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const verrouille = doc.statutSignature === "A_SIGNER";

  return (
    <button
      type="button"
      disabled={pending || verrouille}
      title={
        verrouille
          ? "Un document en attente de signature reste visible du client"
          : doc.visibleClient
            ? "Masquer au client"
            : "Ouvrir au client"
      }
      onClick={() =>
        startTransition(async () => {
          try {
            await majDocumentChantier(doc.id, {
              visibleClient: !doc.visibleClient,
            });
            toast.success(
              doc.visibleClient
                ? "Document masqué au client"
                : "Document ouvert au client"
            );
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erreur");
          }
        })
      }
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        doc.visibleClient
          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
          : "border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
      )}
    >
      {doc.visibleClient ? <Eye size={13} /> : <EyeOff size={13} />}
      Visible client
    </button>
  );
}

/** Demande (SANS -> A_SIGNER) ou annule (A_SIGNER -> SANS) la signature. */
function BoutonStatutSignature({
  documentId,
  cible,
  libelle,
}: {
  documentId: string;
  cible: "SANS" | "A_SIGNER";
  libelle: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={cible === "A_SIGNER" ? "outline" : "ghost"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await majDocumentChantier(documentId, { statutSignature: cible });
            toast.success(
              cible === "A_SIGNER"
                ? "Signature demandée : le document est ouvert au client"
                : "Demande de signature annulée"
            );
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erreur");
          }
        })
      }
    >
      <PenLine size={13} /> {libelle}
    </Button>
  );
}

function BoutonSuppression({
  documentId,
  nom,
}: {
  documentId: string;
  nom: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm(`Supprimer « ${nom} » ? Cette action est définitive.`)) {
          return;
        }
        startTransition(async () => {
          try {
            await supprimerDocumentChantier(documentId);
            toast.success("Document supprimé");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erreur");
          }
        });
      }}
      disabled={pending}
      className="p-2 text-slate-400 hover:text-red-600"
      title="Supprimer"
    >
      <Trash2 size={14} />
    </button>
  );
}

function FormulaireAjout({
  chantierId,
  onDone,
}: {
  chantierId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
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
        await ajouterDocumentChantier(chantierId, formData);
        toast.success("Document ajouté");
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
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.dwg,.dxf,.txt,.csv,.zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Upload size={14} />
          {file ? "Changer le fichier" : "Choisir un fichier"}
        </button>
        {file && (
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            <strong>{file.name}</strong> · {tailleStr(file.size)}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          PDF, images, Word, Excel, PowerPoint, DWG/DXF, TXT, CSV, ZIP (max 25
          Mo).
        </p>
      </div>

      <Field label="Nom" hint="Laissez vide pour reprendre le nom du fichier">
        <Input name="nom" placeholder="Ex : Contrat de travaux, Plan RDC indice B" />
      </Field>

      <Field label="Catégorie" required>
        <Select name="categorie" required defaultValue="AUTRE">
          {ORDRE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {LABEL_CATEGORIE[c]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note (optionnel)">
        <Textarea name="note" rows={2} placeholder="Précisions pour l'équipe ou le client…" />
      </Field>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          name="visibleClient"
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
        />
        Visible par le client
      </label>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          name="demanderSignature"
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
        />
        <span>
          Demander la signature du client
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            La demande rend automatiquement le document visible du client.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending || !file}>
          {pending ? "Envoi…" : "Ajouter le document"}
        </Button>
      </div>
    </form>
  );
}
