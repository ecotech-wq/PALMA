"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Plus,
  X,
  Layers,
  Filter as FilterIcon,
  Crosshair,
  Pencil,
} from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ReserveForm } from "./ReserveForm";
import { ReserveList } from "./ReserveList";
import { PlanUploadForm } from "./PlanUploadForm";
import { supprimerPlan, deplacerReserve } from "./actions";

type PlanItem = {
  id: string;
  url: string;
  nom: string | null;
};

type ReserveItem = {
  id: string;
  numero: number;
  texte: string;
  zone: string | null;
  lot: string | null;
  dateLimite: Date | string | null;
  photos: string[];
  planId: string | null;
  planNom: string | null;
  hasPosition: boolean;
  posX: number | null;
  posY: number | null;
  leveLe: Date | string | null;
  leveNote: string | null;
};

type Filter = "toutes" | "ouvertes" | "levees";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Workspace style Archipad : un seul plan visible, panneau latéral
 * pour les réserves (filtrable + clic = focus sur la puce), formulaire
 * de création qui remplace la liste pendant l'édition.
 */
export function PvWorkspace({
  chantierId,
  plans,
  reserves,
  canEdit,
  isAdmin,
  lotSuggestions = [],
}: {
  chantierId: string;
  plans: PlanItem[];
  reserves: ReserveItem[];
  canEdit: boolean;
  isAdmin: boolean;
  /** Suggestions pour le champ Lot : équipes du chantier, entreprises,
   *  lots déjà utilisés... Mergées avec les codes par défaut dans le form. */
  lotSuggestions?: { value: string; label?: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const canvasRef = useRef<PlanCanvasHandle>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(
    plans[0]?.id ?? null
  );
  const [filter, setFilter] = useState<Filter>("toutes");
  const [filterCurrentPlan, setFilterCurrentPlan] = useState(true);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Mode du panneau latéral
  const [panelMode, setPanelMode] = useState<
    "list" | "new-pin" | "new-no-plan" | "edit"
  >("list");
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editingReserve, setEditingReserve] = useState<ReserveItem | null>(
    null
  );

  // Si la liste de plans change, resync l'actif
  useEffect(() => {
    if (!activePlanId && plans.length > 0) {
      setActivePlanId(plans[0].id);
    }
    if (activePlanId && !plans.find((p) => p.id === activePlanId)) {
      setActivePlanId(plans[0]?.id ?? null);
    }
  }, [plans, activePlanId]);

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;

  // Réserves visibles dans le panneau (filtrées)
  const visibleReserves = useMemo(() => {
    let r = reserves;
    if (filterCurrentPlan && activePlanId) {
      r = r.filter((x) => x.planId === activePlanId || x.planId === null);
    }
    if (filter === "ouvertes") r = r.filter((x) => !x.leveLe);
    else if (filter === "levees") r = r.filter((x) => x.leveLe);
    return r;
  }, [reserves, filterCurrentPlan, activePlanId, filter]);

  // Pins du plan actif
  const activePins = useMemo(
    () =>
      activePlan
        ? reserves
            .filter(
              (r) =>
                r.planId === activePlan.id &&
                r.posX !== null &&
                r.posY !== null
            )
            .map((r) => ({
              id: r.id,
              numero: r.numero,
              posX: r.posX as number,
              posY: r.posY as number,
              texte: r.texte,
              leveLe: r.leveLe,
              dateLimite: r.dateLimite,
              highlighted: r.id === highlightedId,
            }))
        : [],
    [reserves, activePlan, highlightedId]
  );

  /** Clic sur le plan : ouvre le panneau de création avec position */
  function handlePlanClick(x: number, y: number) {
    setDraftPos({ x, y });
    setPanelMode("new-pin");
  }

  /** Clic sur une réserve dans la liste : zoom sur sa puce */
  function focusReserve(r: ReserveItem) {
    if (!r.hasPosition || !r.planId) {
      // Pas de puce : juste highlight visuel temporaire dans la liste
      setHighlightedId(r.id);
      window.setTimeout(() => setHighlightedId(null), 2000);
      return;
    }
    const doFocus = () => {
      canvasRef.current?.focusPin(r.id);
      setHighlightedId(r.id);
      window.setTimeout(() => setHighlightedId(null), 2500);
    };
    if (r.planId !== activePlanId) {
      setActivePlanId(r.planId);
      // Délai pour laisser le canvas re-render avec le nouveau plan
      window.setTimeout(doFocus, 250);
    } else {
      doFocus();
    }
  }

  function cancelPanel() {
    setDraftPos(null);
    setEditingReserve(null);
    setPanelMode("list");
  }

  /** Ouvre le panneau d'édition pour la réserve donnée. */
  function editReserve(r: ReserveItem) {
    setEditingReserve(r);
    setPanelMode("edit");
  }

  async function handleDeletePlan(planId: string) {
    if (
      !confirm(
        "Supprimer ce plan ? Les puces des réserves liées seront détachées."
      )
    )
      return;
    try {
      await supprimerPlan(chantierId, planId);
      toast.success("Plan supprimé");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  const nbOuvertes = reserves.filter((r) => !r.leveLe).length;
  const nbLevees = reserves.filter((r) => r.leveLe).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>
            <Layers size={16} className="inline mr-1" />
            Plans &amp; réserves
          </CardTitle>
          {canEdit && <PlanUploadForm chantierId={chantierId} variant="compact" />}
        </div>

        {plans.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {plans.map((p) => (
              <PlanTab
                key={p.id}
                plan={p}
                active={p.id === activePlanId}
                canDelete={canEdit}
                onSelect={() => setActivePlanId(p.id)}
                onDelete={() => handleDeletePlan(p.id)}
              />
            ))}
          </div>
        )}
      </CardHeader>

      <CardBody className="!p-0">
        {plans.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              Aucun plan importé.{" "}
              {canEdit
                ? "Importez un PDF ou une image pour commencer à placer des puces."
                : ""}
            </p>
          </div>
        ) : activePlan ? (
          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* === Viewer du plan actif === */}
            <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
              <PlanCanvas
                ref={canvasRef}
                key={activePlan.id}
                chantierId={chantierId}
                plan={activePlan}
                pins={activePins}
                canEdit={canEdit}
                onPlanClick={handlePlanClick}
                draftPos={draftPos}
                setDraftPos={setDraftPos}
                draftNumero={reserves.length + 1}
              />
            </div>

            {/* === Panneau latéral === */}
            <div className="bg-slate-50 dark:bg-slate-900/40 flex flex-col">
              {panelMode === "list" && (
                <ListPanel
                  visibleReserves={visibleReserves}
                  totalReserves={reserves.length}
                  nbOuvertes={nbOuvertes}
                  nbLevees={nbLevees}
                  filter={filter}
                  setFilter={setFilter}
                  filterCurrentPlan={filterCurrentPlan}
                  setFilterCurrentPlan={setFilterCurrentPlan}
                  hasMultiplePlans={plans.length > 1}
                  highlightedId={highlightedId}
                  onSelectReserve={focusReserve}
                  onEditReserve={editReserve}
                  canEdit={canEdit}
                  onAddNoPlan={() => setPanelMode("new-no-plan")}
                />
              )}

              {panelMode === "new-pin" && draftPos && activePlan && (
                <FormPanel
                  title={`Nouvelle réserve — puce #${reserves.length + 1}`}
                  subtitle={`Plan : ${activePlan.nom ?? "—"}`}
                  onCancel={cancelPanel}
                >
                  <ReserveForm
                    chantierId={chantierId}
                    planId={activePlan.id}
                    posX={draftPos.x}
                    posY={draftPos.y}
                    lotSuggestions={lotSuggestions}
                    onSuccess={cancelPanel}
                  />
                </FormPanel>
              )}

              {panelMode === "new-no-plan" && (
                <FormPanel
                  title={`Nouvelle réserve — sans plan`}
                  subtitle="La puce ne sera pas posée sur un plan, seulement listée par localisation."
                  onCancel={cancelPanel}
                >
                  <ReserveForm
                    chantierId={chantierId}
                    lotSuggestions={lotSuggestions}
                    onSuccess={cancelPanel}
                  />
                </FormPanel>
              )}

              {panelMode === "edit" && editingReserve && (
                <FormPanel
                  title={`Modifier la réserve #${editingReserve.numero}`}
                  subtitle={
                    editingReserve.planNom
                      ? `Plan : ${editingReserve.planNom}`
                      : "Sans plan"
                  }
                  onCancel={cancelPanel}
                >
                  <ReserveForm
                    chantierId={chantierId}
                    lotSuggestions={lotSuggestions}
                    initialValues={{
                      reserveId: editingReserve.id,
                      texte: editingReserve.texte,
                      zone: editingReserve.zone,
                      lot: editingReserve.lot,
                      dateLimite: editingReserve.dateLimite,
                      photos: editingReserve.photos,
                    }}
                    onSuccess={cancelPanel}
                  />
                </FormPanel>
              )}
            </div>
          </div>
        ) : null}
      </CardBody>

      {/* Liste détaillée en bas avec photos (admin only) */}
      {isAdmin && reserves.length > 0 && (
        <CardBody className="border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-200">
            Détail des réserves
          </h3>
          <ReserveList
            chantierId={chantierId}
            canEdit={canEdit}
            onEdit={(id) => {
              const r = reserves.find((x) => x.id === id);
              if (r) editReserve(r);
            }}
            reserves={reserves.map((r) => ({
              id: r.id,
              numero: r.numero,
              texte: r.texte,
              zone: r.zone,
              lot: r.lot,
              dateLimite: r.dateLimite,
              photos: r.photos,
              planNom: r.planNom,
              hasPosition: r.hasPosition,
              leveLe: r.leveLe,
              leveNote: r.leveNote,
            }))}
          />
        </CardBody>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- */
/* Panneau latéral : LISTE                                            */
/* ----------------------------------------------------------------- */
function ListPanel({
  visibleReserves,
  totalReserves,
  nbOuvertes,
  nbLevees,
  filter,
  setFilter,
  filterCurrentPlan,
  setFilterCurrentPlan,
  hasMultiplePlans,
  highlightedId,
  onSelectReserve,
  onEditReserve,
  canEdit,
  onAddNoPlan,
}: {
  visibleReserves: ReserveItem[];
  totalReserves: number;
  nbOuvertes: number;
  nbLevees: number;
  filter: Filter;
  setFilter: (f: Filter) => void;
  filterCurrentPlan: boolean;
  setFilterCurrentPlan: (b: boolean) => void;
  hasMultiplePlans: boolean;
  highlightedId: string | null;
  onSelectReserve: (r: ReserveItem) => void;
  onEditReserve: (r: ReserveItem) => void;
  canEdit: boolean;
  onAddNoPlan: () => void;
}) {
  return (
    <>
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>
            <AlertTriangle size={14} className="inline mr-1" />
            Réserves
          </span>
          <span className="text-xs font-normal text-slate-500">
            {visibleReserves.length}/{totalReserves}
          </span>
        </h3>

        <div className="flex items-center gap-1 flex-wrap">
          <FilterChip
            active={filter === "toutes"}
            onClick={() => setFilter("toutes")}
            label="Toutes"
            count={totalReserves}
          />
          <FilterChip
            active={filter === "ouvertes"}
            onClick={() => setFilter("ouvertes")}
            label="Ouvertes"
            count={nbOuvertes}
            color="red"
          />
          <FilterChip
            active={filter === "levees"}
            onClick={() => setFilter("levees")}
            label="Levées"
            count={nbLevees}
            color="green"
          />
        </div>

        {hasMultiplePlans && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={filterCurrentPlan}
              onChange={(e) => setFilterCurrentPlan(e.target.checked)}
            />
            <FilterIcon size={11} />
            Plan actif uniquement
          </label>
        )}
      </div>

      <div className="flex-1 max-h-[70vh] overflow-y-auto p-3">
        {visibleReserves.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center py-6">
            Aucune réserve avec ces filtres.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleReserves.map((r) => (
              <CompactReserveCard
                key={r.id}
                reserve={r}
                highlighted={r.id === highlightedId}
                onClick={() => onSelectReserve(r)}
                onEdit={() => onEditReserve(r)}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onAddNoPlan}
          >
            <Plus size={14} /> Ajouter sans positionner
          </Button>
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- */
/* Panneau latéral : FORMULAIRE                                       */
/* ----------------------------------------------------------------- */
function FormPanel({
  title,
  subtitle,
  onCancel,
  children,
}: {
  title: string;
  subtitle?: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-brand-50 dark:bg-brand-950/30">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-brand-800 dark:text-brand-300">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-brand-700/70 dark:text-brand-400/70 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 shrink-0"
            aria-label="Annuler"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </>
  );
}

/* ----------------------------------------------------------------- */
/* Filter chip                                                        */
/* ----------------------------------------------------------------- */
function FilterChip({
  active,
  onClick,
  label,
  count,
  color = "slate",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: "slate" | "red" | "green";
}) {
  const activeCls =
    color === "red"
      ? "bg-red-600 text-white border-red-700"
      : color === "green"
        ? "bg-green-600 text-white border-green-700"
        : "bg-brand-600 text-white border-brand-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition ${
        active
          ? activeCls
          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {label}
      <span className="font-semibold">{count}</span>
    </button>
  );
}

/* ----------------------------------------------------------------- */
/* Carte compacte d'une réserve (panneau latéral)                     */
/* ----------------------------------------------------------------- */
function CompactReserveCard({
  reserve: r,
  highlighted,
  onClick,
  onEdit,
  canEdit,
}: {
  reserve: ReserveItem;
  highlighted: boolean;
  onClick: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}) {
  const lifted = !!r.leveLe;
  const late =
    !lifted && r.dateLimite && new Date(r.dateLimite) < new Date();
  const pinBg = lifted
    ? "bg-green-500 border-green-700"
    : late
      ? "bg-red-500 border-red-700"
      : "bg-blue-500 border-blue-700";
  return (
    <li
      onClick={onClick}
      className={`flex items-start gap-2 p-2 rounded text-xs cursor-pointer transition ${
        highlighted
          ? "ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-950/40"
          : lifted
            ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 hover:bg-green-100 dark:hover:bg-green-950/50"
            : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
      title={r.hasPosition ? "Cliquer pour zoomer sur la puce" : ""}
    >
      <div
        className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border-2 text-white ${pinBg}`}
      >
        {r.numero}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
          {r.texte}
        </p>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
          {r.lot && (
            <span className="inline-flex items-center px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono font-semibold">
              {r.lot}
            </span>
          )}
          {r.zone && (
            <span>
              <MapPin size={9} className="inline mr-0.5" />
              {r.zone}
            </span>
          )}
          {r.photos.length > 0 && <span>📷 {r.photos.length}</span>}
          {r.dateLimite && !lifted && (
            <span className="text-amber-700 dark:text-amber-400">
              Pour le {dateFmt.format(new Date(r.dateLimite))}
            </span>
          )}
          {lifted && r.leveLe && (
            <span className="text-green-700 dark:text-green-400">
              <CheckCircle2 size={9} className="inline mr-0.5" />
              {dateFmt.format(new Date(r.leveLe))}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 rounded text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Modifier"
            title="Modifier la réserve"
          >
            <Pencil size={12} />
          </button>
        )}
        {r.hasPosition && (
          <Crosshair
            size={12}
            className="text-slate-400 dark:text-slate-500"
          />
        )}
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- */
/* Onglet plan                                                        */
/* ----------------------------------------------------------------- */
function PlanTab({
  plan,
  active,
  canDelete,
  onSelect,
  onDelete,
}: {
  plan: PlanItem;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition cursor-pointer ${
        active
          ? "bg-brand-600 text-white border-brand-700"
          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
      onClick={onSelect}
    >
      <Layers size={12} />
      <span className="font-medium truncate max-w-[140px]">
        {plan.nom || "Plan"}
      </span>
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`ml-1 rounded p-0.5 ${
            active
              ? "hover:bg-white/20"
              : "hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
          aria-label="Supprimer ce plan"
          title="Supprimer ce plan"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Le canvas zoomable / pannable + puces draggables                   */
/* ----------------------------------------------------------------- */
type PlanCanvasHandle = {
  focusPin: (reserveId: string) => void;
};

type PinForCanvas = {
  id: string;
  numero: number;
  posX: number;
  posY: number;
  texte: string;
  leveLe: Date | string | null;
  dateLimite: Date | string | null;
  highlighted: boolean;
};

type PlanCanvasProps = {
  chantierId: string;
  plan: PlanItem;
  pins: PinForCanvas[];
  canEdit: boolean;
  /** Demande à ouvrir le panneau "nouvelle réserve" avec une position */
  onPlanClick: (x: number, y: number) => void;
  /** Position de la puce brouillon (en cours de création), draggable */
  draftPos: { x: number; y: number } | null;
  /** Mise à jour de la position de la puce brouillon pendant le drag */
  setDraftPos: (pos: { x: number; y: number }) => void;
  draftNumero: number;
};

/**
 * Couleurs Archipad :
 *  - vert  = levée
 *  - rouge = en retard (date limite dépassée et non levée)
 *  - bleu  = à temps (en cours, pas encore en retard)
 */
function pinColors(p: { leveLe: Date | string | null; dateLimite: Date | string | null }) {
  if (p.leveLe) {
    return { bg: "bg-green-500", border: "border-green-700" };
  }
  if (p.dateLimite && new Date(p.dateLimite) < new Date()) {
    return { bg: "bg-red-500", border: "border-red-700" };
  }
  return { bg: "bg-blue-500", border: "border-blue-700" };
}

const PlanCanvas = forwardRef<PlanCanvasHandle, PlanCanvasProps>(
  function PlanCanvas(
    {
      chantierId,
      plan,
      pins,
      canEdit,
      onPlanClick,
      draftPos,
      setDraftPos,
      draftNumero,
    },
    ref
  ) {
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const toast = useToast();

    // ID de la puce en cours de drag (ou "draft"). Désactive le panning
    // de react-zoom-pan-pinch pendant le drag.
    const [draggingId, setDraggingId] = useState<string | null>(null);

    // Position locale "live" pendant un drag de puce existante (override
    // visuel ; on ne sauve qu'au pointerup).
    const [pinOverrides, setPinOverrides] = useState<
      Record<string, { x: number; y: number }>
    >({});

    useImperativeHandle(ref, () => ({
      focusPin: (reserveId: string) => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const el = wrapper.querySelector(
          `[data-pin-id="${reserveId}"]`
        ) as HTMLElement | null;
        if (el && transformRef.current) {
          transformRef.current.zoomToElement(el, 3, 600);
        }
      },
    }));

    /**
     * Démarre le drag d'une puce (existante ou brouillon).
     * Pose une listener globale pointermove/pointerup, calcule la
     * position relative à l'image en temps réel, sauvegarde au up.
     */
    function startDrag(pinId: string, e: React.PointerEvent) {
      if (!canEdit) return;
      e.stopPropagation();
      e.preventDefault();
      setDraggingId(pinId);

      const img = imgRef.current;
      if (!img) return;

      let lastPos: { x: number; y: number } | null = null;

      function clamp01(v: number) {
        return Math.max(0, Math.min(1, v));
      }

      function computePos(clientX: number, clientY: number) {
        const rect = img!.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
          x: clamp01((clientX - rect.left) / rect.width),
          y: clamp01((clientY - rect.top) / rect.height),
        };
      }

      function onMove(ev: PointerEvent) {
        const p = computePos(ev.clientX, ev.clientY);
        if (!p) return;
        lastPos = p;
        if (pinId === "draft") {
          setDraftPos(p);
        } else {
          setPinOverrides((prev) => ({ ...prev, [pinId]: p }));
        }
      }

      async function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDraggingId(null);

        if (pinId === "draft" || !lastPos) return;

        // Sauvegarde sur le serveur
        try {
          await deplacerReserve(chantierId, pinId, lastPos.x, lastPos.y);
          // Nettoie l'override visuel : la prop pin.posX/posY sera mise à
          // jour par le router refresh
          setPinOverrides((prev) => {
            const next = { ...prev };
            delete next[pinId];
            return next;
          });
          router.refresh();
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Erreur de déplacement"
          );
          // En cas d'erreur, on retire l'override pour revenir à la pos serveur
          setPinOverrides((prev) => {
            const next = { ...prev };
            delete next[pinId];
            return next;
          });
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    /**
     * "+ Nouvelle réserve" : pose une puce brouillon au centre du
     * viewport (visible) et ouvre le panneau de création.
     * Le centre du viewport est calculé à partir des rects courants
     * (qui tiennent compte du zoom et du pan).
     */
    function handleAddCenter() {
      if (!canEdit) return;
      const wrapperEl = wrapperRef.current?.querySelector(
        ".react-transform-wrapper"
      ) as HTMLElement | null;
      const img = imgRef.current;
      if (!wrapperEl || !img) {
        // Fallback : centre du plan
        onPlanClick(0.5, 0.5);
        return;
      }
      const wRect = wrapperEl.getBoundingClientRect();
      const iRect = img.getBoundingClientRect();
      if (iRect.width <= 0 || iRect.height <= 0) {
        onPlanClick(0.5, 0.5);
        return;
      }
      const cx = wRect.left + wRect.width / 2;
      const cy = wRect.top + wRect.height / 2;
      let x = (cx - iRect.left) / iRect.width;
      let y = (cy - iRect.top) / iRect.height;
      // Si le centre est hors image (utilisateur a pané loin), on
      // retombe sur le centre logique 0.5, 0.5
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        x = 0.5;
        y = 0.5;
      }
      onPlanClick(x, y);
    }

    return (
      <div
        ref={wrapperRef}
        className="relative w-full bg-slate-100 dark:bg-slate-950"
      >
        {canEdit && (
          <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 flex items-center justify-between gap-2 flex-wrap">
            <span className="italic">
              <MapPin size={12} className="inline mr-1" />
              Molette/pinch : zoom · Glisser fond : déplacer · Glisser puce : repositionner
            </span>
            <Button type="button" size="sm" onClick={handleAddCenter}>
              <Plus size={14} /> Nouvelle réserve
            </Button>
          </div>
        )}

        <TransformWrapper
          ref={transformRef}
          minScale={0.2}
          maxScale={10}
          initialScale={1}
          centerOnInit
          centerZoomedOut
          limitToBounds={false}
          wheel={{ step: 0.15 }}
          doubleClick={{ disabled: false, mode: "zoomIn", step: 0.7 }}
          panning={{
            velocityDisabled: true,
            lockAxisX: false,
            lockAxisY: false,
            // Désactive le panning du fond pendant qu'on drag une puce
            disabled: !!draggingId,
          }}
        >
          <ZoomControls />
          <TransformComponent
            wrapperStyle={{
              width: "100%",
              height: "min(75vh, 800px)",
              background: "transparent",
            }}
            contentStyle={{
              display: "inline-block",
            }}
          >
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={plan.url}
                alt={plan.nom || "Plan"}
                className="block max-w-none select-none"
                draggable={false}
              />

              {pins.map((p) => {
                const override = pinOverrides[p.id];
                const x = override?.x ?? p.posX;
                const y = override?.y ?? p.posY;
                const colors = pinColors(p);
                const isDragging = draggingId === p.id;
                return (
                  <div
                    key={p.id}
                    data-pin-id={p.id}
                    onPointerDown={(e) => startDrag(p.id, e)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : ""
                    } ${isDragging ? "z-30" : "z-10"}`}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      touchAction: "none",
                    }}
                    title={`#${p.numero} — ${p.texte}${
                      canEdit ? " · Glisser pour repositionner" : ""
                    }`}
                  >
                    <div
                      className={`relative flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 shadow-md text-white ${colors.bg} ${colors.border} ${
                        isDragging ? "scale-125" : ""
                      } transition-transform`}
                    >
                      {p.numero}
                      {p.highlighted && (
                        <span
                          className="absolute inset-0 rounded-full ring-4 ring-amber-400 animate-ping"
                          style={{ animationDuration: "1.2s" }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {draftPos && (
                <div
                  data-pin-id="draft"
                  onPointerDown={(e) => startDrag("draft", e)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 ${
                    canEdit ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                  style={{
                    left: `${draftPos.x * 100}%`,
                    top: `${draftPos.y * 100}%`,
                    touchAction: "none",
                  }}
                  title="Puce en cours de création — glisser pour repositionner"
                >
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 bg-amber-400 border-amber-600 text-white shadow-md ${
                      draggingId === "draft"
                        ? "scale-125"
                        : "animate-pulse"
                    } transition-transform`}
                  >
                    {draftNumero}
                  </div>
                </div>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>
    );
  }
);

/* ----------------------------------------------------------------- */
/* Toolbar zoom                                                       */
/* ----------------------------------------------------------------- */
function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-white/90 dark:bg-slate-900/90 rounded-md p-1 shadow border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => zoomIn()}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        aria-label="Zoom +"
        title="Zoom +"
      >
        <ZoomIn size={14} />
      </button>
      <button
        type="button"
        onClick={() => zoomOut()}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        aria-label="Zoom -"
        title="Zoom -"
      >
        <ZoomOut size={14} />
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        aria-label="Réinitialiser"
        title="Réinitialiser le zoom"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}

