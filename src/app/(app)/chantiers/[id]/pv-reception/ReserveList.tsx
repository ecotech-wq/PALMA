"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, MapPin, CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  supprimerReserve,
  basculerLeveeReserve,
  retirerPhotoReserve,
} from "./actions";

type Reserve = {
  id: string;
  numero: number;
  texte: string;
  zone: string | null;
  lot?: string | null;
  dateLimite?: Date | string | null;
  photos: string[];
  planNom: string | null;
  hasPosition: boolean;
  leveLe: Date | string | null;
  leveNote: string | null;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function ReserveList({
  chantierId,
  reserves,
  canEdit,
}: {
  chantierId: string;
  reserves: Reserve[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleDelete(reserveId: string) {
    if (!confirm("Supprimer cette réserve et ses photos ?")) return;
    startTransition(async () => {
      try {
        await supprimerReserve(chantierId, reserveId);
        toast.success("Réserve supprimée");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleToggleLevee(reserveId: string) {
    startTransition(async () => {
      try {
        await basculerLeveeReserve(chantierId, reserveId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleRemovePhoto(reserveId: string, photoUrl: string) {
    if (!confirm("Retirer cette photo ?")) return;
    startTransition(async () => {
      try {
        await retirerPhotoReserve(chantierId, reserveId, photoUrl);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (reserves.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-4">
        Aucune réserve. Réception sans réserve.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {reserves.map((r) => {
        const lifted = !!r.leveLe;
        return (
          <li
            key={r.id}
            className={`rounded-md border p-3 ${
              lifted
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 ${
                  lifted
                    ? "bg-green-500 border-green-700 text-white"
                    : "bg-red-500 border-red-700 text-white"
                }`}
              >
                {r.numero}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
                  {r.texte}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                  {r.lot && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[10px] font-semibold">
                      {r.lot}
                    </span>
                  )}
                  {r.zone && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={10} /> {r.zone}
                    </span>
                  )}
                  {r.planNom && r.hasPosition && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={10} /> Sur plan « {r.planNom} »
                    </span>
                  )}
                  {r.dateLimite && !lifted && (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      Pour le {dateFmt.format(new Date(r.dateLimite))}
                    </span>
                  )}
                  {lifted && r.leveLe && (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                      <CheckCircle2 size={10} /> Levée le{" "}
                      {dateFmt.format(new Date(r.leveLe))}
                    </span>
                  )}
                </div>

                {r.photos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.photos.map((url) => (
                      <div key={url} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Photo réserve"
                          className="w-20 h-20 object-cover rounded border border-slate-200 dark:border-slate-800"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(r.id, url)}
                            className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                            aria-label="Retirer cette photo"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="shrink-0 flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleToggleLevee(r.id)}
                    title={lifted ? "Annuler la levée" : "Marquer comme levée"}
                    className={`p-1.5 rounded hover:bg-white/60 dark:hover:bg-slate-800 ${
                      lifted ? "text-green-700" : "text-slate-500"
                    }`}
                  >
                    {lifted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Circle size={16} />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(r.id)}
                    title="Supprimer"
                    className="p-1.5 rounded hover:bg-white/60 dark:hover:bg-slate-800 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
