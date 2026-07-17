"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
  Download,
  Upload,
  Tag,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { PhotoVignette } from "@/components/PhotoVignette";
import { uploadPlan, deletePlan, modifierTypePlan } from "./actions";

type Plan = {
  id: string;
  uploaderId: string;
  uploaderName: string;
  nom: string;
  description: string | null;
  /** Type de plan personnalisable (saisie libre, suggéré par chantier). */
  type: string | null;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date | string;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function fileSizeStr(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function iconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return VideoIcon;
  return FileText;
}

/** Même normalisation que le serveur : l'override optimiste doit être
 *  rattrapé à l'identique par les props rafraîchies. */
function normaliserType(brut: string | null): string | null {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t.slice(0, 40);
}

export function PlansSection({
  chantierId,
  plans,
  currentUserId,
  isAdmin,
  canUpload,
  typesExistants,
}: {
  chantierId: string;
  plans: Plan[];
  currentUserId: string;
  isAdmin: boolean;
  canUpload: boolean;
  /** Types déjà employés sur ce chantier (suggestions, ordre alphabétique). */
  typesExistants: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  // Reclassement optimiste (même motif que le kanban des affaires) : le
  // plan rejoint son nouveau groupe pendant que le serveur confirme,
  // rollback et toast en cas d'échec.
  const [typeOverride, setTypeOverride] = useState<
    Record<string, string | null>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [planAClasser, setPlanAClasser] = useState<Plan | null>(null);

  function typeOf(p: Plan): string | null {
    return Object.prototype.hasOwnProperty.call(typeOverride, p.id)
      ? typeOverride[p.id]
      : p.type;
  }

  // Retire un override quand les props rafraîchies l'ont rattrapé.
  // Ajustement d'état PENDANT le rendu (motif documenté par React, qui
  // relance le rendu avant de peindre) plutôt qu'un useEffect : pas de
  // rendu intermédiaire périmé ni d'avertissement set-state-in-effect.
  // setState conditionnel : aucune boucle possible.
  const overridesRattrapes = Object.entries(typeOverride).filter(([id, t]) => {
    if (savingId === id) return false;
    const p = plans.find((x) => x.id === id);
    return !p || p.type === t;
  });
  if (overridesRattrapes.length > 0) {
    const next = { ...typeOverride };
    for (const [id] of overridesRattrapes) delete next[id];
    setTypeOverride(next);
  }

  function reclasser(planId: string, typeBrut: string | null) {
    setPlanAClasser(null);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const type = normaliserType(typeBrut);
    if (typeOf(plan) === type) return;

    setTypeOverride((prev) => ({ ...prev, [planId]: type }));
    setSavingId(planId);
    startTransition(async () => {
      try {
        await modifierTypePlan(planId, type ?? "");
        toast.success(type ? `Type « ${type} » appliqué` : "Type retiré");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
        setTypeOverride((prev) => {
          const next = { ...prev };
          delete next[planId];
          return next;
        });
      } finally {
        setSavingId(null);
      }
    });
  }

  // Suggestions : types du serveur + types créés à l'instant (override).
  const typesConnus = [
    ...new Set([
      ...typesExistants,
      ...plans.map((p) => typeOf(p)).filter((t): t is string => t !== null),
    ]),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  // Groupes : un par type employé (ordre alphabétique), les plans sans
  // type en dernier. Tant qu'aucun plan n'est typé, la liste reste plate.
  const groupes: { type: string | null; items: Plan[] }[] = [
    ...typesConnus.map((t) => ({
      type: t as string | null,
      items: plans.filter((p) => typeOf(p) === t),
    })),
    { type: null, items: plans.filter((p) => typeOf(p) === null) },
  ].filter((g) => g.items.length > 0);
  const aDesTypes = groupes.some((g) => g.type !== null);

  return (
    <div>
      {canUpload && !showForm && (
        <div className="flex justify-end mb-3">
          <Button
            type="button"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus size={14} /> Ajouter un plan
          </Button>
        </div>
      )}

      {showForm && (
        <div className="mb-4 p-3 sm:p-4 rounded-lg bg-brand-50/40 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-900">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Nouveau plan
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>
          <UploadForm
            chantierId={chantierId}
            typesConnus={typesConnus}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {plans.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic py-3 text-center">
          Aucun plan pour ce chantier. Ajoute des PDF, images ou vidéos
          pour aider les équipes (plans d&apos;exécution, vidéos de
          montage, fiches techniques…).
        </p>
      ) : (
        <div className="space-y-4">
          {groupes.map((g) => (
            <div key={g.type ?? "__sans_type__"}>
              {aDesTypes && (
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  <Tag size={12} />
                  <span>{g.type ?? "Sans type"}</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 font-mono tabular-nums normal-case text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {g.items.length}
                  </span>
                </div>
              )}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {g.items.map((p) => {
                  const Icon = iconFor(p.mimeType);
                  const canDelete = isAdmin || p.uploaderId === currentUserId;
                  const isVideo = p.mimeType.startsWith("video/");
                  const isImage = p.mimeType.startsWith("image/");
                  const type = typeOf(p);
                  return (
                    <li
                      key={p.id}
                      className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 ${
                        savingId === p.id ? "animate-pulse" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-10 h-10 rounded bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 dark:text-brand-400">
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {p.nom}
                          </div>
                          {p.description && (
                            <div className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {p.description}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{fileSizeStr(p.fileSize)}</span>
                            <span>· {dateFmt.format(new Date(p.createdAt))}</span>
                            <span>· {p.uploaderName}</span>
                          </div>
                        </div>
                        {canDelete && (
                          <DeleteButton id={p.id} />
                        )}
                      </div>

                      {/* Aperçu si image */}
                      {isImage && (
                        <a
                          href={p.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block mt-2 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 max-h-48"
                        >
                          <PhotoVignette
                            url={p.fileUrl}
                            alt={p.nom}
                            className="w-full h-auto max-h-48 object-cover"
                          />
                        </a>
                      )}

                      {/* Aperçu vidéo inline */}
                      {isVideo && (
                        <video
                          src={p.fileUrl}
                          controls
                          preload="metadata"
                          className="w-full mt-2 max-h-64 rounded-md bg-black"
                        />
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-x-4">
                        <a
                          href={p.fileUrl}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 mt-1 text-xs text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          <Download size={12} /> Télécharger / Ouvrir
                        </a>
                        {canUpload && (
                          <button
                            type="button"
                            onClick={() => setPlanAClasser(p)}
                            disabled={savingId === p.id}
                            className="inline-flex min-h-11 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <Tag size={12} />
                            {type ?? "Ajouter un type"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Feuille bas d'écran : choisir ou créer le type d'un plan. */}
      {planAClasser && (
        <FeuilleTypePlan
          plan={planAClasser}
          typeCourant={typeOf(planAClasser)}
          typesConnus={typesConnus}
          onChoisir={(t) => reclasser(planAClasser.id, t)}
          onClose={() => setPlanAClasser(null)}
        />
      )}
    </div>
  );
}

/** Feuille bas d'écran (l'app vit sur téléphone) : types existants du
 *  chantier, retrait du type, ou saisie libre d'un nouveau type. */
function FeuilleTypePlan({
  plan,
  typeCourant,
  typesConnus,
  onChoisir,
  onClose,
}: {
  plan: Plan;
  typeCourant: string | null;
  typesConnus: string[];
  onChoisir: (type: string | null) => void;
  onClose: () => void;
}) {
  const [nouveau, setNouveau] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 bg-black/50 backdrop-blur-sm"
        aria-label="Fermer"
      />
      <div
        className="max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Type du plan
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {plan.nom}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-2">
          {typesConnus.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChoisir(t)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${
                typeCourant === t
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Tag size={16} className="shrink-0" />
              <span className="flex-1 truncate">{t}</span>
              {typeCourant === t && <Check size={16} className="shrink-0" />}
            </button>
          ))}

          {typeCourant !== null && (
            <button
              type="button"
              onClick={() => onChoisir(null)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X size={16} className="shrink-0" />
              Retirer le type
            </button>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = nouveau.trim();
              if (t) onChoisir(t);
            }}
            className="mt-2 flex items-center gap-2 border-t border-slate-100 px-1 pt-3 dark:border-slate-800"
          >
            <Input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              maxLength={40}
              placeholder="Nouveau type…"
              aria-label="Nouveau type"
              autoComplete="off"
            />
            <Button type="submit" size="sm" disabled={!nouveau.trim()}>
              Appliquer
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm("Supprimer ce plan ?")) return;
        startTransition(async () => {
          try {
            await deletePlan(id);
            toast.success("Plan supprimé");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erreur");
          }
        });
      }}
      disabled={pending}
      className="text-slate-400 hover:text-red-600 p-1.5"
      title="Supprimer"
    >
      <Trash2 size={14} />
    </button>
  );
}

function UploadForm({
  chantierId,
  typesConnus,
  onDone,
}: {
  chantierId: string;
  typesConnus: string[];
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
      setError("Sélectionne un fichier");
      return;
    }
    formData.set("file", file);
    startTransition(async () => {
      try {
        await uploadPlan(formData);
        toast.success("Plan ajouté");
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
      <input type="hidden" name="chantierId" value={chantierId} />

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      <Field label="Nom" required hint="Ex : Plan d'exécution RDC, Vidéo montage VMC">
        <Input
          name="nom"
          required
          placeholder="Plan d'exécution RDC"
        />
      </Field>

      <Field
        label="Type (optionnel)"
        hint="Regroupe les plans par famille. Choisis un type existant ou saisis-en un nouveau."
      >
        <Input
          name="type"
          list={`types-plan-${chantierId}`}
          maxLength={40}
          placeholder="Ex : Exécution, Ferraillage, Réseaux…"
          autoComplete="off"
        />
        <datalist id={`types-plan-${chantierId}`}>
          {typesConnus.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>

      <Field label="Description (optionnel)">
        <Textarea
          name="description"
          rows={2}
          placeholder="Notes pour l'équipe…"
        />
      </Field>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Upload size={14} />
          {file ? "Changer le fichier" : "Choisir un fichier"}
        </button>
        {file && (
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            <strong>{file.name}</strong> · {fileSizeStr(file.size)}
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          PDF, images (PNG/JPG/WEBP), DWG/DXF ou vidéos (max 50 Mo).
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={pending || !file}>
          {pending ? "Envoi…" : "Ajouter le plan"}
        </Button>
      </div>
    </form>
  );
}
