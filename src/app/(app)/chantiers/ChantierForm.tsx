"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";

type Chef = { id: string; name: string; email: string };
type Chantier = {
  nom: string;
  adresse: string | null;
  description: string | null;
  dateDebut: Date | null;
  dateFin: Date | null;
  statut: string;
  budgetEspeces: unknown;
  budgetVirement: unknown;
  chefId: string | null;
};

export function ChantierForm({
  chantier,
  chefs,
  action,
  submitLabel,
}: {
  chantier?: Chantier;
  chefs: Chef[];
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

  return (
    <form action={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <Field label="Nom du chantier" required>
        <Input name="nom" defaultValue={chantier?.nom ?? ""} required />
      </Field>

      <Field label="Adresse">
        <Input name="adresse" defaultValue={chantier?.adresse ?? ""} placeholder="12 rue ..." />
      </Field>

      <Field label="Description">
        <Textarea name="description" rows={2} defaultValue={chantier?.description ?? ""} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date de début">
          <Input
            name="dateDebut"
            type="date"
            defaultValue={
              chantier?.dateDebut ? new Date(chantier.dateDebut).toISOString().slice(0, 10) : ""
            }
          />
        </Field>
        <Field label="Date de fin prévue">
          <Input
            name="dateFin"
            type="date"
            defaultValue={
              chantier?.dateFin ? new Date(chantier.dateFin).toISOString().slice(0, 10) : ""
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Statut" required>
          <Select name="statut" defaultValue={chantier?.statut ?? "PLANIFIE"} required>
            <option value="PLANIFIE">Planifié</option>
            <option value="EN_COURS">En cours</option>
            <option value="PAUSE">En pause</option>
            <option value="TERMINE">Terminé</option>
            <option value="ANNULE">Annulé</option>
          </Select>
        </Field>
        <Field label="Chef de chantier">
          <Select name="chefId" defaultValue={chantier?.chefId ?? ""}>
            <option value="">— Aucun —</option>
            {chefs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Budget espèces (€)" hint="Cash prévu">
          <Input
            name="budgetEspeces"
            type="number"
            min="0"
            step="0.01"
            defaultValue={chantier?.budgetEspeces ? String(chantier.budgetEspeces) : "0"}
          />
        </Field>
        <Field label="Budget virement (€)" hint="Virements prévus">
          <Input
            name="budgetVirement"
            type="number"
            min="0"
            step="0.01"
            defaultValue={chantier?.budgetVirement ? String(chantier.budgetVirement) : "0"}
          />
        </Field>
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
