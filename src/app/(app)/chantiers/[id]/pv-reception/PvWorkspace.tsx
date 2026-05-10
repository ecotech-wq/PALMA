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
import { supprimerPlan } from "./actions";

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
}: {
  chantierId: string;
  plans: PlanItem[];
  reserves: ReserveItem[];
  canEdit: boolean;
  isAdmin: boolean;
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

  // Mode du panneau latéral : list (défaut) | new-pin (clic plan) | new-no-plan
  const [panelMode, setPanelMode] = useState<"list" | "new-pin" | "new-no-plan">(
    "list"
  );
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(
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
    setPanelMode("list");
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
                plan={activePlan}
                pins={activePins}
                canEdit={canEdit}
                onPlanClick={handlePlanClick}
                draftPos={draftPos}
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
}: {
  reserve: ReserveItem;
  highlighted: boolean;
  onClick: () => void;
}) {
  const lifted = !!r.leveLe;
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
        className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border-2 ${
          lifted
            ? "bg-green-500 border-green-700 text-white"
            : "bg-red-500 border-red-700 text-white"
        }`}
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
      {r.hasPosition && (
        <Crosshair
          size={12}
          className="shrink-0 text-slate-400 dark:text-slate-500 mt-1"
        />
      )}
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
/* Le canvas zoomable / pannable + clic-puce                          */
/* ----------------------------------------------------------------- */
type PlanCanvasHandle = {
  focusPin: (reserveId: string) => void;
};

type PlanCanvasProps = {
  plan: PlanItem;
  pins: {
    id: string;
    numero: number;
    posX: number;
    posY: number;
    texte: string;
    leveLe: Date | string | null;
    highlighted: boolean;
  }[];
  canEdit: boolean;
  onPlanClick: (x: number, y: number) => void;
  draftPos: { x: number; y: number } | null;
  draftNumero: number;
};

const PlanCanvas = forwardRef<PlanCanvasHandle, PlanCanvasProps>(
  function PlanCanvas(
    { plan, pins, canEdit, onPlanClick, draftPos, draftNumero },
    ref
  ) {
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    // Garde la dernière fonction onPlanClick dans une ref pour que le
    // listener DOM (qui ne se ré-attache pas) appelle toujours la
    // version courante.
    const onPlanClickRef = useRef(onPlanClick);
    onPlanClickRef.current = onPlanClick;

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
     * Détection click manuelle au niveau DOM, parce que :
     * - react-zoom-pan-pinch utilise setPointerCapture sur son wrapper,
     *   ce qui empêche le click event natif de fire sur l'image
     *   (Chrome a un comportement strict avec le pointer capture).
     * - Le React onClick est en plus souvent absorbé.
     *
     * Approche fiable :
     * - pointerdown sur l'image : record (x, y, t)
     * - pointerup sur la window (capture phase) : on regarde si le
     *   point d'arrivée est dans l'image ET si la distance parcourue
     *   est < 10 px (un vrai clic). Si oui, on calcule les coords
     *   relatives et on appelle onPlanClick.
     *
     * Marche identiquement souris (Chrome desktop), trackpad, tactile.
     */
    useEffect(() => {
      if (!canEdit) return;
      const img = imgRef.current;
      if (!img) return;

      let downX: number | null = null;
      let downY: number | null = null;
      let downTime = 0;

      const onDown = (e: PointerEvent) => {
        // Souris : seul le bouton gauche
        if (e.pointerType === "mouse" && e.button !== 0) return;
        downX = e.clientX;
        downY = e.clientY;
        downTime = Date.now();
      };

      const onUp = (e: PointerEvent) => {
        if (downX === null || downY === null) return;
        const dx = e.clientX - downX;
        const dy = e.clientY - downY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const elapsed = Date.now() - downTime;
        downX = null;
        downY = null;

        if (dist > 10) return; // c'était un drag
        if (elapsed > 800) return; // long-press, on ignore

        // Vérifie que le up est dans le rectangle de l'image
        const rect = img.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          return;
        }
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        onPlanClickRef.current(x, y);
      };

      img.addEventListener("pointerdown", onDown);
      // window + capture : pour intercepter même quand le pointer
      // est captured par le wrapper de react-zoom-pan-pinch.
      window.addEventListener("pointerup", onUp, { capture: true });

      return () => {
        img.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp, { capture: true });
      };
    }, [canEdit, plan.url]);

    return (
      <div ref={wrapperRef} className="relative w-full bg-slate-100 dark:bg-slate-950">
        {canEdit && (
          <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 italic border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70">
            <MapPin size={12} className="inline mr-1" />
            Molette/pinch : zoom · Glisser : déplacer · Clic / tap : poser une puce
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
                className={`block max-w-none select-none ${
                  canEdit ? "cursor-crosshair" : ""
                }`}
                draggable={false}
              />

              {pins.map((p) => (
                <div
                  key={p.id}
                  data-pin-id={p.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${p.posX * 100}%`,
                    top: `${p.posY * 100}%`,
                  }}
                  title={`#${p.numero} — ${p.texte}`}
                >
                  <div
                    className={`relative flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 shadow-md ${
                      p.leveLe
                        ? "bg-green-500 border-green-700 text-white"
                        : "bg-red-500 border-red-700 text-white"
                    }`}
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
              ))}

              {draftPos && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${draftPos.x * 100}%`,
                    top: `${draftPos.y * 100}%`,
                  }}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 bg-amber-400 border-amber-600 text-white shadow-md animate-pulse">
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

