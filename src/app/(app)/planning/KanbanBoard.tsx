"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Flag,
  Users,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { setStatut, deleteTache } from "./actions";

type StatutTache = "A_FAIRE" | "EN_COURS" | "TERMINEE" | "BLOQUEE";

export type TacheKanban = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: StatutTache | string;
  priorite: number;
  parentId: string | null;
  equipe: { nom: string } | null;
  chantier: { nom: string };
  labels: { label: { id: string; nom: string; couleur: string } }[];
};

const COLUMNS: {
  key: StatutTache;
  label: string;
  Icon: typeof Clock;
  bg: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    key: "A_FAIRE",
    label: "À faire",
    Icon: Clock,
    bg: "bg-slate-50 dark:bg-slate-900/40",
    badgeBg: "bg-slate-200 dark:bg-slate-800",
    badgeText: "text-slate-700 dark:text-slate-300",
  },
  {
    key: "EN_COURS",
    label: "En cours",
    Icon: AlertCircle,
    bg: "bg-blue-50 dark:bg-blue-950/20",
    badgeBg: "bg-blue-200 dark:bg-blue-900/60",
    badgeText: "text-blue-800 dark:text-blue-300",
  },
  {
    key: "BLOQUEE",
    label: "Bloquée",
    Icon: Ban,
    bg: "bg-red-50 dark:bg-red-950/20",
    badgeBg: "bg-red-200 dark:bg-red-900/60",
    badgeText: "text-red-800 dark:text-red-300",
  },
  {
    key: "TERMINEE",
    label: "Terminée",
    Icon: CheckCircle2,
    bg: "bg-green-50 dark:bg-green-950/20",
    badgeBg: "bg-green-200 dark:bg-green-900/60",
    badgeText: "text-green-800 dark:text-green-300",
  },
];

const PRIO_FLAG: Record<number, string> = {
  1: "fill-red-500 stroke-red-600 text-red-600",
  2: "fill-orange-500 stroke-orange-600 text-orange-600",
  3: "fill-blue-500 stroke-blue-600 text-blue-600",
  4: "fill-transparent stroke-slate-400 text-slate-400",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

function isLate(t: TacheKanban) {
  if (t.statut === "TERMINEE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(t.dateFin) < today;
}

/**
 * Vue Kanban : 4 colonnes (À faire / En cours / Bloquée / Terminée).
 * Drag-and-drop natif HTML5 entre colonnes : modifie le statut.
 */
export function KanbanBoard({
  taches,
  canEdit,
}: {
  taches: TacheKanban[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<StatutTache | null>(null);
  // Override visuel optimiste pour cacher la carte dans la colonne d'origine
  const [statutOverride, setStatutOverride] = useState<
    Record<string, StatutTache>
  >({});

  function statutOf(t: TacheKanban): StatutTache {
    return (statutOverride[t.id] ?? t.statut) as StatutTache;
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/tache-id", id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setHoverCol(null);
  }
  function handleDragOver(e: React.DragEvent, col: StatutTache) {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverCol !== col) setHoverCol(col);
  }
  function handleDragLeave() {
    setHoverCol(null);
  }
  function handleDrop(e: React.DragEvent, col: StatutTache) {
    e.preventDefault();
    setHoverCol(null);
    const id =
      e.dataTransfer.getData("text/tache-id") || draggingId || "";
    if (!id) return;
    const t = taches.find((x) => x.id === id);
    if (!t) return;
    if (statutOf(t) === col) return;

    setStatutOverride((prev) => ({ ...prev, [id]: col }));
    setDraggingId(null);

    startTransition(async () => {
      try {
        await setStatut(id, col);
        toast.success("Statut modifié");
        router.refresh();
        // Le router.refresh va recharger les props, on nettoie l'override
        // pour ne pas garder une valeur potentiellement obsolète
        setStatutOverride((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
        // Annule l'override
        setStatutOverride((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });
  }

  const columns = COLUMNS.map((c) => ({
    ...c,
    items: taches.filter((t) => statutOf(t) === c.key),
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {columns.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => handleDragOver(e, col.key)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, col.key)}
          className={`rounded-xl border ${col.bg} ${
            hoverCol === col.key
              ? "border-brand-500 ring-2 ring-brand-300/50"
              : "border-slate-200 dark:border-slate-800"
          } flex flex-col min-h-[200px]`}
        >
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <col.Icon size={14} className="text-slate-500 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">
              {col.label}
            </h3>
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText} tabular-nums`}
            >
              {col.items.length}
            </span>
          </div>
          <div className="flex-1 p-2 space-y-2 min-h-[100px]">
            {col.items.length === 0 ? (
              <div className="text-[11px] text-slate-400 italic text-center py-6">
                {canEdit
                  ? "Glissez une tâche ici"
                  : "Aucune tâche"}
              </div>
            ) : (
              col.items.map((t) => (
                <KanbanCard
                  key={t.id}
                  tache={t}
                  draggable={canEdit}
                  isDragging={draggingId === t.id}
                  pending={pending && draggingId === t.id}
                  onDragStart={(e) => handleDragStart(e, t.id)}
                  onDragEnd={handleDragEnd}
                  canEdit={canEdit}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanCard({
  tache: t,
  draggable,
  isDragging,
  pending,
  onDragStart,
  onDragEnd,
  canEdit,
}: {
  tache: TacheKanban;
  draggable: boolean;
  isDragging: boolean;
  pending: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const late = isLate(t);

  function handleDelete() {
    if (!confirm("Supprimer cette tâche ?")) return;
    deleteTache(t.id)
      .then(() => {
        toast.success("Tâche supprimée");
        router.refresh();
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Erreur");
      });
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 shadow-sm hover:shadow-md transition group ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-30" : ""} ${pending ? "animate-pulse" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {t.priorite < 4 && (
          <Flag
            size={12}
            className={`shrink-0 mt-0.5 ${PRIO_FLAG[t.priorite]}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-medium leading-snug ${
              t.statut === "TERMINEE"
                ? "line-through text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {t.parentId && <span className="text-slate-400 mr-1">↳</span>}
            {t.nom}
          </p>
          <p className="text-[10px] text-brand-700 dark:text-brand-400 truncate mt-0.5">
            {t.chantier.nom}
          </p>
          <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {t.equipe && (
              <span className="inline-flex items-center gap-0.5">
                <Users size={9} />
                {t.equipe.nom}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 ${
                late ? "text-red-600 font-medium" : ""
              }`}
            >
              <Calendar size={9} />
              {dateFmt.format(new Date(t.dateFin))}
            </span>
            {t.avancement > 0 && t.avancement < 100 && (
              <span className="text-blue-600">{t.avancement}%</span>
            )}
            {t.labels.map((tl) => (
              <span
                key={tl.label.id}
                className="px-1 rounded font-medium"
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
        {pending && <Loader2 size={12} className="animate-spin text-slate-400" />}
      </div>
      {canEdit && (
        <div className="opacity-0 group-hover:opacity-100 transition flex justify-end mt-1">
          <button
            type="button"
            onClick={handleDelete}
            className="text-[10px] text-slate-500 hover:text-red-600"
            title="Supprimer"
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
