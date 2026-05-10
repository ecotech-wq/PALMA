"use client";

import { useRef, useState } from "react";
import { Trash2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
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
 * Affiche un plan (image) avec les puces des réserves placées dessus.
 * En mode édition (admin et PV en brouillon), un clic sur le plan ouvre
 * le formulaire de création de réserve avec posX/posY pré-remplis.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setDraftPos({ x, y });
    setShowForm(true);
  }

  async function handleDeletePlan() {
    if (!confirm("Supprimer ce plan ? Les puces des réserves liées seront détachées.")) {
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
          Cliquez sur le plan à l&apos;endroit du défaut pour ajouter une réserve.
        </p>
      )}

      <div
        ref={containerRef}
        onClick={handleClick}
        className={`relative w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden ${
          canEdit ? "cursor-crosshair" : ""
        }`}
        style={{ minHeight: 200 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={plan.url}
          alt={plan.nom || "Plan"}
          className="block w-full h-auto select-none"
          draggable={false}
        />

        {/* Puces existantes */}
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

      {/* Formulaire de création de réserve, ouvert au clic */}
      {showForm && draftPos && (
        <div className="mt-2 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nouvelle réserve à cet endroit
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
