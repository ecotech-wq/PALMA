"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";

type Chantier = { id: string; nom: string };
type Location = {
  designation: string;
  type: string;
  fournisseurNom: string;
  chantierId: string | null;
  dateDebut: Date;
  dateFinPrevue: Date;
  coutJour: unknown;
  coutTotal: unknown;
  note: string | null;
};

export function LocationForm({
  location,
  chantiers,
  action,
  submitLabel,
}: {
  location?: Location;
  chantiers: Chantier[];
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
      } catch (e) {
        if (e instanceof Error && e.message?.includes("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Type" required>
          <Select name="type" defaultValue={location?.type ?? "LOCATION"} required>
            <option value="LOCATION">Location (payante)</option>
            <option value="PRET">Prêt (gratuit)</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Désignation" required>
            <Input
              name="designation"
              defaultValue={location?.designation ?? ""}
              placeholder="Échafaudage 6m, Bétonnière 350L..."
              required
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fournisseur / Prêteur" required>
          <Input
            name="fournisseurNom"
            defaultValue={location?.fournisseurNom ?? ""}
            placeholder="Loxam, Kiloutou, Jean Dupont..."
            required
          />
        </Field>
        <Field label="Chantier">
          <Select name="chantierId" defaultValue={location?.chantierId ?? ""}>
            <option value="">— Aucun —</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date de début" required>
          <Input
            name="dateDebut"
            type="date"
            defaultValue={
              location?.dateDebut ? new Date(location.dateDebut).toISOString().slice(0, 10) : today
            }
            required
          />
        </Field>
        <Field label="Date de fin prévue" required>
          <Input
            name="dateFinPrevue"
            type="date"
            defaultValue={
              location?.dateFinPrevue
                ? new Date(location.dateFinPrevue).toISOString().slice(0, 10)
                : today
            }
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Coût par jour (€)" hint="Pour info / forfait jour">
          <Input
            name="coutJour"
            type="number"
            min="0"
            step="0.01"
            defaultValue={location?.coutJour ? String(location.coutJour) : "0"}
          />
        </Field>
        <Field label="Coût total estimé (€)" hint="Sera ajusté à la clôture">
          <Input
            name="coutTotal"
            type="number"
            min="0"
            step="0.01"
            defaultValue={location?.coutTotal ? String(location.coutTotal) : "0"}
          />
        </Field>
      </div>

      <Field label="Note">
        <Textarea name="note" rows={2} defaultValue={location?.note ?? ""} />
      </Field>

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
