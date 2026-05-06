"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil, X, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";
import { Badge, type BadgeColor } from "@/components/ui/Badge";

type Tache = {
  id: string;
  nom: string;
  description: string | null;
  dateDebut: Date;
  dateFin: Date;
  avancement: number;
  statut: string;
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
  dependances: { id: string; nom: string }[];
};

type Equipe = { id: string; nom: string; chantierId: string | null };

const statutLabel: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  BLOQUEE: "Bloquée",
};

const statutColor: Record<string, BadgeColor> = {
  A_FAIRE: "slate",
  EN_COURS: "blue",
  TERMINEE: "green",
  BLOQUEE: "red",
};

function formatShort(d: Date): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function isoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function TacheList({
  taches,
  equipes,
  onSetAvancement,
  onDelete,
  onUpdate,
}: {
  taches: Tache[];
  equipes: Equipe[];
  onSetAvancement: (id: string, value: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (taches.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-500 dark:text-slate-500">
        Aucune tâche.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {taches.map((t) =>
          editing === t.id ? (
            <li key={t.id} className="p-3 sm:p-4 bg-brand-50/40">
              <EditRow
                tache={t}
                equipes={equipes}
                allTaches={taches}
                onUpdate={onUpdate}
                onClose={() => setEditing(null)}
              />
            </li>
          ) : (
            <RowDisplay
              key={t.id}
              tache={t}
              onEdit={() => setEditing(t.id)}
              onSetAvancement={onSetAvancement}
              onDelete={onDelete}
            />
          )
        )}
      </ul>
    </div>
  );
}

function RowDisplay({
  tache: t,
  onEdit,
  onSetAvancement,
  onDelete,
}: {
  tache: Tache;
  onEdit: () => void;
  onSetAvancement: (id: string, value: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.nom}</span>
          <Badge color={statutColor[t.statut] ?? "slate"}>{statutLabel[t.statut]}</Badge>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
          <span className="truncate">
            {t.chantier.nom}
            {t.equipe && ` · ${t.equipe.nom}`} · {formatShort(t.dateDebut)} →{" "}
            {formatShort(t.dateFin)}
          </span>
        </div>
        {t.dependances.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {t.dependances.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500 text-[10px]"
              >
                ↳ {d.nom}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-stretch sm:self-center">
        <div className="flex flex-col flex-1 sm:flex-none">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            defaultValue={t.avancement}
            disabled={pending}
            onChange={(e) => {
              const v = Number(e.target.value);
              startTransition(async () => {
                await onSetAvancement(t.id, v);
              });
            }}
            className="w-full sm:w-32 md:w-40"
          />
          <span className="text-[10px] text-slate-500 dark:text-slate-500 self-end">{t.avancement}%</span>
        </div>

        <button
          onClick={onEdit}
          className="text-slate-500 dark:text-slate-500 hover:text-brand-600 p-2"
          title="Modifier"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Supprimer la tâche "${t.nom}" ?`)) {
              startTransition(async () => {
                await onDelete(t.id);
              });
            }
          }}
          className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-2"
          title="Supprimer"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

function EditRow({
  tache,
  equipes,
  allTaches,
  onUpdate,
  onClose,
}: {
  tache: Tache;
  equipes: Equipe[];
  allTaches: Tache[];
  onUpdate: (id: string, formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deps, setDeps] = useState<string[]>(tache.dependances.map((d) => d.id));

  const equipesFiltered = equipes.filter(
    (e) => !e.chantierId || e.chantierId === tache.chantier.id
  );
  const candidates = allTaches.filter(
    (t) => t.id !== tache.id && t.chantier.id === tache.chantier.id
  );
  const remaining = candidates.filter((c) => !deps.includes(c.id));
  const candById = new Map(candidates.map((c) => [c.id, c]));

  function onSubmit(formData: FormData) {
    setError(null);
    deps.forEach((d) => formData.append("dependances", d));
    startTransition(async () => {
      try {
        await onUpdate(tache.id, formData);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Modifier « {tache.nom} »</h4>
        <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-500">
          <X size={16} />
        </button>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <input type="hidden" name="chantierId" value={tache.chantier.id} />

        <div className="sm:col-span-6">
          <Field label="Nom" required>
            <Input name="nom" defaultValue={tache.nom} required />
          </Field>
        </div>
        <div className="sm:col-span-6">
          <Field label="Équipe">
            <Select name="equipeId" defaultValue={tache.equipe?.id ?? ""}>
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
            <Input
              name="dateDebut"
              type="date"
              defaultValue={isoDate(tache.dateDebut)}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Au" required>
            <Input
              name="dateFin"
              type="date"
              defaultValue={isoDate(tache.dateFin)}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Statut">
            <Select name="statut" defaultValue={tache.statut}>
              <option value="A_FAIRE">À faire</option>
              <option value="EN_COURS">En cours</option>
              <option value="TERMINEE">Terminée</option>
              <option value="BLOQUEE">Bloquée</option>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Avancement %">
            <Input
              name="avancement"
              type="number"
              min="0"
              max="100"
              defaultValue={tache.avancement}
            />
          </Field>
        </div>

        <div className="sm:col-span-12">
          <Field label="Dépend de">
            <div className="space-y-2">
              {deps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {deps.map((id) => {
                    const c = candById.get(id);
                    if (!c) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-50 text-brand-700 text-xs"
                      >
                        {c.nom}
                        <button
                          type="button"
                          onClick={() => setDeps((p) => p.filter((d) => d !== id))}
                          className="hover:text-red-600"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {remaining.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setDeps((p) => [...p, e.target.value]);
                      e.target.value = "";
                    }
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
              )}
            </div>
          </Field>
        </div>

        <div className="sm:col-span-12">
          <Field label="Description">
            <Textarea name="description" rows={2} defaultValue={tache.description ?? ""} />
          </Field>
        </div>

        <div className="sm:col-span-12 flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            <Save size={14} />
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
