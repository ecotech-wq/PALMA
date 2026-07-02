"use client";

import Link from "next/link";
import { Hash, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelRef, ChannelVisibility } from "../core/types";

/**
 * Liste verticale des canaux, façon rail latéral (maquette v4). Même
 * contrat que ChannelTabs : purement présentationnel, la liste reçue
 * est déjà filtrée par visibleChannels côté serveur. Utilisée sur les
 * écrans larges ; ChannelTabs reste la variante mobile (défilement
 * horizontal).
 */

const VISIBILITY_BADGE: Record<ChannelVisibility, string | null> = {
  INTERNE: null,
  CLIENT: "client",
  SOUS_TRAITANT: "sous-traitant",
};

export function ChannelList({
  channels,
  activeId,
  hrefFor,
  canCreate = false,
  onCreateClick,
  title = "Canaux",
}: {
  channels: ChannelRef[];
  activeId?: string | null;
  hrefFor: (id: string) => string;
  canCreate?: boolean;
  onCreateClick?: () => void;
  /** Intitulé de la section (petites capitales, comme la maquette). */
  title?: string;
}) {
  return (
    <nav aria-label={title} className="flex flex-col gap-1">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      {channels.map((c) => {
        const active = c.id === activeId;
        const badge = VISIBILITY_BADGE[c.visibility];
        return (
          <Link
            key={c.id}
            href={hrefFor(c.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              active
                ? "bg-brand-500/10 font-medium text-brand-700 dark:text-brand-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Hash
              size={14}
              className={cn(
                "shrink-0",
                active ? "text-brand-600" : "text-muted-foreground/70"
              )}
            />
            <span className="min-w-0 flex-1 truncate">{c.nom}</span>
            {badge && (
              <span className="shrink-0 rounded-full border border-border-default bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
      {canCreate && (
        <button
          type="button"
          onClick={onCreateClick}
          className="mt-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus size={14} className="shrink-0" />
          Nouveau canal
        </button>
      )}
    </nav>
  );
}
