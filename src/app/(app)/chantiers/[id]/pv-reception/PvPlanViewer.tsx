"use client";

import { useRef, useState } from "react";
import { Trash2, MapPin, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { ReserveForm } from "./ReserveForm";
import { supprimerPlan } from "./actions";

type Pin = {
  id: string;
  numero: number;
  posX: number;
  posY: number;
  texte: string;
  leveLe: Date | string | null;
};

/**
 * Affiche un plan (image) dans un conteneur zoomable / pannable.
 *
 * - Molette / pinch : zoom
 * - Drag : déplacement
 * - Clic court (sans drag) sur l'image : place une puce de réserve à
 *   l'endroit cliqué (en mode édition uniquement). Les coordonnées sont
 *   stockées en relatif (0..1) donc la puce reste fidèle au plan quoi
 *   qu'il arrive en zoom/pan.
 */
export function PvPlanViewer({
  chantierId,
  plan,
  pins,
  canEdit,
}: {
  chantierId: string;
  plan: { id: string; url: string; nom: string | null };
  pins: Pin[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    downPos.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: React.PointerEvent<HTMLImageElement>) {
    if (!canEdit) return;
    const start = downPos.current;
    downPos.current = null;
    if (!start) return;
    // Si l'utilisateur a glissé de plus de 5 px : c'était un pan, pas un clic
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 5) return;

    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setDraftPos({ x, y });
    setShowForm(true);
  }

  async function handleDeletePlan() {
    if (
      !confirm(
        "Supprimer ce plan ? Les puces des réserves liées seront détachées."
      )
    ) {
      return;
    }
    try {
      await supprimerPlan(chantierId, plan.id);
      toast.success("Plan supprimé");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {plan.nom || "Plan"}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleDeletePlan}
            className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> Supprimer le plan
          </button>
        )}
      </div>

      {canEdit && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          <MapPin size={12} className="inline mr-1" />
          Molette : zoom · Glisser : déplacer · Clic court : ajouter une puce
        </p>
      )}

      <div className="relative bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <TransformWrapper
          minScale={0.5}
          maxScale={8}
          initialScale={1}
          centerOnInit
          wheel={{ step: 0.2 }}
          doubleClick={{ disabled: false, mode: "zoomIn", step: 0.7 }}
          panning={{ velocityDisabled: true }}
        >
          <ZoomControls />
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "60vh", maxHeight: 700 }}
            contentStyle={{ width: "100%" }}
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

              {/* Puces existantes — sont à l'intérieur du
                  TransformComponent donc suivent le zoom/pan */}
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

              {/* Puce brouillon en cours de création */}
              {draftPos && showForm && (
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
      </div>

      {/* Formulaire de création de réserve */}
      {showForm && draftPos && (
        <div className="mt-2 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nouvelle réserve à cet endroit (puce {pins.length + 1})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setDraftPos(null);
              }}
            >
              Annuler
            </Button>
          </div>
          <ReserveForm
            chantierId={chantierId}
            planId={plan.id}
            posX={draftPos.x}
            posY={draftPos.y}
            onSuccess={() => {
              setShowForm(false);
              setDraftPos(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Petits boutons +/-/reset au-dessus du plan, utilisent le hook
 *  useControls fourni par react-zoom-pan-pinch. */
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
