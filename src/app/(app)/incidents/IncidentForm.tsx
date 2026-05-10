"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Camera, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { categorieLabel, graviteLabel } from "./IncidentBadges";

type Chantier = { id: string; nom: string };
type Incident = {
  id: string;
  chantierId: string | null;
  titre: string;
  description: string;
  categorie: string;
  gravite: string;
  photos: string[];
};

export function IncidentForm({
  chantiers,
  incident,
  defaultChantierId,
  action,
  onCancel,
}: {
  chantiers: Chantier[];
  incident?: Incident;
  defaultChantierId?: string;
  action: (formData: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(incident?.photos ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setNewFiles((prev) => [...prev, ...files]);
    if (e.target) e.target.value = "";
  }
  function removeExisting(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
    setRemoved((prev) => [...prev, url]);
  }
  function removeNew(idx: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    formData.delete("photos");
    for (const f of newFiles) formData.append("photos", f);
    formData.delete("removePhotos");
    for (const url of removed) formData.append("removePhotos", url);

    startTransition(async () => {
      try {
        await action(formData);
        toast.success(incident ? "Incident mis à jour" : "Incident signalé");
        if (incident && onCancel) onCancel();
        router.refresh();
      } catch (e) {
        if (e instanceof Error && e.message?.includes("NEXT_REDIRECT")) throw e;
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <Field label="Titre" required hint="Court et explicite">
        <Input
          name="titre"
          required
          maxLength={200}
          defaultValue={incident?.titre ?? ""}
          placeholder="Ex: Pas de ciment livré ce matin"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Catégorie" required>
          <Select name="categorie" defaultValue={incident?.categorie ?? "AUTRE"} required>
            {Object.entries(categorieLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gravité" required>
          <Select name="gravite" defaultValue={incident?.gravite ?? "ATTENTION"} required>
            {Object.entries(graviteLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chantier (optionnel)">
          <Select
            name="chantierId"
            defaultValue={incident?.chantierId ?? defaultChantierId ?? ""}
          >
            <option value="">— Aucun —</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" required hint="Que s'est-il passé ? Quelle est l'attente ?">
        <Textarea
          name="description"
          rows={4}
          required
          defaultValue={incident?.description ?? ""}
          placeholder="Camion en panne, chauffeur dit qu'il sera là vers 14h. Coulage reporté..."
        />
      </Field>

      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Photos (preuves, dégâts, etc.)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onFilesPicked}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Camera size={14} />
          Ajouter une photo
        </button>

        {(photos.length > 0 || newFiles.length > 0) && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {photos.map((url) => (
              <div
                key={url}
                className="relative aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
              >
                <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                <button
                  type="button"
                  onClick={() => removeExisting(url)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {newFiles.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="relative aspect-square rounded-md overflow-hidden border-2 border-dashed border-brand-300 bg-brand-50/40"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] p-1 text-center text-slate-600">
                  <Camera size={20} />
                  <span className="truncate w-full mt-1">{f.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeNew(idx)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          <Save size={14} />
          {pending ? "..." : incident ? "Enregistrer" : "Signaler"}
        </Button>
      </div>
    </form>
  );
}
