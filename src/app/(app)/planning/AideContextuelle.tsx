"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton « ? » discret ouvrant un petit panneau d'aide flottant :
 * popover ancré au bouton sur desktop, feuille en bas d'écran sur
 * mobile. Fermeture au clic en dehors, à la touche Échap, ou via la
 * croix. Le panneau est positionné en `fixed` (coordonnées mesurées à
 * l'ouverture) pour ne pas être rogné par les conteneurs
 * `overflow-hidden` des vues Gantt et Calendrier.
 */
export function AideContextuelle({
  titre = "Aide",
  className,
  children,
}: {
  titre?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Ancrage desktop (null = feuille bas d'écran mobile).
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function basculer() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    const desktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches;
    setAnchor(
      desktop && rect
        ? {
            top: Math.min(rect.bottom + 6, window.innerHeight - 120),
            right: Math.max(8, window.innerWidth - rect.right),
          }
        : null
    );
    setOpen(true);
  }

  // Fermeture : Échap, ou pointeur en dehors du bouton et du panneau.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={basculer}
        aria-expanded={open}
        aria-label={titre}
        title={titre}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <HelpCircle size={15} />
      </button>

      {open && (
        <>
          {/* Voile (mobile seulement) : ferme au toucher en dehors */}
          {!anchor && (
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setOpen(false)}
            />
          )}
          <div
            role="dialog"
            aria-label={titre}
            className={cn(
              "fixed z-50 bg-white dark:bg-slate-900 shadow-xl",
              anchor
                ? "w-80 max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 dark:border-slate-700"
                : "inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 dark:border-slate-800"
            )}
            style={anchor ?? undefined}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {titre}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 -m-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Fermer l'aide"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-4 pb-4 pt-1 max-h-[55vh] overflow-y-auto text-xs leading-relaxed text-slate-600 dark:text-slate-400 space-y-1.5">
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
