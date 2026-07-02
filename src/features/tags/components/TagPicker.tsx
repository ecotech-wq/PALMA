"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Hash, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { listTagsForRole } from "../core/catalog";
import type { Role, TagCode } from "../core/types";
import { tagDotClass } from "./tag-colors";

/**
 * Menu listant les tags que le rôle courant est autorisé à appliquer
 * (dérivé du catalogue). Ne rend rien si le rôle n'a droit à aucun tag.
 * Le menu se ferme au clic extérieur, à la touche Échap et après
 * sélection.
 *
 * Pensé mobile d'abord : sous le point de rupture sm, le menu s'ouvre
 * en feuille fixée au bas de l'écran (utilisable au pouce) ; au-delà,
 * en menu ancré au déclencheur (vers le haut ou le bas selon
 * `direction`).
 *
 * Deux styles de déclencheur :
 *   - défaut : bouton "Tag" (formulaires, barres d'outils) ;
 *   - `compact` : puce discrète "+ <label>" façon maquette, à poser
 *     directement sous un message.
 */
export function TagPicker({
  role,
  onSelect,
  disabled,
  className,
  label = "Tag",
  compact = false,
  direction = "down",
}: {
  role: Role;
  onSelect: (code: TagCode) => void;
  disabled?: boolean;
  className?: string;
  /** Texte du déclencheur (ex. "Taguer"). */
  label?: string;
  /** Style puce discrète, pour l'inline sous un message. */
  compact?: boolean;
  /** Côté d'ouverture du menu ancré (écrans sm et plus). */
  direction?: "down" | "up";
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à la touche Échap, uniquement quand le menu est ouvert.
  useEffect(() => {
    if (!ouvert) return;
    const surClicExterieur = (e: MouseEvent) => {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", surClicExterieur);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClicExterieur);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  const tags = listTagsForRole(role);
  if (tags.length === 0) return null;

  const choisir = (code: TagCode) => {
    setOuvert(false);
    onSelect(code);
  };

  return (
    <div ref={conteneurRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className={
          compact
            ? "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-default px-2 text-[11px] text-muted-foreground transition-colors hover:border-solid hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {compact ? (
          <Plus aria-hidden className="h-3 w-3" />
        ) : (
          <Hash aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {label}
        {!compact && (
          <ChevronDown
            aria-hidden
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", ouvert && "rotate-180")}
          />
        )}
      </button>

      {ouvert && (
        <>
          {/* Voile mobile : rend la feuille modale et ferme au toucher */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOuvert(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/25 sm:hidden"
          />
          <div
            role="menu"
            className={cn(
              // Mobile : feuille fixe en bas d'écran, pleine largeur
              "fixed inset-x-3 bottom-3 z-50 rounded-lg border border-border-default bg-card p-1.5 shadow-xl",
              // sm+ : menu ancré au déclencheur
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:z-30 sm:w-64 sm:rounded-md sm:p-1 sm:shadow-lg",
              direction === "up"
                ? "sm:bottom-full sm:left-0 sm:top-auto sm:mb-1"
                : "sm:left-0 sm:top-full sm:mt-1"
            )}
            style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
          >
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:hidden">
              Ranger ce message dans une rubrique
            </div>
            {tags.map((tag) => (
              <button
                key={tag.code}
                type="button"
                role="menuitem"
                onClick={() => choisir(tag.code)}
                className="flex w-full items-start gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-subtle focus:outline-none focus:bg-subtle sm:py-1.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    // Point de couleur partagé avec TagChip (tokens de la charte uniquement).
                    tagDotClass(tag.code)
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">{tag.label}</span>
                  <span className="block text-xs text-muted-foreground">{tag.description}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
