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
import { CreateTacheForm } from "./TacheForm";
import { TacheList } from "./TacheList";
import { PlanningViews } from "./PlanningViews";
import { QuickAddBar } from "./QuickAddBar";
import { requireAuth, getAccessibleChantierIds, espaceFilter } from "@/lib/auth-helpers";
import { createTache, deleteTache, setAvancement, updateTache } from "./actions";
import { FiltresPlanning } from "./FiltresPlanning";
import { construireWhereTaches, validerChantier } from "./filtres";

type Vue = "gantt" | "liste" | "pert" | "kanban" | "calendrier";

type Param = string | string[] | undefined;

/** Premier élément d'un query param éventuellement répété, "" → undefined. */
function premier(v: Param): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s || undefined;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{
    chantier?: Param;
    ouvrier?: Param;
    equipe?: Param;
    espace?: Param;
    vue?: Param;
  }>;
}) {
  const sp = await searchParams;
  const me = await requireAuth();
  const canEdit = !me.isClient;
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
  const borneId = accessibleIds === null ? {} : { id: { in: accessibleIds } };

  // Filtres GET, validés côté serveur : un id de chantier hors périmètre
  // est ignoré (voir validerChantier). Le filtre entreprise n'existe que
  // pour l'admin global en mode « toutes les entreprises » : si un espace
  // courant est déjà sélectionné, le bornage fait déjà ce travail.
  const chantier = validerChantier(premier(sp.chantier), accessibleIds);
  const ouvrierSel = premier(sp.ouvrier);
  const equipeSel = premier(sp.equipe);
  const filtreEspaceVisible =
    me.isGlobalAdmin && !me.espaceCourant && me.espaces.length > 0;
  const espaceBrut = premier(sp.espace);
  const espaceSel =
    filtreEspaceVisible && espaceBrut && me.espaces.some((s) => s.id === espaceBrut)
      ? espaceBrut
      : undefined;

  const [taches, chantiers, equipes, commandes, locations, sections, ouvriers] =
    await Promise.all([
    db.tache.findMany({
      where: construireWhereTaches({
        accessibleIds,
        chantierId: chantier,
        ouvrierId: ouvrierSel,
        equipeId: equipeSel,
        espaceId: espaceSel,
      }),
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
      where: {
        statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] },
        ...borneId,
        // Options cohérentes avec le filtre entreprise (validé plus haut)
        ...(espaceSel ? { espaceId: espaceSel } : {}),
      },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.equipe.findMany({
      where: {
        ...espaceFilter(me),
        ...(espaceSel ? { espaceId: espaceSel } : {}),
      },
      select: { id: true, nom: true, chantierId: true },
      orderBy: { nom: "asc" },
    }),
    db.commande.findMany({
      where: {
        statut: { in: ["COMMANDEE", "EN_LIVRAISON"] },
        dateLivraisonPrevue: { not: null },
        deletedAt: null,
        // Même bornage espace que les tâches : sans lui, fournisseurs et
        // noms de chantiers de TOUS les espaces partiraient au client.
        // Le filtre chantier (validé contre accessibleIds) prime ensuite.
        ...(accessibleIds !== null
          ? { chantierId: { in: accessibleIds } }
          : {}),
        ...(chantier ? { chantierId: chantier } : {}),
        // Cohérence avec le filtre entreprise (les events suivent les tâches)
        ...(espaceSel ? { chantier: { espaceId: espaceSel } } : {}),
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
        // Même bornage espace que les tâches. Le filtre { in } ne retient
        // que les chantierId non nuls : une location sans chantier n'est
        // rattachable à aucune entreprise, donc exclue quand le bornage
        // est actif. Le filtre chantier (validé) prime ensuite.
        ...(accessibleIds !== null
          ? { chantierId: { in: accessibleIds } }
          : {}),
        ...(chantier ? { chantierId: chantier } : {}),
        // Une location sans chantier n'est rattachable à aucune entreprise :
        // exclue quand le filtre entreprise est actif.
        ...(espaceSel ? { chantier: { espaceId: espaceSel } } : {}),
      },
      select: {
        id: true,
        designation: true,
        dateFinPrevue: true,
        chantier: { select: { id: true, nom: true } },
      },
    }),
    db.section.findMany({
      // Bornées aux chantiers accessibles : la vue Liste affiche même les
      // sections vides, donc sans bornage les noms de sections des autres
      // espaces seraient visibles par tout utilisateur.
      where: chantier
        ? { chantierId: chantier }
        : accessibleIds !== null
          ? { chantierId: { in: accessibleIds } }
          : {},
      select: { id: true, chantierId: true, nom: true, ordre: true },
      orderBy: { ordre: "asc" },
    }),
    // Liste des ouvriers actifs (multi-select de la modale + filtre)
    db.ouvrier.findMany({
      where: {
        actif: true,
        ...espaceFilter(me),
        ...(espaceSel ? { espaceId: espaceSel } : {}),
      },
      select: { id: true, nom: true, prenom: true, equipeId: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
  ]);

  // Labels globaux (chantierId null) + labels des chantiers accessibles :
  // même frontière d'espace que les sections.
  const allLabels = await db.label.findMany({
    where: chantier
      ? { OR: [{ chantierId: null }, { chantierId: chantier }] }
      : accessibleIds !== null
        ? { OR: [{ chantierId: null }, { chantierId: { in: accessibleIds } }] }
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
              <FiltresPlanning
                chantiers={chantiers}
                ouvriers={ouvriers.map((o) => ({
                  id: o.id,
                  nom: o.nom,
                  prenom: o.prenom,
                }))}
                equipes={equipes.map((e) => ({ id: e.id, nom: e.nom }))}
                espaces={
                  filtreEspaceVisible
                    ? me.espaces.map((s) => ({ id: s.id, nom: s.nom }))
                    : null
                }
                valeurs={{
                  chantier: chantier ?? "",
                  ouvrier: ouvrierSel ?? "",
                  equipe: equipeSel ?? "",
                  espace: espaceSel ?? "",
                }}
                vue={view}
              />

              {/* Les selects naviguent d'eux-mêmes (router.push) ; ces
                  champs cachés conservent les filtres actifs quand on
                  change de vue via les boutons submit du formulaire GET. */}
              {chantier && (
                <input type="hidden" name="chantier" value={chantier} />
              )}
              {ouvrierSel && (
                <input type="hidden" name="ouvrier" value={ouvrierSel} />
              )}
              {equipeSel && (
                <input type="hidden" name="equipe" value={equipeSel} />
              )}
              {espaceSel && (
                <input type="hidden" name="espace" value={espaceSel} />
              )}

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
      ) : (
        <div className="space-y-3">
          <PlanningViews
            view={view}
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
      )}
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
