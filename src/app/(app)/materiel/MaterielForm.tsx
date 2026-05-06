"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";

type Materiel = {
  id?: string;
  nomCommun: string;
  marque: string | null;
  modele: string | null;
  numeroSerie: string | null;
  statut: string;
  possesseur: string;
  prixAchat: unknown;
  dateAchat: Date | null;
  notes: string | null;
  photo: string | null;
};

export function MaterielForm({
  materiel,
  action,
  submitLabel,
}: {
  materiel?: Materiel;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(materiel?.photo ?? null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-1">
          <Field label="Photo">
            <div className="space-y-2">
              <div className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg relative overflow-hidden border border-slate-200 dark:border-slate-800">
                {photoPreview ? (
                  <Image
                    src={photoPreview}
                    alt="Aperçu"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                    unoptimized={photoChanged}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                    Pas de photo
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
                className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
              />
              {photoPreview && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Retirer la photo
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="md:col-span-2 space-y-4">
          <Field label="Nom" required hint="Ex: Visseuse, Meuleuse, Compresseur">
            <Input name="nomCommun" defaultValue={materiel?.nomCommun ?? ""} required />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Marque">
              <Input name="marque" defaultValue={materiel?.marque ?? ""} placeholder="Makita..." />
            </Field>
            <Field label="Modèle">
              <Input name="modele" defaultValue={materiel?.modele ?? ""} placeholder="DDF485..." />
            </Field>
          </div>

          <Field label="Numéro de série">
            <Input name="numeroSerie" defaultValue={materiel?.numeroSerie ?? ""} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Statut" required>
              <Select name="statut" defaultValue={materiel?.statut ?? "DISPO"} required>
                <option value="DISPO">Disponible</option>
                <option value="SORTI">Sorti</option>
                <option value="EN_LOCATION">En location</option>
                <option value="HS">Hors service</option>
                <option value="PERDU">Perdu</option>
              </Select>
            </Field>
            <Field label="Possesseur" required>
              <Select name="possesseur" defaultValue={materiel?.possesseur ?? "ENTREPRISE"} required>
                <option value="ENTREPRISE">Entreprise</option>
                <option value="LOCATION">Loué</option>
                <option value="PRET">Prêté</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Prix d'achat (€)">
              <Input
                name="prixAchat"
                type="number"
                min="0"
                step="0.01"
                defaultValue={materiel?.prixAchat ? String(materiel.prixAchat) : ""}
              />
            </Field>
            <Field label="Date d'achat">
              <Input
                name="dateAchat"
                type="date"
                defaultValue={
                  materiel?.dateAchat ? new Date(materiel.dateAchat).toISOString().slice(0, 10) : ""
                }
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea name="notes" rows={3} defaultValue={materiel?.notes ?? ""} />
          </Field>
        </div>
      </div>

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
