import Link from "next/link";
import { Calendar } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { PertChart } from "./PertChart";
import { CreateTacheForm } from "./TacheForm";
import { TacheList } from "./TacheList";
import { PlanningViews } from "./PlanningViews";
import { QuickAddBar } from "./QuickAddBar";
import { requireAuth } from "@/lib/auth-helpers";
import { createTache, deleteTache, setAvancement, updateTache } from "./actions";

type Vue = "gantt" | "liste" | "pert" | "kanban";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ chantier?: string | string[]; vue?: string | string[] }>;
}) {
  const sp = await searchParams;
  const me = await requireAuth();
  const canEdit = !me.isClient;
  const chantier = Array.isArray(sp.chantier) ? sp.chantier[0] : sp.chantier;
  const vueRaw = Array.isArray(sp.vue) ? sp.vue[0] : sp.vue;
  const view: Vue =
    vueRaw === "liste"
      ? "liste"
      : vueRaw === "pert"
        ? "pert"
        : vueRaw === "kanban"
          ? "kanban"
          : "gantt";

  const [taches, chantiers, equipes, commandes, locations, sections] =
    await Promise.all([
    db.tache.findMany({
      where: chantier ? { chantierId: chantier } : {},
      include: {
        chantier: { select: { id: true, nom: true } },
        equipe: { select: { id: true, nom: true } },
        dependances: { select: { id: true, nom: true } },
        labels: {
          include: {
            label: { select: { id: true, nom: true, couleur: true } },
          },
        },
      },
      orderBy: [{ priorite: "asc" }, { dateDebut: "asc" }],
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.equipe.findMany({
      select: { id: true, nom: true, chantierId: true },
      orderBy: { nom: "asc" },
    }),
    db.commande.findMany({
      where: {
        statut: { in: ["COMMANDEE", "EN_LIVRAISON"] },
        dateLivraisonPrevue: { not: null },
        ...(chantier ? { chantierId: chantier } : {}),
      },
      select: {
        id: true,
        fournisseur: true,
        dateLivraisonPrevue: true,
        chantier: { select: { id: true, nom: true } },
      },
    }),
    db.locationPret.findMany({
      where: {
        cloture: false,
        ...(chantier ? { chantierId: chantier } : {}),
      },
      select: {
        id: true,
        designation: true,
        dateFinPrevue: true,
        chantier: { select: { id: true, nom: true } },
      },
    }),
    db.section.findMany({
      where: chantier ? { chantierId: chantier } : {},
      select: { id: true, chantierId: true, nom: true, ordre: true },
      orderBy: { ordre: "asc" },
    }),
  ]);

  const allLabels = await db.label.findMany({
    where: chantier
      ? { OR: [{ chantierId: null }, { chantierId: chantier }] }
      : {},
    select: { id: true, nom: true, couleur: true },
    orderBy: { nom: "asc" },
  });

  const events: {
    id: string;
    realId: string;
    type: "COMMANDE" | "LOCATION";
    label: string;
    date: Date;
  }[] = [
    ...commandes
      .filter((c) => c.dateLivraisonPrevue)
      .map((c) => ({
        id: `cmd-${c.id}`,
        realId: c.id,
        type: "COMMANDE" as const,
        label: `${c.fournisseur} (${c.chantier.nom})`,
        date: c.dateLivraisonPrevue!,
      })),
    ...locations.map((l) => ({
      id: `loc-${l.id}`,
      realId: l.id,
      type: "LOCATION" as const,
      label: `${l.designation}${l.chantier ? ` (${l.chantier.nom})` : ""}`,
      date: l.dateFinPrevue,
    })),
  ];

  const tachesPourPert = taches.filter((t) => !chantier || t.chantierId === chantier);
  const tachesCandidates = taches.map((t) => ({
    id: t.id,
    nom: t.nom,
    chantierId: t.chantierId,
  }));

  return (
    <div>
      <PageHeader
        title="Planning"
        description="Tâches, livraisons et restitutions"
      />

      {/* Saisie rapide style Todoist */}
      {canEdit && (
        <div className="mb-4">
          <QuickAddBar
            chantiers={chantiers}
            defaultChantierId={chantier}
          />
        </div>
      )}

      <Card className="mb-5">
        <CardBody>
          <div className="flex flex-col gap-3">
            <form
              method="get"
              className="flex flex-wrap items-center gap-2 sm:gap-3"
            >
              <select
                name="chantier"
                defaultValue={chantier ?? ""}
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm flex-1 sm:flex-none min-w-0"
              >
                <option value="">Tous les chantiers</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>

              <div className="inline-flex border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden text-sm shrink-0">
                <button
                  type="submit"
                  name="vue"
                  value="gantt"
                  className={`px-3 py-2 ${
                    view === "gantt"
                      ? "bg-brand-500 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  Gantt
                </button>
                <button
                  type="submit"
                  name="vue"
                  value="kanban"
                  className={`px-3 py-2 border-l border-slate-300 dark:border-slate-700 ${
                    view === "kanban"
                      ? "bg-brand-500 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  Kanban
                </button>
                <button
                  type="submit"
                  name="vue"
                  value="pert"
                  className={`px-3 py-2 border-l border-slate-300 dark:border-slate-700 ${
                    view === "pert"
                      ? "bg-brand-500 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  PERT
                </button>
                <button
                  type="submit"
                  name="vue"
                  value="liste"
                  className={`px-3 py-2 border-l border-slate-300 dark:border-slate-700 ${
                    view === "liste"
                      ? "bg-brand-500 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  Liste
                </button>
              </div>

              <Link
                href="/planning"
                className="text-xs text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300"
              >
                Réinitialiser
              </Link>
            </form>

            <CreateTacheForm
              chantiers={chantiers}
              equipes={equipes}
              taches={tachesCandidates}
              defaultChantierId={chantier}
              action={createTache}
            />
          </div>
        </CardBody>
      </Card>

      {view !== "pert" && taches.length === 0 && events.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-slate-500 dark:text-slate-500 py-10">
            <Calendar size={32} className="mx-auto mb-3 text-slate-300" />
            Aucune tâche pour cette sélection.
          </CardBody>
        </Card>
      ) : view !== "pert" ? (
        <div className="space-y-3">
          <PlanningViews
            view={view as "gantt" | "kanban" | "liste"}
            canEdit={canEdit}
            taches={taches.map((t) => ({
              id: t.id,
              nom: t.nom,
              description: t.description,
              chantierId: t.chantierId,
              equipeId: t.equipeId,
              sectionId: t.sectionId,
              parentId: t.parentId,
              dateDebut: t.dateDebut,
              dateFin: t.dateFin,
              avancement: t.avancement,
              statut: t.statut,
              priorite: t.priorite,
              dependances: t.dependances,
              labels: t.labels,
              equipe: t.equipe,
              chantier: t.chantier,
            }))}
            events={events}
            sections={sections}
            chantiers={chantiers}
            equipes={equipes}
            allLabels={allLabels}
            defaultChantierId={chantier}
          />
          {view === "gantt" && <Legend />}
          {view === "liste" && canEdit && (
            <details>
              <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none">
                Édition avancée (formulaire complet)
              </summary>
              <div className="mt-3">
                <TacheList
                  taches={taches}
                  equipes={equipes}
                  onSetAvancement={setAvancement}
                  onDelete={deleteTache}
                  onUpdate={updateTache}
                />
              </div>
            </details>
          )}
        </div>
      ) : null}

      {view === "pert" && <PertChart taches={tachesPourPert} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-500">
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 bg-slate-300 rounded" /> À faire
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 bg-blue-500 rounded" /> En cours
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 bg-green-500 rounded" /> Terminée
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 bg-red-400 rounded" /> Bloquée
      </span>
      <span className="flex items-center gap-1 ml-2">
        <span className="w-3 h-3 bg-orange-500 rounded-sm" /> Livraison
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 bg-purple-500 rounded-sm" /> Fin location
      </span>
    </div>
  );
}
