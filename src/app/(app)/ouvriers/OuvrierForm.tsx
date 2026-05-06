"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";

type Equipe = { id: string; nom: string };
type Ouvrier = {
  nom: string;
  prenom: string | null;
  telephone: string | null;
  photo: string | null;
  typeContrat: string;
  tarifBase: unknown;
  modePaie: string;
  actif: boolean;
  equipeId: string | null;
  notes: string | null;
};

const tarifLabels: Record<string, string> = {
  FIXE: "Salaire mensuel (€)",
  JOUR: "Tarif journalier (€)",
  SEMAINE: "Tarif hebdomadaire (€)",
  MOIS: "Salaire mensuel (€)",
  FORFAIT: "Montant forfait (€)",
};

const tarifHints: Record<string, string> = {
  FIXE: "Sera ramené à la journée sur base 23 jours/mois",
  JOUR: "Payé à chaque jour travaillé",
  SEMAINE: "Payé à la semaine travaillée",
  MOIS: "Salaire mensuel garanti",
  FORFAIT: "Total fixe pour la mission/chantier",
};

export function OuvrierForm({
  ouvrier,
  equipes,
  action,
  submitLabel,
}: {
  ouvrier?: Ouvrier;
  equipes: Equipe[];
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(ouvrier?.photo ?? null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [typeContrat, setTypeContrat] = useState(ouvrier?.typeContrat ?? "JOUR");

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoChanged(true);
    setRemovePhoto(false);
  }
  function clearPhoto() {
    setPhotoPreview(null);
    setPhotoChanged(true);
    setRemovePhoto(true);
    const input = document.getElementById("photo") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function onSubmit(formData: FormData) {
    setError(null);
    if (removePhoto) formData.set("removePhoto", "1");
    startTransition(async () => {
      try {
        await action(formData);
      } catch (e) {
        if (e instanceof Error && e.message?.includes("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0">
          <div className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg relative overflow-hidden border border-slate-200 dark:border-slate-800">
            {photoPreview ? (
              <Image
                src={photoPreview}
                alt="Aperçu"
                fill
                sizes="100px"
                className="object-cover"
                unoptimized={photoChanged}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <User size={32} />
              </div>
            )}
          </div>
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoChange}
            className="block w-full text-xs text-slate-700 dark:text-slate-300 mt-2 file:mr-2 file:rounded file:border-0 file:bg-slate-100 dark:bg-slate-800 file:px-2 file:py-1 file:text-xs"
          />
          {photoPreview && (
            <button
              type="button"
              onClick={clearPhoto}
              className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 mt-1"
            >
              <Trash2 size={10} /> Retirer
            </button>
          )}
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom" required>
            <Input name="nom" defaultValue={ouvrier?.nom ?? ""} required />
          </Field>
          <Field label="Prénom">
            <Input name="prenom" defaultValue={ouvrier?.prenom ?? ""} />
          </Field>
          <Field label="Téléphone">
            <Input name="telephone" type="tel" defaultValue={ouvrier?.telephone ?? ""} />
          </Field>
          <Field label="Équipe">
            <Select name="equipeId" defaultValue={ouvrier?.equipeId ?? ""}>
              <option value="">— Pas d&apos;équipe —</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Type de contrat" required>
          <Select
            name="typeContrat"
            value={typeContrat}
            onChange={(e) => setTypeContrat(e.target.value)}
            required
          >
            <option value="FIXE">Salarié fixe</option>
            <option value="MOIS">Au mois</option>
            <option value="SEMAINE">À la semaine</option>
            <option value="JOUR">À la journée</option>
            <option value="FORFAIT">Forfait</option>
          </Select>
        </Field>
        <Field label={tarifLabels[typeContrat] ?? "Tarif (€)"} required hint={tarifHints[typeContrat]}>
          <Input
            name="tarifBase"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={ouvrier?.tarifBase ? String(ouvrier.tarifBase) : ""}
          />
        </Field>
        <Field label="Mode de paie habituel" required hint="Quand l'ouvrier est payé en pratique">
          <Select name="modePaie" defaultValue={ouvrier?.modePaie ?? "MOIS"} required>
            <option value="JOUR">À la journée</option>
            <option value="SEMAINE">À la semaine</option>
            <option value="MOIS">Au mois</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={ouvrier?.notes ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="actif"
          defaultChecked={ouvrier?.actif ?? true}
          className="h-4 w-4"
        />
        <span>Ouvrier actif (présent dans le pointage)</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={() => router.back()} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
