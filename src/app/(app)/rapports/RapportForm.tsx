"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  X,
  Camera,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wind,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";

type Rapport = {
  id: string;
  chantierId: string;
  date: Date;
  meteo:
    | "SOLEIL"
    | "NUAGEUX"
    | "PLUIE"
    | "ORAGE"
    | "NEIGE"
    | "GEL"
    | "VENT_FORT"
    | null;
  texte: string;
  photos: string[];
  nbOuvriers: number | null;
};

const meteoOptions: {
  value: Rapport["meteo"];
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "SOLEIL", label: "Soleil", icon: Sun },
  { value: "NUAGEUX", label: "Nuageux", icon: Cloud },
  { value: "PLUIE", label: "Pluie", icon: CloudRain },
  { value: "ORAGE", label: "Orage", icon: CloudLightning },
  { value: "NEIGE", label: "Neige", icon: Snowflake },
  { value: "GEL", label: "Gel", icon: Snowflake },
  { value: "VENT_FORT", label: "Vent fort", icon: Wind },
];

/**
 * Formulaire de création / édition d'un rapport de chantier journalier.
 * - Crée : `chantierId` requis (passe en hidden), pas de `rapport`.
 * - Edite : `rapport` requis ; le chantierId reste figé.
 */
export function RapportForm({
  chantierId,
  rapport,
  action,
  onCancel,
}: {
  chantierId: string;
  rapport?: Rapport;
  action: (formData: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(rapport?.photos ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const dateValue = rapport
    ? new Date(rapport.date).toISOString().slice(0, 10)
    : today;

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
    // Reset photos field (FormData getAll might have an empty entry)
    formData.delete("photos");
    for (const f of newFiles) formData.append("photos", f);
    formData.delete("removePhotos");
    for (const url of removed) formData.append("removePhotos", url);

    startTransition(async () => {
      try {
        await action(formData);
        toast.success(
          rapport ? "Rapport mis à jour" : "Rapport publié"
        );
        if (rapport) {
          // Reset transient state
          setNewFiles([]);
          setRemoved([]);
          if (onCancel) onCancel();
        }
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
      <input type="hidden" name="chantierId" value={chantierId} />

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date" required>
          <Input
            type="date"
            name="date"
            defaultValue={dateValue}
            max={today}
            required
          />
        </Field>
        <Field label="Météo">
          <Select name="meteo" defaultValue={rapport?.meteo ?? ""}>
            <option value="">— Non précisée —</option>
            {meteoOptions.map((m) => (
              <option key={m.value} value={m.value ?? ""}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ouvriers présents">
          <Input
            type="number"
            name="nbOuvriers"
            min="0"
            defaultValue={rapport?.nbOuvriers ?? ""}
            placeholder="Ex: 5"
          />
        </Field>
      </div>

      <Field label="Compte-rendu" required hint="Ce qui a été fait, blocages, événements">
        <Textarea
          name="texte"
          rows={5}
          required
          defaultValue={rapport?.texte ?? ""}
          placeholder="Aujourd'hui : coulage de la dalle terminé, livraison ferraille reportée à demain..."
        />
      </Field>

      {/* Photos */}
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Photos
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-3">
            {photos.map((url) => (
              <div
                key={url}
                className="relative aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 group"
              >
                <Image
                  src={url}
                  alt="Photo"
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExisting(url)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-90 hover:opacity-100"
                  title="Retirer cette photo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {newFiles.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="relative aspect-square rounded-md overflow-hidden border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-950/20 group"
              >
                {/* Pas d'aperçu URL.createObjectURL ici pour éviter les
                    fuites mémoire — on affiche juste le nom + une icône */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] p-1 text-center text-slate-600 dark:text-slate-400">
                  <Camera size={20} />
                  <span className="truncate w-full mt-1">{f.name}</span>
                  <span className="text-brand-600 dark:text-brand-400 text-[9px]">
                    nouvelle
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeNew(idx)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-90 hover:opacity-100"
                  title="Retirer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          Plusieurs photos possibles. Sur mobile, le bouton ouvre direct la
          caméra arrière.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Annuler
          </Button>
        )}
        {rapport && (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("Supprimer ce rapport définitivement ?")) {
                // On laisse le bouton en dehors du form pour gérer la
                // suppression depuis la liste.
              }
            }}
            className="hidden"
          >
            <Trash2 size={14} /> Supprimer
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          <Save size={14} />
          {pending ? "..." : rapport ? "Enregistrer" : "Publier"}
        </Button>
      </div>
    </form>
  );
}
