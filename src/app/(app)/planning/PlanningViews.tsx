"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { GanttChartV2 } from "./GanttChartV2";
import { KanbanBoard } from "./KanbanBoard";
import { TacheListTodoist, type SectionItem } from "./TacheListTodoist";
import { TacheEditModal, type TacheForEdit } from "./TacheEditModal";
import { CalendarMonth } from "./CalendarMonth";
import { PertChart } from "./PertChart";
import { quickCreateAt } from "./actions";

type Vue = "gantt" | "liste" | "kanban" | "calendrier" | "pert";

type FullTache = TacheForEdit & {
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
};

type Chantier = { id: string; nom: string };
type Equipe = { id: string; nom: string; chantierId: string | null };
type LabelRef = { id: string; nom: string; couleur: string };
type Event = {
  id: string;
  realId: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date;
};

/**
 * Wrapper client qui partage l'état d'édition (modale) entre les vues
 * Gantt / Kanban / Calendrier / PERT / Liste. Un clic sur n'importe quelle
 * tâche (barre Gantt, card Kanban, carte PERT, ou bouton Détail Liste)
 * ouvre la même modale.
 */
export function PlanningViews({
  view,
  taches,
  events,
  sections,
  chantiers,
  equipes,
  allLabels,
  allOuvriers = [],
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
  allOuvriers?: {
    id: string;
    nom: string;
    prenom: string | null;
    equipeId: string | null;
  }[];
  defaultChantierId?: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => taches.find((t) => t.id === editingId) ?? null,
    [editingId, taches]
  );

  const tacheCandidates = useMemo(
    () => taches.map((t) => ({ id: t.id, nom: t.nom, chantierId: t.chantierId })),
    [taches]
  );

  // Map nom de chantier -> id (les barres Gantt ne portent que le nom)
  const chantierByNom = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of chantiers) m.set(c.nom, c.id);
    return m;
  }, [chantiers]);

  async function handleEmptyCellClick(date: Date, chantierNom: string) {
    const chantierId = chantierByNom.get(chantierNom);
    if (!chantierId) {
      toast.error("Chantier introuvable");
      return;
    }
    try {
      const { id } = await quickCreateAt({ chantierId, date });
      router.refresh();
      // Ouvre directement la modale d'édition sur la nouvelle tâche.
      // Délai pour laisser router.refresh peupler `taches` (sinon
      // `editing` sera null car la liste ne contient pas encore le
      // nouvel id).
      setTimeout(() => setEditingId(id), 350);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  /** Cliquer-glisser sur des cases vides du calendrier : crée une tâche
   *  couvrant exactement la plage, puis ouvre la modale d'édition. */
  async function handleEmptyRangeClick(
    dateDebut: Date,
    dateFin: Date,
    chantierNom: string
  ) {
    const chantierId = chantierByNom.get(chantierNom);
    if (!chantierId) {
      toast.error("Chantier introuvable");
      return;
    }
    try {
      const { id } = await quickCreateAt({ chantierId, date: dateDebut, dateFin });
      router.refresh();
      // Même délai que handleEmptyCellClick : laisse router.refresh
      // peupler `taches` avant d'ouvrir la modale.
      setTimeout(() => setEditingId(id), 350);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

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
            onEmptyCellClick={canEdit ? handleEmptyCellClick : undefined}
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

      {view === "calendrier" && (
        <CalendarMonth
          canEdit={canEdit}
          onClickTask={canEdit ? (id) => setEditingId(id) : undefined}
          onEmptyCellClick={canEdit ? handleEmptyCellClick : undefined}
          onEmptyRangeClick={canEdit ? handleEmptyRangeClick : undefined}
          chantiers={chantiers}
          defaultChantierId={defaultChantierId}
          taches={taches.map((t) => ({
            id: t.id,
            nom: t.nom,
            dateDebut: t.dateDebut,
            dateFin: t.dateFin,
            avancement: t.avancement,
            statut: t.statut,
            priorite: t.priorite,
            equipe: t.equipe,
            chantier: t.chantier,
          }))}
          events={events}
        />
      )}

      {view === "pert" && (
        <PertChart
          canEdit={canEdit}
          onClickTask={canEdit ? (id) => setEditingId(id) : undefined}
          taches={taches.map((t) => ({
            id: t.id,
            nom: t.nom,
            dateDebut: t.dateDebut,
            dateFin: t.dateFin,
            avancement: t.avancement,
            statut: t.statut,
            equipe: t.equipe,
            chantier: t.chantier,
            dependances: t.dependances,
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
            ouvriers: t.ouvriers,
            recurrence: t.recurrence,
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
          allOuvriers={allOuvriers}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}
