"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";

type Chantier = { id: string; nom: string };
type Demande = {
  id: string;
  chantierId: string;
  description: string;
  quantite: number;
  unite: string | null;
  urgence: string;
  fournisseur: string | null;
};

export function DemandeForm({
  chantiers,
  demande,
  defaultChantierId,
  action,
  onCancel,
}: {
  chantiers: Chantier[];
  demande?: Demande;
  defaultChantierId?: string;
  action: (formData: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        toast.success(
          demande ? "Demande mise à jour" : "Demande envoyée à l'admin"
        );
        if (demande && onCancel) onCancel();
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
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Field label="Chantier" required>
        <Select
          name="chantierId"
          defaultValue={demande?.chantierId ?? defaultChantierId ?? ""}
          required
          disabled={!!demande}
        >
          <option value="" disabled>
            Choisis un chantier
          </option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Que demandes-tu ?"
        required
        hint="Sois précis (marque, modèle, dimensions...)"
      >
        <Textarea
          name="description"
          rows={3}
          required
          defaultValue={demande?.description ?? ""}
          placeholder="20 sacs de ciment Lafarge 35 kg, 5 m de tube cuivre Ø 22..."
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Quantité" required>
          <Input
            name="quantite"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={demande?.quantite ?? 1}
          />
        </Field>
        <Field label="Unité (optionnel)">
          <Input
            name="unite"
            defaultValue={demande?.unite ?? ""}
            placeholder="sacs, m², kg, ml..."
          />
        </Field>
        <Field label="Urgence" required>
          <Select name="urgence" defaultValue={demande?.urgence ?? "ATTENTION"}>
            <option value="INFO">Info — peut attendre</option>
            <option value="ATTENTION">Attention — cette semaine</option>
            <option value="URGENT">Urgent — bloque le chantier</option>
          </Select>
        </Field>
      </div>

      <Field label="Fournisseur suggéré (optionnel)">
        <Input
          name="fournisseur"
          defaultValue={demande?.fournisseur ?? ""}
          placeholder="Point P, Leroy Merlin, Lafarge..."
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          <Save size={14} />
          {pending ? "..." : demande ? "Enregistrer" : "Envoyer la demande"}
        </Button>
      </div>
    </form>
  );
}
