"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import {
  ajouterReserve,
  modifierReserve,
  retirerPhotoReserve,
} from "./actions";

type LotSuggestion = { value: string; label?: string };

type InitialValues = {
  reserveId: string;
  texte: string;
  zone: string | null;
  lot: string | null;
  dateLimite: Date | string | null;
  photos: string[];
};

function isoDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

const DEFAULT_LOT_CODES: LotSuggestion[] = [
  { value: "NIC", label: "Nettoyage" },
  { value: "ACC", label: "Accessoires / Quincaillerie" },
  { value: "SOL", label: "Sols" },
  { value: "FER", label: "Plomberie / Sanitaires" },
  { value: "MET", label: "Menuiseries Extérieures" },
  { value: "BOI", label: "Menuiseries Bois" },
  { value: "PEI", label: "Peinture" },
  { value: "CAR", label: "Carrelage / Faïence" },
  { value: "ELE", label: "Électricité" },
  { value: "VRD", label: "Voirie / Réseaux divers" },
  { value: "ETA", label: "Étanchéité" },
  { value: "SBT", label: "Béton / Maçonnerie" },
];

/**
 * Formulaire de création OU édition d'une réserve.
 *
 * Création : `initialValues` non fourni. Pose une nouvelle réserve
 * (avec planId/pos si donnés, sinon zone-only).
 *
 * Édition : `initialValues` fourni. Pré-remplit les champs, le bouton
 * devient "Enregistrer". Photos existantes affichées avec bouton
 * suppression individuelle.
 *
 * `lotSuggestions` enrichit la datalist du champ Lot avec les valeurs
 * personnalisées (équipes du chantier + lots déjà utilisés).
 */
export function ReserveForm({
  chantierId,
  planId,
  posX,
  posY,
  initialValues,
  lotSuggestions = [],
  onSuccess,
}: {
  chantierId: string;
  planId?: string;
  posX?: number;
  posY?: number;
  initialValues?: InitialValues;
  lotSuggestions?: LotSuggestion[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [previews, setPreviews] = useState<string[]>([]);
  // Photos existantes (en mode édition) — peut décroitre si on supprime
  const [existingPhotos, setExistingPhotos] = useState<string[]>(
    initialValues?.photos ?? []
  );

  const isEdit = !!initialValues;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        if (isEdit && initialValues) {
          await modifierReserve(chantierId, initialValues.reserveId, fd);
          toast.success("Réserve modifiée");
        } else {
          await ajouterReserve(chantierId, fd);
          toast.success("Réserve ajoutée");
        }
        form.reset();
        setPreviews([]);
        onSuccess?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  async function handleRemoveExistingPhoto(url: string) {
    if (!initialValues) return;
    if (!confirm("Retirer cette photo ?")) return;
    try {
      await retirerPhotoReserve(chantierId, initialValues.reserveId, url);
      setExistingPhotos((prev) => prev.filter((p) => p !== url));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  // Datalist combinée : codes par défaut + suggestions personnalisées
  // (on dédoublonne par valeur)
  const allSuggestions: LotSuggestion[] = (() => {
    const seen = new Set<string>();
    const out: LotSuggestion[] = [];
    for (const s of [...lotSuggestions, ...DEFAULT_LOT_CODES]) {
      const v = s.value.trim();
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        out.push(s);
      }
    }
    return out;
  })();

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
      {/* En création : passe planId/posX/posY en hidden */}
      {!isEdit && planId && (
        <>
          <input type="hidden" name="planId" value={planId} />
          {typeof posX === "number" && (
            <input type="hidden" name="posX" value={String(posX)} />
          )}
          {typeof posY === "number" && (
            <input type="hidden" name="posY" value={String(posY)} />
          )}
        </>
      )}

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          Description du défaut
        </label>
        <Textarea
          name="texte"
          rows={2}
          required
          defaultValue={initialValues?.texte ?? ""}
          placeholder="Ex : peinture écaillée, joint manquant..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
            Localisation
          </label>
          <Input
            name="zone"
            defaultValue={initialValues?.zone ?? ""}
            placeholder="Cuisine, Chambre 1..."
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
            Lot / entreprise
          </label>
          <Input
            name="lot"
            defaultValue={initialValues?.lot ?? ""}
            list="lot-suggestions"
            placeholder="Entreprise, équipe, code..."
          />
          <datalist id="lot-suggestions">
            {allSuggestions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label ?? s.value}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          Date limite (« Pour le ») — optionnel
        </label>
        <Input
          type="date"
          name="dateLimite"
          defaultValue={
            initialValues?.dateLimite
              ? isoDay(initialValues.dateLimite)
              : ""
          }
        />
      </div>

      {/* Photos existantes (édition) */}
      {isEdit && existingPhotos.length > 0 && (
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
            Photos existantes
          </label>
          <div className="flex flex-wrap gap-2">
            {existingPhotos.map((url) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Photo réserve"
                  className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-800"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveExistingPhoto(url)}
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  aria-label="Retirer cette photo"
                  title="Retirer"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          <Camera size={12} className="inline mr-1" />
          {isEdit ? "Ajouter des photos" : "Photos (plusieurs possibles)"}
        </label>
        <input
          type="file"
          name="photos"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
        />
        {previews.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Aperçu ${i + 1}`}
                className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-800"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {isEdit ? " Enregistrement..." : " Envoi..."}
            </>
          ) : isEdit ? (
            <>
              <Save size={14} /> Enregistrer
            </>
          ) : (
            <>
              <Plus size={14} /> Ajouter la réserve
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
