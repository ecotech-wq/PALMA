"use client";

// ─── Dossier client : l'arborescence virtuelle et ses gestes ─────────────────
// Les six sous-dossiers standard sont toujours affichés, avec leur compteur,
// suivis des dossiers PERSONNALISÉS de l'affaire (façon Trello : « Nouveau
// dossier » les crée à la volée). Chaque document montre son nom, sa taille,
// sa date, son déposant, la pièce de checklist qu'il valide le cas échéant,
// et le lien vers le message d'origine quand il vient du fil. Dépôt direct
// possible dans une catégorie OU un dossier perso (le « + » du sous-dossier
// pré-remplit la destination), déplacement d'un document vers une autre
// destination, suppression avec confirmation.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  FileText,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import type { CategorieDocAffaire as CategorieDocAffairePrisma } from "@/generated/prisma/enums";
import type { ChecklistItem } from "@/lib/affaires";
import { ACCEPT_DOCUMENTS, formatTailleFichier } from "@/lib/pieces-jointes";
import {
  DESCRIPTION_GROUPE_AFFAIRE,
  LABEL_GROUPE_AFFAIRE,
  ORDRE_CATEGORIES_AFFAIRE,
  type DossierPerso,
} from "@/lib/ged-affaire";
import {
  ChoixClassement,
  FeuilleNouveauDossier,
  decoderDestination,
} from "@/app/(app)/messagerie/ChoixClassement";
import {
  ajouterDocumentAffaire,
  deplacerDocumentAffaire,
  supprimerDocumentAffaire,
} from "./actions";

export type DocAffaire = {
  id: string;
  categorie: CategorieDocAffairePrisma;
  checklistCle: string | null;
  dossierPerso: string | null;
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

const selectCls =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function DocumentsAffaire({
  affaireId,
  docs,
  checklist,
  dossiersPerso,
}: {
  affaireId: string;
  docs: DocAffaire[];
  checklist: ChecklistItem[];
  dossiersPerso: DossierPerso[];
}) {
  const router = useRouter();
  // Destination pré-remplie du formulaire de dépôt (valeur encodée
  // "cat:..." ou "perso:...") ; null = formulaire fermé.
  const [depotDans, setDepotDans] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const libelleParCle = new Map(checklist.map((c) => [c.cle, c.libelle]));

  // Sections personnalisées : le catalogue de l'affaire, plus les clés
  // historiques encore portées par des documents (dossier renommé ou
  // catalogue abîmé : on affiche, on ne casse pas). Les orphelines sont
  // AFFICHÉES mais jamais proposées comme destination de dépôt ou de
  // déplacement : le serveur (validerDossierPerso) les refuserait.
  const clesCatalogue = new Set(dossiersPerso.map((d) => d.cle));
  const orphelines = [
    ...new Set(
      docs
        .map((d) => d.dossierPerso)
        .filter((c): c is string => !!c && !clesCatalogue.has(c))
    ),
  ];
  const sectionsPerso: DossierPerso[] = [
    ...dossiersPerso,
    ...orphelines.map((cle) => ({ cle, libelle: cle })),
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setNouveauOuvert(true)}
        >
          <FolderPlus size={14} /> Nouveau dossier
        </Button>
        {depotDans === null && (
          <Button
            type="button"
            size="sm"
            onClick={() => setDepotDans("cat:AUTRE")}
          >
            <Plus size={14} /> Déposer une pièce
          </Button>
        )}
      </div>

      {depotDans !== null && (
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
            destinationInitiale={depotDans}
            checklist={checklist}
            dossiers={dossiersPerso}
            onDone={() => setDepotDans(null)}
          />
        </div>
      )}

      <div className="space-y-5">
        {ORDRE_CATEGORIES_AFFAIRE.map((categorie) => {
          const dedans = docs.filter(
            (d) => d.categorie === categorie && !d.dossierPerso
          );
          return (
            <SectionDossier
              key={categorie}
              titre={LABEL_GROUPE_AFFAIRE[categorie]}
              description={`${DESCRIPTION_GROUPE_AFFAIRE[categorie]} : rien pour l'instant.`}
              docs={dedans}
              onDeposer={() => setDepotDans(`cat:${categorie}`)}
              affaireId={affaireId}
              checklist={checklist}
              dossiers={dossiersPerso}
              libelleParCle={libelleParCle}
            />
          );
        })}

        {/* Dossiers personnalisés, APRÈS les six standard. Une section
            orpheline (clé absente du catalogue) n'offre pas le dépôt :
            le serveur le refuserait à coup sûr. */}
        {sectionsPerso.map((dossier) => (
          <SectionDossier
            key={`perso-${dossier.cle}`}
            titre={dossier.libelle}
            description="Dossier personnalisé : rien pour l'instant."
            docs={docs.filter((d) => d.dossierPerso === dossier.cle)}
            onDeposer={
              clesCatalogue.has(dossier.cle)
                ? () => setDepotDans(`perso:${dossier.cle}`)
                : undefined
            }
            affaireId={affaireId}
            checklist={checklist}
            dossiers={dossiersPerso}
            libelleParCle={libelleParCle}
          />
        ))}
      </div>

      {nouveauOuvert && (
        <FeuilleNouveauDossier
          affaireId={affaireId}
          onCree={() => router.refresh()}
          onClose={() => setNouveauOuvert(false)}
        />
      )}
    </div>
  );
}

function SectionDossier({
  titre,
  description,
  docs,
  onDeposer,
  affaireId,
  checklist,
  dossiers,
  libelleParCle,
}: {
  titre: string;
  description: string;
  docs: DocAffaire[];
  /** Absent pour une section orpheline : le dépôt y est impossible. */
  onDeposer?: () => void;
  affaireId: string;
  checklist: ChecklistItem[];
  dossiers: DossierPerso[];
  libelleParCle: Map<string, string>;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {titre} <span className="tabular-nums">({docs.length})</span>
        </h3>
        {onDeposer && (
          <button
            type="button"
            onClick={onDeposer}
            aria-label={`Déposer dans ${titre}`}
            title={`Déposer dans ${titre}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {description}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {docs.map((d) => (
            <LignePiece
              key={d.id}
              affaireId={affaireId}
              doc={d}
              checklist={checklist}
              dossiers={dossiers}
              libelleChecklist={
                d.checklistCle
                  ? (libelleParCle.get(d.checklistCle) ?? d.checklistCle)
                  : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LignePiece({
  affaireId,
  doc,
  checklist,
  dossiers,
  libelleChecklist,
}: {
  affaireId: string;
  doc: DocAffaire;
  checklist: ChecklistItem[];
  dossiers: DossierPerso[];
  libelleChecklist: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [deplacerOuvert, setDeplacerOuvert] = useState(false);
  const Icone = doc.mimeType?.startsWith("image/") ? ImageIcon : FileText;

  return (
    <li className="p-3">
      <div className="flex items-start gap-2">
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
          onClick={() => setDeplacerOuvert(true)}
          disabled={pending}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          title="Déplacer vers un autre dossier"
          aria-label={`Déplacer ${doc.nom} vers un autre dossier`}
        >
          <FolderInput size={15} />
        </button>
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

      {deplacerOuvert && (
        <FeuilleDeplacer
          affaireId={affaireId}
          doc={doc}
          checklist={checklist}
          dossiers={dossiers}
          onClose={() => setDeplacerOuvert(false)}
        />
      )}
    </li>
  );
}

/** Feuille « Déplacer vers... » : destination (catégorie ou dossier perso,
 *  nouveau dossier possible) et, en « Pièces client », la pièce validée. */
function FeuilleDeplacer({
  affaireId,
  doc,
  checklist,
  dossiers,
  onClose,
}: {
  affaireId: string;
  doc: DocAffaire;
  checklist: ChecklistItem[];
  dossiers: DossierPerso[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const [pending, startTransition] = useTransition();
  // Un document rangé dans un dossier orphelin (clé absente du catalogue)
  // repart d'une destination valide : le sélecteur ne propose que le
  // catalogue et le serveur refuserait la clé orpheline.
  const [valeur, setValeur] = useState(() =>
    doc.dossierPerso
      ? dossiers.some((d) => d.cle === doc.dossierPerso)
        ? `perso:${doc.dossierPerso}`
        : `cat:${doc.categorie}`
      : `cat:${doc.categorie}`
  );
  const [checklistCle, setChecklistCle] = useState(doc.checklistCle ?? "");
  const [dossiersCrees, setDossiersCrees] = useState<DossierPerso[]>([]);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);

  const tousDossiers = [
    ...dossiers,
    ...dossiersCrees.filter((d) => !dossiers.some((e) => e.cle === d.cle)),
  ];

  function deplacer() {
    const destination = decoderDestination(valeur);
    if (!destination) return;
    startTransition(async () => {
      try {
        await deplacerDocumentAffaire({
          documentId: doc.id,
          categorie: destination.categorie,
          dossierPerso: destination.dossierPerso ?? "",
          checklistCle:
            !destination.dossierPerso &&
            destination.categorie === "PIECES_CLIENT"
              ? checklistCle
              : "",
        });
        toast.success("Pièce déplacée");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
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
          className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <FolderInput size={17} className="text-slate-500" />
              Déplacer vers...
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
          <p className="mb-3 truncate text-xs text-slate-500 dark:text-slate-400">
            {doc.nom}
          </p>
          <div className="space-y-3">
            <ChoixClassement
              valeur={valeur}
              onChange={(v) => {
                setValeur(v);
                setChecklistCle("");
              }}
              dossiers={tousDossiers}
              onNouveauDossier={() => setNouveauOuvert(true)}
              ariaLabel="Déplacer vers"
            />
            {valeur === "cat:PIECES_CLIENT" && checklist.length > 0 && (
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
              <Button type="button" disabled={pending} onClick={deplacer}>
                {pending ? "Déplacement..." : "Déplacer"}
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

function FormulaireDepot({
  affaireId,
  destinationInitiale,
  checklist,
  dossiers,
  onDone,
}: {
  affaireId: string;
  /** Destination encodée ("cat:..." ou "perso:...") pré-remplie. */
  destinationInitiale: string;
  checklist: ChecklistItem[];
  dossiers: DossierPerso[];
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [valeur, setValeur] = useState(destinationInitiale);
  const [dossiersCrees, setDossiersCrees] = useState<DossierPerso[]>([]);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const tousDossiers = [
    ...dossiers,
    ...dossiersCrees.filter((d) => !dossiers.some((e) => e.cle === d.cle)),
  ];

  function onSubmit(formData: FormData) {
    setError(null);
    if (!file) {
      setError("Sélectionnez un fichier");
      return;
    }
    const destination = decoderDestination(valeur);
    if (!destination) {
      setError("Choisissez une destination");
      return;
    }
    formData.set("file", file);
    formData.set("categorie", destination.categorie);
    formData.set("dossierPerso", destination.dossierPerso ?? "");
    if (destination.dossierPerso) formData.set("checklistCle", "");
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
    <>
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
          <ChoixClassement
            valeur={valeur}
            onChange={setValeur}
            dossiers={tousDossiers}
            onNouveauDossier={() => setNouveauOuvert(true)}
            ariaLabel="Sous-dossier de dépôt"
          />
        </Field>

        {valeur === "cat:PIECES_CLIENT" && checklist.length > 0 && (
          <Field
            label="Pièce du dossier validée"
            hint="La case correspondante de la checklist sera cochée (trace « Pièce reçue » dans le fil)"
          >
            <select name="checklistCle" defaultValue="" className={selectCls}>
              <option value="">Aucune pièce précise</option>
              {checklist.map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.libelle}
                  {c.fait ? " (déjà reçue)" : ""}
                </option>
              ))}
            </select>
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

      {nouveauOuvert && (
        <FeuilleNouveauDossier
          affaireId={affaireId}
          onCree={(d) => {
            setDossiersCrees((prev) =>
              prev.some((x) => x.cle === d.cle) ? prev : [...prev, d]
            );
            setValeur(`perso:${d.cle}`);
          }}
          onClose={() => setNouveauOuvert(false)}
        />
      )}
    </>
  );
}
