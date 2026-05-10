"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  Trash2,
  Calendar,
  Users,
  Loader2,
  FolderPlus,
  Folder,
  Pencil,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  toggleComplete,
  setPriorite,
  ajouterSousTache,
  deleteTache,
  createSection,
  renameSection,
  deleteSection,
} from "./actions";

export type TacheTodo = {
  id: string;
  nom: string;
  description: string | null;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  parentId: string | null;
  sectionId: string | null;
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
  labels: { label: { id: string; nom: string; couleur: string } }[];
  enfants?: TacheTodo[];
};

export type SectionItem = {
  id: string;
  chantierId: string;
  nom: string;
  ordre: number;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

function fmtDateRange(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  if (s.toDateString() === e.toDateString()) return dateFmt.format(s);
  return `${dateFmt.format(s)} → ${dateFmt.format(e)}`;
}

function isLate(t: TacheTodo): boolean {
  if (t.statut === "TERMINEE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(t.dateFin) < today;
}

const PRIO_FLAG_COLORS: Record<number, string> = {
  1: "fill-red-500 stroke-red-600 text-red-600",
  2: "fill-orange-500 stroke-orange-600 text-orange-600",
  3: "fill-blue-500 stroke-blue-600 text-blue-600",
  4: "fill-transparent stroke-slate-400 text-slate-400",
};

const PRIO_LABELS: Record<number, string> = {
  1: "P1 — Urgent",
  2: "P2 — Haute",
  3: "P3 — Moyenne",
  4: "P4 — Aucune",
};

/**
 * Construit l'arbre tâches racines + enfants à partir d'une liste plate.
 * (Si les enfants sont déjà fournis dans la prop `enfants`, on les
 *  utilise tels quels.)
 */
function buildTree(taches: TacheTodo[]): TacheTodo[] {
  const byId = new Map<string, TacheTodo>();
  taches.forEach((t) => byId.set(t.id, { ...t, enfants: [] }));
  const roots: TacheTodo[] = [];
  byId.forEach((t) => {
    if (t.parentId && byId.has(t.parentId)) {
      byId.get(t.parentId)!.enfants!.push(t);
    } else {
      roots.push(t);
    }
  });
  return roots;
}

/**
 * Liste de tâches style Todoist :
 *  - Checkbox ronde à gauche pour toggle complete
 *  - Drapeau de priorité (cyclable au clic)
 *  - Nom barré quand terminée
 *  - Méta sur une ligne : chantier, équipe, dates, labels
 *  - Sous-tâches indentées (collapse/expand)
 *  - "+ Sous-tâche" à la fin de chaque tâche racine
 */
/**
 * Regroupe les tâches racines par section.
 * Ordre :
 *   1. "Sans section" en tête (si non vide)
 *   2. Puis chaque section dans l'ordre `ordre`
 *   3. Sections vides incluses (pour permettre de drag dedans)
 */
function groupBySections(
  rootTaches: TacheTodo[],
  sections: SectionItem[]
): { section: SectionItem | null; taches: TacheTodo[] }[] {
  const sansSection = rootTaches.filter((t) => !t.sectionId);
  const groups: { section: SectionItem | null; taches: TacheTodo[] }[] = [];
  if (sansSection.length > 0 || sections.length === 0) {
    groups.push({ section: null, taches: sansSection });
  }
  for (const s of sections) {
    groups.push({
      section: s,
      taches: rootTaches.filter((t) => t.sectionId === s.id),
    });
  }
  return groups;
}

export function TacheListTodoist({
  taches,
  sections = [],
  defaultChantierId,
  onEdit,
}: {
  taches: TacheTodo[];
  sections?: SectionItem[];
  /** Pour le bouton "Ajouter une section" — chantier cible. */
  defaultChantierId?: string;
  onEdit?: (id: string) => void;
}) {
  const tree = buildTree(taches);
  // Filtre des sections au chantier en cours, si on en a un
  const visibleSections = defaultChantierId
    ? sections.filter((s) => s.chantierId === defaultChantierId)
    : sections;
  const groups = groupBySections(tree, visibleSections);

  if (
    tree.length === 0 &&
    visibleSections.length === 0 &&
    !defaultChantierId
  ) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-500">
        Aucune tâche pour ces filtres.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <SectionGroup
          key={g.section?.id ?? `__none__-${i}`}
          section={g.section}
          taches={g.taches}
          onEdit={onEdit}
        />
      ))}
      {defaultChantierId && (
        <AddSectionInline chantierId={defaultChantierId} />
      )}
    </div>
  );
}

function SectionGroup({
  section,
  taches,
  onEdit,
}: {
  section: SectionItem | null;
  taches: TacheTodo[];
  onEdit?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = taches.length;
  const done = taches.filter((t) => t.statut === "TERMINEE").length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <SectionHeader
        section={section}
        total={total}
        done={done}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {taches.length === 0 ? (
            <li className="px-3 py-3 text-xs text-slate-400 italic text-center">
              Aucune tâche dans cette section.
            </li>
          ) : (
            taches.map((t) => (
              <TacheRow key={t.id} tache={t} depth={0} onEdit={onEdit} />
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function SectionHeader({
  section,
  total,
  done,
  expanded,
  onToggle,
}: {
  section: SectionItem | null;
  total: number;
  done: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section?.nom ?? "");

  function handleRename() {
    if (!section || !name.trim() || name.trim() === section.nom) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameSection(section.id, name);
        toast.success("Section renommée");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleDelete() {
    if (!section) return;
    if (
      !confirm(
        total > 0
          ? `Supprimer la section "${section.nom}" ? Les ${total} tâche(s) seront sorties de la section (pas supprimées).`
          : `Supprimer la section "${section.nom}" ?`
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteSection(section.id);
        toast.success("Section supprimée");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={onToggle}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
        aria-label={expanded ? "Replier" : "Déplier"}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {section ? (
        <>
          <Folder size={14} className="text-slate-500 shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setName(section.nom);
                  setEditing(false);
                }
              }}
              disabled={pending}
              className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-300 focus:border-brand-500"
            />
          ) : (
            <h3
              className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200 truncate cursor-text"
              onClick={() => {
                setName(section.nom);
                setEditing(true);
              }}
              title="Cliquer pour renommer"
            >
              {section.nom}
            </h3>
          )}
        </>
      ) : (
        <h3 className="flex-1 text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">
          Sans section
        </h3>
      )}
      <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        {done}/{total}
      </span>
      {section && !editing && (
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => {
              setName(section.nom);
              setEditing(true);
            }}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
            title="Renommer"
            aria-label="Renommer"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-red-600"
            title="Supprimer la section"
            aria-label="Supprimer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function AddSectionInline({ chantierId }: { chantierId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await createSection({ chantierId, nom: name });
        toast.success("Section créée");
        setName("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1.5"
      >
        <FolderPlus size={14} /> Ajouter une section
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
      <FolderPlus size={14} className="text-slate-400" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
        placeholder="Nom de la section (ex : Gros œuvre, Finitions...)"
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-sm border-b border-slate-200 focus:border-brand-500 pb-0.5"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="text-xs text-brand-700 disabled:opacity-50 hover:underline"
      >
        {pending ? "..." : "Créer"}
      </button>
      <button
        type="button"
        onClick={() => {
          setName("");
          setOpen(false);
        }}
        className="text-xs text-slate-500 hover:underline"
      >
        Annuler
      </button>
    </div>
  );
}

function TacheRow({
  tache: t,
  depth,
  onEdit,
}: {
  tache: TacheTodo;
  depth: number;
  onEdit?: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const [showAddSub, setShowAddSub] = useState(false);

  const done = t.statut === "TERMINEE" || t.avancement === 100;
  const late = isLate(t);
  const hasChildren = (t.enfants?.length ?? 0) > 0;

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleComplete(t.id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleCyclePriority() {
    const next = (((t.priorite + 2) % 4) + 1) as 1 | 2 | 3 | 4;
    startTransition(async () => {
      try {
        await setPriorite(t.id, next);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        hasChildren
          ? "Supprimer cette tâche et ses sous-tâches ?"
          : "Supprimer cette tâche ?"
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteTache(t.id);
        toast.success("Tâche supprimée");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <>
      <li
        className={`flex items-start gap-2 px-3 py-2 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
          done ? "opacity-60" : ""
        }`}
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {/* Caret expand sous-tâches */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 mt-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label={expanded ? "Replier" : "Déplier"}
          >
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ) : (
          <span className="shrink-0 w-[14px]" />
        )}

        {/* Checkbox de complétion */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          aria-label={done ? "Marquer non terminée" : "Marquer terminée"}
          title={done ? "Marquer non terminée" : "Marquer terminée"}
          className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
            done
              ? "bg-green-500 border-green-600 text-white"
              : t.priorite === 1
                ? "border-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                : t.priorite === 2
                  ? "border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                  : t.priorite === 3
                    ? "border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    : "border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {done ? (
            <Check size={12} strokeWidth={3} />
          ) : pending ? (
            <Loader2 size={10} className="animate-spin text-slate-400" />
          ) : null}
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm leading-snug ${
              done
                ? "line-through text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {t.nom}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            <span className="text-brand-700 dark:text-brand-400 font-medium">
              {t.chantier.nom}
            </span>
            {t.equipe && (
              <span className="inline-flex items-center gap-1">
                <Users size={10} />
                {t.equipe.nom}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 ${
                late ? "text-red-600 dark:text-red-400 font-medium" : ""
              }`}
            >
              <Calendar size={10} />
              {fmtDateRange(t.dateDebut, t.dateFin)}
              {late && " · en retard"}
            </span>
            {t.avancement > 0 && t.avancement < 100 && (
              <span className="text-blue-600 dark:text-blue-400">
                {t.avancement}%
              </span>
            )}
            {t.labels.map((tl) => (
              <span
                key={tl.label.id}
                className="inline-flex items-center gap-1 px-1.5 rounded font-medium"
                style={{
                  backgroundColor: tl.label.couleur + "33",
                  color: tl.label.couleur,
                }}
              >
                {tl.label.nom}
              </span>
            ))}
          </div>
        </div>

        {/* Actions à droite */}
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <button
            type="button"
            onClick={handleCyclePriority}
            disabled={pending}
            aria-label="Changer la priorité"
            title={PRIO_LABELS[t.priorite] + " (clic pour cycler)"}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Flag size={14} className={PRIO_FLAG_COLORS[t.priorite]} />
          </button>
          {depth === 0 && (
            <button
              type="button"
              onClick={() => setShowAddSub((v) => !v)}
              aria-label="Ajouter une sous-tâche"
              title="Ajouter une sous-tâche"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-brand-600"
            >
              <Plus size={14} />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(t.id)}
              aria-label="Modifier"
              title="Modifier en détail"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
            >
              <span className="text-[11px] font-medium px-1">Détail</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            aria-label="Supprimer"
            title="Supprimer"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </li>

      {/* Mini-form sous-tâche */}
      {showAddSub && depth === 0 && (
        <li
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40"
          style={{ paddingLeft: `${36 + depth * 24}px` }}
        >
          <SousTacheInline
            parentId={t.id}
            onDone={() => setShowAddSub(false)}
          />
        </li>
      )}

      {/* Sous-tâches récursives */}
      {hasChildren &&
        expanded &&
        t.enfants!.map((c) => (
          <TacheRow
            key={c.id}
            tache={c}
            depth={depth + 1}
            onEdit={onEdit}
          />
        ))}
    </>
  );
}

function SousTacheInline({
  parentId,
  onDone,
}: {
  parentId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [nom, setNom] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!nom.trim()) {
      onDone();
      return;
    }
    startTransition(async () => {
      try {
        await ajouterSousTache(parentId, nom);
        toast.success("Sous-tâche ajoutée");
        setNom("");
        router.refresh();
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Plus size={14} className="text-slate-400 shrink-0" />
      <input
        type="text"
        autoFocus
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setNom("");
            onDone();
          }
        }}
        placeholder="Nom de la sous-tâche…"
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-sm border-b border-slate-200 dark:border-slate-700 focus:border-brand-500 pb-0.5"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !nom.trim()}
        className="text-xs text-brand-700 dark:text-brand-400 disabled:opacity-50 hover:underline"
      >
        {pending ? "..." : "Ajouter"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-xs text-slate-500 hover:underline"
      >
        Annuler
      </button>
    </div>
  );
}
