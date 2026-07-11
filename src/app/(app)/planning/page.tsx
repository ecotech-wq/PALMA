import Link from "next/link";
import {
  Calendar,
  GanttChartSquare,
  Columns3,
  CalendarDays,
  Network,
  List as ListIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { PertChart } from "./PertChart";
import { CreateTacheForm } from "./TacheForm";
import { TacheList } from "./TacheList";
import { PlanningViews } from "./PlanningViews";
import { QuickAddBar } from "./QuickAddBar";
import { requireAuth, getAccessibleChantierIds, espaceFilter } from "@/lib/auth-helpers";
import { createTache, deleteTache, setAvancement, updateTache } from "./actions";

type Vue = "gantt" | "liste" | "pert" | "kanban" | "calendrier";

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
          : vueRaw === "calendrier"
            ? "calendrier"
            : "gantt";

  // Socle espaces : bornage aux chantiers accessibles (espace courant).
  const accessibleIds = await getAccessibleChantierIds(me);
  const borne = accessibleIds === null ? {} : { chantierId: { in: accessibleIds } };
  const borneId = accessibleIds === null ? {} : { id: { in: accessibleIds } };

  const [taches, chantiers, equipes, commandes, locations, sections, ouvriers] =
    await Promise.all([
    db.tache.findMany({
      where: chantier
        ? { chantierId: chantier, deletedAt: null, ...borne }
        : { deletedAt: null, ...borne },
      include: {
        chantier: { select: { id: true, nom: true } },
        equipe: { select: { id: true, nom: true } },
        dependances: { select: { id: true, nom: true } },
        labels: {
          include: {
            label: { select: { id: true, nom: true, couleur: true } },
          },
        },
        ouvriers: {
          include: {
            ouvrier: { select: { id: true, nom: true, prenom: true } },
          },
        },
      },
      // Ordre manuel d'abord (drag-to-reorder), puis priorité, puis date de
      // CRÉATION (stable). Trier par date de début faisait changer une tâche
      // de ligne dès qu'on la redimensionnait dans le Gantt : les lignes
      // semblaient s'échanger (constat Youssoufou 2026-07-11).
      orderBy: [
        { ordre: "asc" },
        { priorite: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] }, ...borneId },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.equipe.findMany({
      where: espaceFilter(me),
      select: { id: true, nom: true, chantierId: true },
      orderBy: { nom: "asc" },
    }),
    db.commande.findMany({
      where: {
        statut: { in: ["COMMANDEE", "EN_LIVRAISON"] },
        dateLivraisonPrevue: { not: null },
        deletedAt: null,
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
    // Liste des ouvriers actifs (pour le multi-select dans la modale)
    db.ouvrier.findMany({
      where: { actif: true, ...espaceFilter(me) },
      select: { id: true, nom: true, prenom: true, equipeId: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
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
                {(
                  [
                    { value: "gantt", label: "Gantt", Icon: GanttChartSquare },
                    { value: "kanban", label: "Kanban", Icon: Columns3 },
                    { value: "calendrier", label: "Calendrier", Icon: CalendarDays },
                    { value: "pert", label: "PERT", Icon: Network },
                    { value: "liste", label: "Liste", Icon: ListIcon },
                  ] as const
                ).map((v, i) => {
                  const active = view === v.value;
                  return (
                    <button
                      key={v.value}
                      type="submit"
                      name="vue"
                      value={v.value}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 transition-colors ${
                        i > 0 ? "border-l border-slate-300 dark:border-slate-700" : ""
                      } ${
                        active
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <v.Icon size={15} className="shrink-0" />
                      <span className="hidden sm:inline">{v.label}</span>
                    </button>
                  );
                })}
              </div>

              <Link
                href="/planning"
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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

      {view !== "pert" &&
      view !== "calendrier" &&
      taches.length === 0 &&
      events.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-slate-500 dark:text-slate-500 py-10">
            <Calendar size={32} className="mx-auto mb-3 text-slate-300" />
            Aucune tâche pour cette sélection.
          </CardBody>
        </Card>
      ) : view !== "pert" ? (
        <div className="space-y-3">
          <PlanningViews
            view={view as "gantt" | "kanban" | "liste" | "calendrier"}
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
              ouvriers: t.ouvriers.map((o) => ({
                id: o.ouvrier.id,
                nom: o.ouvrier.nom,
                prenom: o.ouvrier.prenom,
              })),
              recurrence: t.recurrence,
            }))}
            events={events}
            sections={sections}
            chantiers={chantiers}
            equipes={equipes}
            allLabels={allLabels}
            allOuvriers={ouvriers}
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
