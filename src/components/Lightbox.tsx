"use client";

import { useEffect, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ChevronLeft, ChevronRight, X, Download, MapPin, Clock } from "lucide-react";

export type PhotoMeta = {
  gpsLat: number | null;
  gpsLng: number | null;
  takenAt: Date | string | null;
};

/* -------------------------------------------------------------------------
 *  Lightbox réutilisable — zoom (molette/pinch), pan, navigation clavier
 *  (← →), fermeture ESC ou clic sur fond. Compteur 1/N quand plusieurs
 *  images. Bouton télécharger qui ouvre l'image dans un nouvel onglet.
 * ----------------------------------------------------------------------- */

const takenAtFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function Lightbox({
  images,
  startIndex = 0,
  onClose,
  metadata = {},
}: {
  images: string[];
  startIndex?: number;
  onClose: () => void;
  /** Métadonnées EXIF par URL (GPS, date de prise de vue). */
  metadata?: Record<string, PhotoMeta>;
}) {
  const [index, setIndex] = useState(startIndex);

  // Clamp si on reçoit un index hors borne
  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, images.length - 1)));
  }, [images.length]);

  // Clavier : ESC ferme, ← → navigue
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
      else if (e.key === "ArrowRight" && index < images.length - 1)
        setIndex(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose]);

  // Verrouille le scroll du body pendant l'ouverture
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (images.length === 0) return null;
  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;
  const meta = metadata[current];
  const hasGps =
    meta?.gpsLat !== null &&
    meta?.gpsLat !== undefined &&
    meta?.gpsLng !== null &&
    meta?.gpsLng !== undefined;
  const mapUrl = hasGps
    ? `https://www.openstreetmap.org/?mlat=${meta!.gpsLat}&mlon=${meta!.gpsLng}#map=18/${meta!.gpsLat}/${meta!.gpsLng}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Barre du haut : compteur + actions */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 text-white pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium tabular-nums bg-black/40 px-2 py-1 rounded pointer-events-auto">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
        </span>
        <div className="flex items-center gap-2 pointer-events-auto">
          <a
            href={current}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full bg-black/40 hover:bg-black/70 transition"
            title="Ouvrir l'image"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={18} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-black/40 hover:bg-black/70 transition"
            title="Fermer (ESC)"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Flèche gauche */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(index - 1);
          }}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition"
          aria-label="Image précédente"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Zone image zoomable */}
      <div
        className="w-full h-full flex items-center justify-center px-12 sm:px-16"
        onClick={(e) => e.stopPropagation()}
      >
        <TransformWrapper
          key={current}
          minScale={1}
          maxScale={6}
          doubleClick={{ mode: "toggle", step: 2 }}
          wheel={{ step: 0.2 }}
          panning={{ velocityDisabled: true }}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt=""
              decoding="async"
              draggable={false}
              className="max-w-full max-h-[90vh] object-contain select-none"
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Flèche droite */}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(index + 1);
          }}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition"
          aria-label="Image suivante"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Bandeau métadonnées EXIF (GPS / date de prise) */}
      {(hasGps || meta?.takenAt) && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 text-[11px] text-white bg-black/60 px-3 py-1.5 rounded-full pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {meta?.takenAt && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {takenAtFmt.format(new Date(meta.takenAt))}
            </span>
          )}
          {hasGps && mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-brand-300"
              title="Voir sur OpenStreetMap"
            >
              <MapPin size={12} />
              {meta!.gpsLat!.toFixed(5)}, {meta!.gpsLng!.toFixed(5)}
            </a>
          )}
        </div>
      )}

      {/* Indice d'usage (n'apparaît que sans métadonnées pour éviter le double bandeau) */}
      {!hasGps && !meta?.takenAt && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/60 pointer-events-none hidden sm:block"
          onClick={(e) => e.stopPropagation()}
        >
          Molette pour zoomer · Double-clic pour zoom rapide · ESC pour fermer
        </div>
      )}
    </div>
  );
}
