"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";
import { formatEuro } from "@/lib/utils";

type Chantier = { id: string; nom: string };
type Ligne = { designation: string; quantite: number; prixUnitaire: number };
type Commande = {
  chantierId: string;
  fournisseur: string;
  reference: string | null;
  dateCommande: Date;
  dateLivraisonPrevue: Date | null;
  statut: string;
  mode: string;
  note: string | null;
  lignes: { designation: string; quantite: unknown; prixUnitaire: unknown }[];
};

export function CommandeForm({
  commande,
  chantiers,
  defaultChantierId,
  defaultFournisseur,
  initialLignes,
  demandeId,
  action,
  submitLabel,
}: {
  commande?: Commande;
  chantiers: Chantier[];
  defaultChantierId?: string;
  defaultFournisseur?: string;
  initialLignes?: Ligne[];
  demandeId?: string;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [lignes, setLignes] = useState<Ligne[]>(
    commande?.lignes.map((l) => ({
      designation: l.designation,
      quantite: Number(l.quantite),
      prixUnitaire: Number(l.prixUnitaire),
    })) ??
      initialLignes ?? [
        { designation: "", quantite: 1, prixUnitaire: 0 },
      ]
  );

  function addLigne() {
    setLignes((p) => [...p, { designation: "", quantite: 1, prixUnitaire: 0 }]);
  }
  function removeLigne(i: number) {
    setLignes((p) => p.filter((_, idx) => idx !== i));
  }
  function updateLigne(i: number, field: keyof Ligne, value: string | number) {
    setLignes((p) =>
      p.map((l, idx) =>
        idx === i ? { ...l, [field]: field === "designation" ? value : Number(value) } : l
      )
    );
  }

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

  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {demandeId && (
        <input type="hidden" name="demandeId" value={demandeId} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Chantier" required>
          <Select
            name="chantierId"
            defaultValue={commande?.chantierId ?? defaultChantierId ?? ""}
            required
          >
            <option value="" disabled>Choisir…</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fournisseur" required>
          <Input
            name="fournisseur"
            defaultValue={commande?.fournisseur ?? defaultFournisseur ?? ""}
            placeholder="Point P, Leroy Merlin..."
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Référence" hint="N° BL, devis...">
          <Input name="reference" defaultValue={commande?.reference ?? ""} />
        </Field>
        <Field label="Date commande" required>
          <Input
            name="dateCommande"
            type="date"
            defaultValue={
              commande?.dateCommande
                ? new Date(commande.dateCommande).toISOString().slice(0, 10)
                : today
            }
            required
          />
        </Field>
        <Field label="Livraison prévue">
          <Input
            name="dateLivraisonPrevue"
            type="date"
            defaultValue={
              commande?.dateLivraisonPrevue
                ? new Date(commande.dateLivraisonPrevue).toISOString().slice(0, 10)
                : ""
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Statut" required>
          <Select name="statut" defaultValue={commande?.statut ?? "COMMANDEE"} required>
            <option value="COMMANDEE">Commandée</option>
            <option value="EN_LIVRAISON">En livraison</option>
            <option value="LIVREE">Livrée</option>
            <option value="ANNULEE">Annulée</option>
          </Select>
        </Field>
        <Field label="Mode de paiement" required>
          <Select name="mode" defaultValue={commande?.mode ?? "VIREMENT"} required>
            <option value="VIREMENT">Virement</option>
            <option value="ESPECES">Espèces</option>
          </Select>
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-slate-900 dark:text-slate-100">Lignes de commande</h3>
          <Button type="button" variant="outline" size="sm" onClick={addLigne}>
            <Plus size={14} /> Ajouter une ligne
          </Button>
        </div>

        <div className="space-y-2">
          {lignes.map((l, i) => {
            const total = l.quantite * l.prixUnitaire;
            return (
              <div
                key={i}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-md"
              >
                <div className="sm:col-span-5">
                  <Input
                    name={`lignes[${i}].designation`}
                    value={l.designation}
                    onChange={(e) => updateLigne(i, "designation", e.target.value)}
                    placeholder="Désignation"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    name={`lignes[${i}].quantite`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={l.quantite}
                    onChange={(e) => updateLigne(i, "quantite", e.target.value)}
                    placeholder="Qté"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    name={`lignes[${i}].prixUnitaire`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.prixUnitaire}
                    onChange={(e) => updateLigne(i, "prixUnitaire", e.target.value)}
                    placeholder="P.U."
                    required
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-end pr-2 font-medium">
                  {formatEuro(total)}
                </div>
                <div className="sm:col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeLigne(i)}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-2"
                    disabled={lignes.length === 1}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end pr-4">
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-500">Total commande</div>
            <div className="text-2xl font-bold">{formatEuro(total)}</div>
          </div>
        </div>
      </div>

      <Field label="Note">
        <Textarea name="note" rows={2} defaultValue={commande?.note ?? ""} />
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
