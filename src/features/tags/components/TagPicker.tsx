"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { listTagsForRole } from "../core/catalog";
import type { Role, TagCode } from "../core/types";
import { tagDotClass } from "./tag-colors";

/**
 * Petit menu déroulant listant les tags que le rôle courant est autorisé à
 * appliquer (dérivé du catalogue). Ne rend rien si le rôle n'a droit à aucun
 * tag. Le menu se ferme au clic extérieur, à la touche Échap et après
 * sélection.
 */
export function TagPicker({
  role,
  onSelect,
  disabled,
  className,
}: {
  role: Role;
  onSelect: (code: TagCode) => void;
  disabled?: boolean;
  className?: string;
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
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Hash aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        Tag
        <ChevronDown
          aria-hidden
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", ouvert && "rotate-180")}
        />
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border-default bg-card p-1 shadow-lg"
        >
          {tags.map((tag) => (
            <button
              key={tag.code}
              type="button"
              role="menuitem"
              onClick={() => choisir(tag.code)}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-subtle focus:outline-none focus:bg-subtle"
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
      )}
    </div>
  );
}
