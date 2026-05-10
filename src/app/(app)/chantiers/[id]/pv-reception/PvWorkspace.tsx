"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Espace de travail unifié type Archipad : un seul plan visible à la
 * fois (sélection via onglets), zoom/pan, clic = puce, panneau latéral
 * qui liste toutes les réserves (avec filtrage par plan).
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
  const [activePlanId, setActivePlanId] = useState<string | null>(
    plans[0]?.id ?? null
  );
  const [filterCurrentPlan, setFilterCurrentPlan] = useState(true);
  const [showAddNoPlan, setShowAddNoPlan] = useState(false);

  // Si la liste de plans change (suppression, ajout) on resync l'actif
  useEffect(() => {
    if (!activePlanId && plans.length > 0) {
      setActivePlanId(plans[0].id);
    }
    if (activePlanId && !plans.find((p) => p.id === activePlanId)) {
      setActivePlanId(plans[0]?.id ?? null);
    }
  }, [plans, activePlanId]);

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;

  // Réserves à afficher dans le panneau latéral
  const visibleReserves = useMemo(() => {
    if (!filterCurrentPlan || !activePlanId) return reserves;
    return reserves.filter(
      (r) => r.planId === activePlanId || r.planId === null
    );
  }, [reserves, filterCurrentPlan, activePlanId]);

  // Pins du plan actif (pour superposer sur l'image)
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
            }))
        : [],
    [reserves, activePlan]
  );

  async function handleDeletePlan(planId: string) {
    if (
      !confirm(
        "Supprimer ce plan ? Les puces des réserves liées seront détachées."
      )
    ) {
      return;
    }
    try {
      await supprimerPlan(chantierId, planId);
      toast.success("Plan supprimé");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

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
                ? "Importez un PDF ou une image pour commencer à placer des puces de réserves."
                : ""}
            </p>
          </div>
        ) : activePlan ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
            {/* Viewer du plan actif */}
            <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
              <PlanCanvas
                key={activePlan.id}
                chantierId={chantierId}
                plan={activePlan}
                pins={activePins}
                canEdit={canEdit}
                nextNumero={reserves.length + 1}
              />
            </div>

            {/* Panneau latéral réserves */}
            <div className="bg-slate-50/50 dark:bg-slate-900/30 flex flex-col">
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <AlertTriangle size={14} className="inline mr-1" />
                  Réserves ({visibleReserves.length})
                </h3>
                {plans.length > 1 && (
                  <label className="text-xs text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterCurrentPlan}
                      onChange={(e) => setFilterCurrentPlan(e.target.checked)}
                    />
                    Plan actif
                  </label>
                )}
              </div>

              <div className="flex-1 max-h-[70vh] overflow-y-auto p-3">
                <CompactReserveList reserves={visibleReserves} />
              </div>

              {canEdit && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                  {!showAddNoPlan ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowAddNoPlan(true)}
                    >
                      <Plus size={14} /> Ajouter sans positionner sur le plan
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Nouvelle réserve (zone uniquement)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddNoPlan(false)}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="Annuler"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <ReserveForm
                        chantierId={chantierId}
                        onSuccess={() => setShowAddNoPlan(false)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </CardBody>

      {/* Liste détaillée en bas (avec photos) — réutilise ReserveList */}
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

/* ---------- Onglet de plan ---------- */
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
            active ? "hover:bg-white/20" : "hover:bg-slate-100 dark:hover:bg-slate-700"
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

/* ---------- Liste compacte des réserves (panneau latéral) ---------- */
function CompactReserveList({ reserves }: { reserves: ReserveItem[] }) {
  if (reserves.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center py-4">
        Aucune réserve.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {reserves.map((r) => {
        const lifted = !!r.leveLe;
        return (
          <li
            key={r.id}
            className={`flex items-start gap-2 p-2 rounded text-xs ${
              lifted
                ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            }`}
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
              <p className="text-slate-900 dark:text-slate-100 line-clamp-2">
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
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Le canvas zoomable / pannable + clic-puce ---------- */
function PlanCanvas({
  chantierId,
  plan,
  pins,
  canEdit,
  nextNumero,
}: {
  chantierId: string;
  plan: PlanItem;
  pins: {
    id: string;
    numero: number;
    posX: number;
    posY: number;
    texte: string;
    leveLe: Date | string | null;
  }[];
  canEdit: boolean;
  nextNumero: number;
}) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(
    null
  );

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    downPos.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: React.PointerEvent<HTMLImageElement>) {
    if (!canEdit) return;
    const start = downPos.current;
    downPos.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 5) return; // c'était un drag, pas un clic

    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setDraftPos({ x, y });
  }

  return (
    <div className="relative w-full bg-slate-100 dark:bg-slate-950">
      {canEdit && (
        <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 italic border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70">
          <MapPin size={12} className="inline mr-1" />
          Molette : zoom · Glisser : déplacer (toutes directions) · Clic court : poser une puce
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
          // Pas de verrou d'axe : libre dans toutes les directions
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
            // Pas de width:100% ! Le contenu garde sa taille naturelle
            // pour que le pan fonctionne dans les deux directions.
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
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            />

            {pins.map((p) => (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${p.posX * 100}%`,
                  top: `${p.posY * 100}%`,
                }}
                title={`#${p.numero} — ${p.texte}`}
              >
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 shadow-md ${
                    p.leveLe
                      ? "bg-green-500 border-green-700 text-white"
                      : "bg-red-500 border-red-700 text-white"
                  }`}
                >
                  {p.numero}
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
                  ?
                </div>
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Formulaire flottant en bas, ne quitte pas le viewer */}
      {canEdit && draftPos && (
        <div className="absolute left-2 right-2 bottom-2 max-w-md mx-auto bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Nouvelle réserve — puce #{nextNumero}
            </span>
            <button
              type="button"
              onClick={() => setDraftPos(null)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Annuler"
            >
              <X size={16} />
            </button>
          </div>
          <ReserveForm
            chantierId={chantierId}
            planId={plan.id}
            posX={draftPos.x}
            posY={draftPos.y}
            onSuccess={() => setDraftPos(null)}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Toolbar zoom (in/out/reset) ---------- */
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

