"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelRef, ChannelVisibility } from "../core/types";

/**
 * Barre d'onglets des canaux, affichée au-dessus du fil de messagerie.
 * Composant purement présentationnel : la liste reçue est déjà filtrée
 * par visibleChannels côté serveur.
 *
 * Navigation au choix du parent :
 *   - `hrefFor(id)` : chaque onglet est un lien (navigation URL) ;
 *   - sinon `onSelect(id)` : chaque onglet est un bouton (état local).
 */

/** Pastille discrète signalant les canaux ouverts aux externes. */
const VISIBILITY_BADGE: Record<ChannelVisibility, string | null> = {
  INTERNE: null,
  CLIENT: "client",
  SOUS_TRAITANT: "sous-traitant",
};

export function ChannelTabs({
  channels,
  activeId,
  hrefFor,
  onSelect,
  canCreate = false,
  onCreateClick,
}: {
  channels: ChannelRef[];
  activeId?: string | null;
  hrefFor?: (id: string) => string;
  onSelect?: (id: string) => void;
  canCreate?: boolean;
  onCreateClick?: () => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Canaux"
      className="flex items-end gap-1 overflow-x-auto border-b border-border-default px-1"
    >
      {channels.map((c) => {
        const active = c.id === activeId;
        const badge = VISIBILITY_BADGE[c.visibility];
        const tabClass = cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
          active
            ? "border-brand-500 bg-brand-500/10 font-medium text-brand-700"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        );
        const content = (
          <>
            <span className="max-w-[10rem] truncate">{c.nom}</span>
            {badge && (
              <span className="rounded-full border border-border-default bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            )}
          </>
        );
        if (hrefFor) {
          return (
            <Link
              key={c.id}
              role="tab"
              aria-selected={active}
              href={hrefFor(c.id)}
              className={tabClass}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(c.id)}
            className={tabClass}
          >
            {content}
          </button>
        );
      })}
      {canCreate && (
        <button
          type="button"
          onClick={onCreateClick}
          aria-label="Nouveau canal"
          className="mb-1 ml-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Canal</span>
        </button>
      )}
    </div>
  );
}
