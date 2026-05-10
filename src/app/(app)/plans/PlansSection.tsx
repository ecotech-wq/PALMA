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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { uploadPlan, deletePlan } from "./actions";

type Plan = {
  id: string;
  uploaderId: string;
  uploaderName: string;
  nom: string;
  description: string | null;
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

export function PlansSection({
  chantierId,
  plans,
  currentUserId,
  isAdmin,
  canUpload,
}: {
  chantierId: string;
  plans: Plan[];
  currentUserId: string;
  isAdmin: boolean;
  canUpload: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

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
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {plans.map((p) => {
            const Icon = iconFor(p.mimeType);
            const canDelete = isAdmin || p.uploaderId === currentUserId;
            const isVideo = p.mimeType.startsWith("video/");
            const isImage = p.mimeType.startsWith("image/");
            return (
              <li
                key={p.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.fileUrl}
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

                <a
                  href={p.fileUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-brand-700 dark:text-brand-400 hover:underline"
                >
                  <Download size={12} /> Télécharger / Ouvrir
                </a>
              </li>
            );
          })}
        </ul>
      )}
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
