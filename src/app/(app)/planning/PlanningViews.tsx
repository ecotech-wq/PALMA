"use client";

import { useMemo, useState } from "react";
import { GanttChartV2 } from "./GanttChartV2";
import { KanbanBoard } from "./KanbanBoard";
import { TacheListTodoist, type SectionItem } from "./TacheListTodoist";
import { TacheEditModal, type TacheForEdit } from "./TacheEditModal";

type Vue = "gantt" | "liste" | "kanban";

type FullTache = TacheForEdit & {
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
};

type Chantier = { id: string; nom: string };
type Equipe = { id: string; nom: string; chantierId: string | null };
type LabelRef = { id: string; nom: string; couleur: string };
type Event = { id: string; type: "COMMANDE" | "LOCATION"; label: string; date: Date };

/**
 * Wrapper client qui partage l'état d'édition (modale) entre les trois
 * vues Gantt / Kanban / Liste. Un clic sur n'importe quelle tâche (barre
 * Gantt, card Kanban, ou bouton Détail Liste) ouvre la même modale.
 */
export function PlanningViews({
  view,
  taches,
  events,
  sections,
  chantiers,
  equipes,
  allLabels,
  defaultChantierId,
  canEdit,
}: {
  view: Vue;
  taches: FullTache[];
  events: Event[];
  sections: SectionItem[];
  chantiers: Chantier[];
  equipes: Equipe[];
  allLabels: LabelRef[];
  defaultChantierId?: string;
  canEdit: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => taches.find((t) => t.id === editingId) ?? null,
    [editingId, taches]
  );

  const tacheCandidates = useMemo(
    () => taches.map((t) => ({ id: t.id, nom: t.nom, chantierId: t.chantierId })),
    [taches]
  );

  return (
    <>
      {view === "gantt" && (
        <>
          <GanttChartV2
            taches={taches.map((t) => ({
              id: t.id,
              nom: t.nom,
              dateDebut: t.dateDebut,
              dateFin: t.dateFin,
              avancement: t.avancement,
              statut: t.statut,
              priorite: t.priorite,
              parentId: t.parentId,
              equipe: t.equipe,
              chantier: t.chantier,
              dependances: t.dependances,
            }))}
            events={events}
            canEdit={canEdit}
            onClickTask={canEdit ? (id) => setEditingId(id) : undefined}
          />
        </>
      )}

      {view === "kanban" && (
        <KanbanBoard
          canEdit={canEdit}
          onClickTask={canEdit ? (id) => setEditingId(id) : undefined}
          taches={taches.map((t) => ({
            id: t.id,
            nom: t.nom,
            dateDebut: t.dateDebut,
            dateFin: t.dateFin,
            avancement: t.avancement,
            statut: t.statut,
            priorite: t.priorite,
            parentId: t.parentId,
            equipe: t.equipe,
            chantier: t.chantier,
            labels: t.labels,
          }))}
        />
      )}

      {view === "liste" && (
        <TacheListTodoist
          sections={sections}
          defaultChantierId={defaultChantierId}
          onEdit={canEdit ? (id) => setEditingId(id) : undefined}
          taches={taches.map((t) => ({
            id: t.id,
            nom: t.nom,
            description: t.description,
            dateDebut: t.dateDebut,
            dateFin: t.dateFin,
            avancement: t.avancement,
            statut: t.statut,
            priorite: t.priorite,
            parentId: t.parentId,
            sectionId: t.sectionId,
            equipe: t.equipe,
            chantier: t.chantier,
            labels: t.labels,
          }))}
        />
      )}

      {editing && (
        <TacheEditModal
          tache={editing}
          chantiers={chantiers}
          equipes={equipes}
          sections={sections.map((s) => ({
            id: s.id,
            nom: s.nom,
            chantierId: s.chantierId,
          }))}
          taches={tacheCandidates}
          allLabels={allLabels}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}
