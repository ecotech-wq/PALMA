"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { creerPhase } from "../actions";

// ─── Ajout d'une phase d'honoraires (admin / conducteur membre) ─────────────

export function PhaseForm({
  chantierId,
  canSeePrices,
}: {
  chantierId: string;
  canSeePrices: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await creerPhase(formData);
        // Le rechargement serveur (revalidatePath) vide la table : on ne
        // réinitialise que les champs texte via la clé du formulaire.
        (document.getElementById("phase-form") as HTMLFormElement)?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <form id="phase-form" action={onSubmit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <input type="hidden" name="chantierId" value={chantierId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Code">
          <Input name="code" placeholder="APS" maxLength={12} required />
        </Field>
        <Field label="Libellé">
          <Input name="libelle" placeholder="Avant-projet sommaire" required />
        </Field>
        {canSeePrices && (
          <Field label="Vendu (€ HT)">
            <Input
              type="number"
              name="montantVendu"
              step="0.01"
              min={0}
              inputMode="decimal"
              placeholder="4500"
            />
          </Field>
        )}
        <Field label="Budget (h)">
          <Input
            type="number"
            name="budgetHeures"
            step="0.5"
            min={0}
            inputMode="decimal"
            placeholder="40"
          />
        </Field>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Plus size={14} />
        {pending ? "Ajout..." : "Ajouter la phase"}
      </Button>
    </form>
  );
}
