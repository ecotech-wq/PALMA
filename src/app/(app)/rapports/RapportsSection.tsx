"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wind,
  Users,
  Calendar,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { RapportForm } from "./RapportForm";
import {
  createRapport,
  updateRapport,
  deleteRapport,
} from "./actions";

type Rapport = {
  id: string;
  chantierId: string;
  date: Date;
  meteo:
    | "SOLEIL"
    | "NUAGEUX"
    | "PLUIE"
    | "ORAGE"
    | "NEIGE"
    | "GEL"
    | "VENT_FORT"
    | null;
  texte: string;
  photos: string[];
  nbOuvriers: number | null;
  authorName: string;
  authorId: string;
  createdAt: Date;
};

const meteoIconMap = {
  SOLEIL: { Icon: Sun, label: "Soleil", color: "text-yellow-600" },
  NUAGEUX: { Icon: Cloud, label: "Nuageux", color: "text-slate-500" },
  PLUIE: { Icon: CloudRain, label: "Pluie", color: "text-blue-500" },
  ORAGE: { Icon: CloudLightning, label: "Orage", color: "text-amber-600" },
  NEIGE: { Icon: Snowflake, label: "Neige", color: "text-cyan-500" },
  GEL: { Icon: Snowflake, label: "Gel", color: "text-cyan-700" },
  VENT_FORT: { Icon: Wind, label: "Vent fort", color: "text-slate-600" },
} as const;

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function RapportsSection({
  chantierId,
  rapports,
  currentUserId,
  isAdmin,
}: {
  chantierId: string;
  rapports: Rapport[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      {/* Bouton "Nouveau rapport" */}
      {!adding && (
        <div className="flex justify-end mb-3">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            <Plus size={14} /> Nouveau rapport
          </Button>
        </div>
      )}

      {/* Form de création */}
      {adding && (
        <div className="mb-4 p-3 sm:p-4 rounded-lg bg-brand-50/40 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-900">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Nouveau rapport
            </h3>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <RapportForm
            chantierId={chantierId}
            action={createRapport}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Liste */}
      {rapports.length === 0 && !adding ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic py-3">
          Aucun rapport pour ce chantier. Crée le premier pour partager
          l&apos;avancement.
        </p>
      ) : (
        <ul className="space-y-3">
          {rapports.map((r) =>
            editingId === r.id ? (
              <li
                key={r.id}
                className="p-3 sm:p-4 rounded-lg bg-amber-50/40 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    Modifier — {dateFmt.format(new Date(r.date))}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    aria-label="Annuler"
                  >
                    <X size={18} />
                  </button>
                </div>
                <RapportForm
                  chantierId={chantierId}
                  rapport={r}
                  action={updateRapport.bind(null, r.id)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <RapportRow
                key={r.id}
                rapport={r}
                canEdit={isAdmin || r.authorId === currentUserId}
                onEdit={() => {
                  setEditingId(r.id);
                  setAdding(false);
                }}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}

function RapportRow({
  rapport: r,
  canEdit,
  onEdit,
}: {
  rapport: Rapport;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const meteo = r.meteo ? meteoIconMap[r.meteo] : null;

  function onDelete() {
    if (!confirm("Supprimer ce rapport ?")) return;
    startTransition(async () => {
      try {
        await deleteRapport(r.id);
        toast.success("Rapport supprimé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <li
      id={`rapport-${r.id}`}
      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-slate-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100 capitalize">
            {dateFmt.format(new Date(r.date))}
          </span>
          {meteo && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${meteo.color}`}
              title={meteo.label}
            >
              <meteo.Icon size={14} /> {meteo.label}
            </span>
          )}
          {r.nbOuvriers !== null && r.nbOuvriers > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Users size={12} /> {r.nbOuvriers} ouvrier
              {r.nbOuvriers > 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            par {r.authorName}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              disabled={pending}
              className="text-slate-500 dark:text-slate-400 hover:text-brand-600 p-1.5"
              title="Modifier"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1.5"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Texte */}
      <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
        {r.texte}
      </div>

      {/* Photos en grille */}
      {r.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {r.photos.map((url, idx) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIdx(idx)}
              className="relative aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:ring-2 hover:ring-brand-300 transition"
            >
              <Image
                src={url}
                alt={`Photo ${idx + 1}`}
                fill
                sizes="(max-width: 640px) 33vw, 120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox simple */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
          <div className="relative w-full h-full max-w-5xl max-h-[90vh]">
            <Image
              src={r.photos[lightboxIdx]}
              alt={`Photo ${lightboxIdx + 1}`}
              fill
              className="object-contain"
              sizes="90vw"
            />
          </div>
          {r.photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm">
              {lightboxIdx + 1} / {r.photos.length}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
