"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Flag, Loader2, Save, Trash2, User } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { updateTache, setTacheOuvriers, deleteTache } from "./actions";

type LabelRef = { id: string; nom: string; couleur: string };

export type TacheForEdit = {
  id: string;
  nom: string;
  description: string | null;
  /** null = tâche PERSO : sans chantier, rattachée à son propriétaire.
   *  La modale verrouille alors le rattachement et masque les champs de
   *  chantier (équipe, section, ouvriers, parent, dépendances). */
  chantierId: string | null;
  equipeId: string | null;
  sectionId: string | null;
  parentId: string | null;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  dependances: { id: string; nom: string }[];
  labels: { label: LabelRef }[];
  ouvriers?: { id: string; nom: string; prenom: string | null }[];
  recurrence?: string | null;
};

/** Presets simples pour le sélecteur de récurrence. */
const RECURRENCE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "Pas de récurrence" },
  { value: "FREQ=DAILY", label: "Tous les jours" },
  {
    value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    label: "Tous les jours ouvrés (lun → ven)",
  },
  { value: "FREQ=WEEKLY", label: "Toutes les semaines" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Toutes les 2 semaines" },
  { value: "FREQ=MONTHLY", label: "Tous les mois" },
];

type Chantier = { id: string; nom: string };
type Equipe = { id: string; nom: string; chantierId: string | null };
type SectionItem = { id: string; nom: string; chantierId: string };
type TacheCand = { id: string; nom: string; chantierId: string | null };
type OuvrierRef = {
  id: string;
  nom: string;
  prenom: string | null;
  equipeId: string | null;
};

const PRIO_BTN: Record<number, string> = {
  1: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300",
  2: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-300",
  3: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300",
  4: "border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
};
const PRIO_BTN_ACTIVE: Record<number, string> = {
  1: "bg-red-500 border-red-600 text-white",
  2: "bg-orange-500 border-orange-600 text-white",
  3: "bg-blue-500 border-blue-600 text-white",
  4: "bg-slate-500 border-slate-600 text-white",
};
const PRIO_LABEL: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

function isoDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Modale d'édition d'une tâche, ouverte au clic depuis Gantt / Kanban /
 * Liste. Couvre les champs principaux (nom, statut, priorité, dates,
 * avancement, équipe, section, labels, description). Les dépendances
 * et le parent sont éditables via le formulaire "détail" existant.
 */
export function TacheEditModal({
  tache,
  chantiers,
  equipes,
  sections,
  taches,
  allLabels,
  allOuvriers = [],
  onClose,
}: {
  tache: TacheForEdit;
  chantiers: Chantier[];
  equipes: Equipe[];
  sections: SectionItem[];
  taches: TacheCand[];
  allLabels: LabelRef[];
  allOuvriers?: OuvrierRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  // Tâche perso : rattachement verrouillé, champs de chantier masqués.
  const estPerso = tache.chantierId === null;
  const [chantierId, setChantierId] = useState(tache.chantierId ?? "");
  const [priorite, setPriorite] = useState<1 | 2 | 3 | 4>(
    (tache.priorite as 1 | 2 | 3 | 4) || 4
  );
  const [statut, setStatut] = useState(tache.statut);
  const [avancement, setAvancement] = useState(tache.avancement);
  const [labelIds, setLabelIds] = useState<string[]>(
    tache.labels.map((l) => l.label.id)
  );
  const [deps, setDeps] = useState<string[]>(
    tache.dependances.map((d) => d.id)
  );
  const [equipeId, setEquipeId] = useState<string>(tache.equipeId ?? "");
  const [ouvrierIds, setOuvrierIds] = useState<string[]>(
    (tache.ouvriers ?? []).map((o) => o.id)
  );
  // Récurrence : si la valeur ne matche aucun preset, on tombe sur "custom"
  const initialRecurrence = tache.recurrence ?? "";
  const isPreset = RECURRENCE_PRESETS.some(
    (p) => p.value === initialRecurrence
  );
  const [recurrence, setRecurrence] = useState<string>(
    isPreset ? initialRecurrence : "custom"
  );
  const [recurrenceCustom, setRecurrenceCustom] = useState<string>(
    !isPreset ? initialRecurrence : ""
  );

  // Fermer avec Echap
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const equipesFiltered = equipes.filter(
    (e) => !e.chantierId || e.chantierId === chantierId
  );
  const sectionsFiltered = sections.filter(
    (s) => s.chantierId === chantierId
  );
  // Parent et dépendances sont des outils de chantier : aucune candidate
  // pour une tâche perso (sinon le filtre null === null relierait les
  // tâches perso entre elles depuis la modale).
  const tachesCandidates = estPerso
    ? []
    : taches.filter((t) => t.chantierId === chantierId && t.id !== tache.id);
  const visibleLabels = allLabels;

  function toggleLabel(id: string) {
    setLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function toggleDep(id: string) {
    setDeps((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function toggleOuvrier(id: string) {
    setOuvrierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Filtre des ouvriers proposés : si une équipe est choisie, prio aux
  // ouvriers de cette équipe ; sinon tous les ouvriers actifs.
  const ouvriersFiltered = equipeId
    ? allOuvriers.filter((o) => o.equipeId === equipeId)
    : allOuvriers;
  const ouvriersHorsEquipe = equipeId
    ? allOuvriers.filter((o) => o.equipeId !== equipeId)
    : [];

  function handleDelete() {
    if (
      !confirm(
        `Supprimer la tâche « ${tache.nom} » ? Elle part à la corbeille (récupérable 30 jours).`
      )
    ) {
      return;
    }
    startDelete(async () => {
      try {
        await deleteTache(tache.id);
        toast.success("Tâche supprimée");
        router.refresh();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    // Surcharge des champs gérés en state
    fd.set("priorite", String(priorite));
    fd.set("statut", statut);
    fd.set("avancement", String(avancement));
    // Multi-valeurs (delete d'abord pour éviter les doublons)
    fd.delete("labelIds");
    labelIds.forEach((id) => fd.append("labelIds", id));
    fd.delete("dependances");
    deps.forEach((id) => fd.append("dependances", id));
    // Récurrence : préfère la valeur preset, ou la saisie custom (RRule brute)
    fd.set(
      "recurrence",
      recurrence === "custom" ? recurrenceCustom.trim() : recurrence
    );

    startTransition(async () => {
      try {
        await updateTache(tache.id, fd);
        // Persistance des affectations ouvriers (table m2m séparée)
        const currentIds = (tache.ouvriers ?? [])
          .map((o) => o.id)
          .sort()
          .join(",");
        const nextIds = [...ouvrierIds].sort().join(",");
        if (currentIds !== nextIds) {
          await setTacheOuvriers(tache.id, ouvrierIds);
        }
        toast.success("Tâche modifiée");
        router.refresh();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center sm:items-start justify-center p-3 sm:p-8 bg-black/50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] rounded-xl shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Modifier la tâche
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto"
        >
          <div className="p-4 space-y-3">
            {/* Nom */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                Nom
              </label>
              <Input
                type="text"
                name="nom"
                defaultValue={tache.nom}
                required
                autoFocus
              />
            </div>

            {/* Priorité + Statut */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                  Priorité
                </label>
                <div className="inline-flex gap-1">
                  {([1, 2, 3, 4] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriorite(p)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition ${
                        priorite === p
                          ? PRIO_BTN_ACTIVE[p]
                          : PRIO_BTN[p]
                      }`}
                    >
                      <Flag size={11} />
                      {PRIO_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                  Statut
                </label>
                <Select
                  name="statut"
                  value={statut}
                  onChange={(e) => setStatut(e.target.value)}
                >
                  <option value="A_FAIRE">À faire</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="BLOQUEE">Bloquée</option>
                  <option value="TERMINEE">Terminée</option>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date de début">
                <Input
                  type="date"
                  name="dateDebut"
                  defaultValue={isoDate(tache.dateDebut)}
                  required
                />
              </Field>
              <Field label="Date de fin">
                <Input
                  type="date"
                  name="dateFin"
                  defaultValue={isoDate(tache.dateFin)}
                  required
                />
              </Field>
            </div>

            {/* Avancement */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between mb-1">
                <span>Avancement</span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold tabular-nums">
                  {avancement}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={avancement}
                onChange={(e) => setAvancement(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Chantier : sélecteur pour une tâche de chantier, mention
                « Perso » verrouillée pour une tâche perso (le serveur
                refuse de toute façon la bascule perso -> chantier). */}
            {estPerso ? (
              <Field label="Rattachement">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm text-slate-600 dark:text-slate-300">
                  <User size={14} className="shrink-0 text-slate-500" />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      Tâche perso (sans chantier)
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Visible de vous seul, non transférable à un chantier.
                    </span>
                  </span>
                </div>
              </Field>
            ) : (
              <Field label="Chantier">
                <Select
                  name="chantierId"
                  value={chantierId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setChantierId(next);
                    // Les dépendances sont un outil intra-chantier : en
                    // changeant de chantier, on écarte celles qui n'y
                    // appartiennent pas (le serveur les refuse désormais,
                    // mêmes gardes qu'ajouterDependance).
                    setDeps((prev) =>
                      prev.filter((depId) =>
                        taches.some(
                          (t) => t.id === depId && t.chantierId === next
                        )
                      )
                    );
                  }}
                  required
                >
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* Équipe + Section (outils de chantier : masqués en perso) */}
            {!estPerso && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Équipe (optionnel)">
                  <Select
                    name="equipeId"
                    value={equipeId}
                    onChange={(e) => setEquipeId(e.target.value)}
                  >
                    <option value="">—</option>
                    {equipesFiltered.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Section (optionnel)">
                  <Select name="sectionId" defaultValue={tache.sectionId ?? ""}>
                    <option value="">—</option>
                    {sectionsFiltered.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {/* Ouvriers affectés (m2m ; outil de chantier, masqué en perso) */}
            {!estPerso && allOuvriers.length > 0 && (
              <Field label="Ouvriers affectés (optionnel)">
                <div className="flex flex-wrap gap-1.5">
                  {ouvriersFiltered.length === 0 && ouvriersHorsEquipe.length === 0 ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400 italic">
                      Aucun ouvrier actif
                    </span>
                  ) : (
                    <>
                      {ouvriersFiltered.map((o) => {
                        const active = ouvrierIds.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => toggleOuvrier(o.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition ${
                              active
                                ? "bg-brand-600 border-brand-700 text-white"
                                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            {o.prenom ? `${o.prenom} ${o.nom}` : o.nom}
                          </button>
                        );
                      })}
                      {ouvriersHorsEquipe.length > 0 && (
                        <details className="basis-full mt-1">
                          <summary className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200">
                            Hors équipe ({ouvriersHorsEquipe.length})
                          </summary>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {ouvriersHorsEquipe.map((o) => {
                              const active = ouvrierIds.includes(o.id);
                              return (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => toggleOuvrier(o.id)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition ${
                                    active
                                      ? "bg-brand-600 border-brand-700 text-white"
                                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {o.prenom ? `${o.prenom} ${o.nom}` : o.nom}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
                {ouvrierIds.length > 0 && (
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {ouvrierIds.length} ouvrier
                    {ouvrierIds.length > 1 ? "s" : ""} affecté
                    {ouvrierIds.length > 1 ? "s" : ""}
                  </p>
                )}
              </Field>
            )}

            {/* Parent (sous-tâche de) */}
            {tachesCandidates.length > 0 && (
              <Field label="Sous-tâche de (optionnel)">
                <Select
                  name="parentId"
                  defaultValue={tache.parentId ?? ""}
                >
                  <option value="">— Aucune tâche parente —</option>
                  {tachesCandidates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* Récurrence */}
            <Field label="Récurrence (optionnel)">
              <Select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                {RECURRENCE_PRESETS.map((p) => (
                  <option key={p.value || "none"} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Personnalisée (RRule)</option>
              </Select>
              {recurrence === "custom" && (
                <input
                  type="text"
                  value={recurrenceCustom}
                  onChange={(e) => setRecurrenceCustom(e.target.value)}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z"
                  className="mt-2 w-full px-2 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              )}
              {recurrence && recurrence !== "custom" && (
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 italic">
                  À chaque fois que tu marqueras cette tâche terminée, une
                  nouvelle occurrence sera créée à la prochaine date prévue.
                </p>
              )}
            </Field>

            {/* Labels */}
            {visibleLabels.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                  Labels
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {visibleLabels.map((l) => {
                    const active = labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleLabel(l.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition ${
                          active ? "shadow-sm" : "opacity-60 hover:opacity-100"
                        }`}
                        style={
                          active
                            ? {
                                backgroundColor: l.couleur,
                                color: "#fff",
                                borderColor: l.couleur,
                              }
                            : {
                                color: l.couleur,
                                borderColor: l.couleur,
                                backgroundColor: l.couleur + "11",
                              }
                        }
                      >
                        {l.nom}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dépendances (collapsible) */}
            {tachesCandidates.length > 0 && (
              <details>
                <summary className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none">
                  Dépendances ({deps.length})
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md">
                  {tachesCandidates.map((t) => {
                    const checked = deps.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDep(t.id)}
                        />
                        <span className="truncate">{t.nom}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            )}

            {/* Description */}
            <Field label="Description (optionnel)">
              <Textarea
                name="description"
                rows={3}
                defaultValue={tache.description ?? ""}
                placeholder="Détails, notes, contraintes..."
              />
            </Field>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending || deleting}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
              title="Supprimer la tâche"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Supprimer
            </button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending || deleting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending || deleting}>
                {pending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Enregistrement…
                  </>
                ) : (
                  <>
                    <Save size={14} /> Enregistrer
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
