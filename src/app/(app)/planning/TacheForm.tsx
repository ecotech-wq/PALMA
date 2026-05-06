"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";

type Chantier = { id: string; nom: string };
type Equipe = { id: string; nom: string; chantierId: string | null };
type TacheCandidate = { id: string; nom: string; chantierId: string };

export function CreateTacheForm({
  chantiers,
  equipes,
  taches,
  defaultChantierId,
  action,
}: {
  chantiers: Chantier[];
  equipes: Equipe[];
  taches: TacheCandidate[];
  defaultChantierId?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedChantier, setSelectedChantier] = useState(defaultChantierId ?? "");
  const [deps, setDeps] = useState<string[]>([]);

  const equipesFiltered = equipes.filter(
    (e) => !e.chantierId || e.chantierId === selectedChantier
  );
  const tachesCandidates = taches.filter(
    (t) => !selectedChantier || t.chantierId === selectedChantier
  );

  function addDep(id: string) {
    if (!id) return;
    setDeps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeDep(id: string) {
    setDeps((prev) => prev.filter((d) => d !== id));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    deps.forEach((d) => formData.append("dependances", d));
    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
        setDeps([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Plus size={14} /> Nouvelle tâche
      </Button>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 w-full">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Nouvelle tâche</h3>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <div className="sm:col-span-4">
          <Field label="Nom" required>
            <Input name="nom" placeholder="Coffrage, Maçonnerie..." required />
          </Field>
        </div>
        <div className="sm:col-span-4">
          <Field label="Chantier" required>
            <Select
              name="chantierId"
              value={selectedChantier}
              onChange={(e) => {
                setSelectedChantier(e.target.value);
                setDeps([]); // reset deps si on change de chantier
              }}
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
        </div>
        <div className="sm:col-span-4">
          <Field label="Équipe">
            <Select name="equipeId" defaultValue="">
              <option value="">— Aucune —</option>
              {equipesFiltered.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Du" required>
            <Input name="dateDebut" type="date" defaultValue={today} required />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Au" required>
            <Input name="dateFin" type="date" defaultValue={inAWeek} required />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Statut">
            <Select name="statut" defaultValue="A_FAIRE">
              <option value="A_FAIRE">À faire</option>
              <option value="EN_COURS">En cours</option>
              <option value="TERMINEE">Terminée</option>
              <option value="BLOQUEE">Bloquée</option>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Avancement %">
            <Input name="avancement" type="number" min="0" max="100" defaultValue="0" />
          </Field>
        </div>
        <div className="sm:col-span-12">
          <Field label="Dépend de" hint="Ces tâches doivent être terminées avant celle-ci">
            <DepsPicker
              value={deps}
              candidates={tachesCandidates}
              onAdd={addDep}
              onRemove={removeDep}
            />
          </Field>
        </div>
        <div className="sm:col-span-12">
          <Field label="Description">
            <Textarea name="description" rows={2} />
          </Field>
        </div>
        <div className="sm:col-span-12 flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Création..." : "Créer la tâche"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DepsPicker({
  value,
  candidates,
  onAdd,
  onRemove,
}: {
  value: string[];
  candidates: TacheCandidate[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const remaining = candidates.filter((c) => !value.includes(c.id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const t = candById.get(id);
            if (!t) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-50 text-brand-700 text-xs"
              >
                {t.nom}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="hover:text-red-600"
                  aria-label="Retirer"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {remaining.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
            e.target.value = "";
          }}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Ajouter une dépendance…</option>
          {remaining.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      ) : value.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
          Aucune autre tâche disponible sur ce chantier.
        </p>
      ) : null}
    </div>
  );
}
