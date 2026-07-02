"use client";

import { useState } from "react";
import { canCreateChannel } from "../core/channel-policy";
import type { ChannelRef } from "../core/types";
import { ChannelCreateDialog } from "./ChannelCreateDialog";
import { ChannelList } from "./ChannelList";
import { ChannelTabs } from "./ChannelTabs";

/**
 * Composition prête à l'emploi pour les server components : canaux +
 * dialogue de création. Un server component ne peut pas passer de
 * fonctions (hrefFor, onCreateClick) à un client component ; ce wrapper
 * ne reçoit donc que des données sérialisables et construit lui-même
 * les liens `${hrefBase}?canal=<id>`.
 *
 * Deux variantes d'affichage :
 *   - "tabs" (défaut) : onglets horizontaux, adaptés au mobile ;
 *   - "list"          : rail vertical, adapté aux écrans larges.
 */
export function ChannelBar({
  projectId,
  channels,
  activeId,
  hrefBase,
  user,
  variant = "tabs",
}: {
  projectId: string;
  channels: ChannelRef[];
  activeId?: string | null;
  /** Base d'URL du fil, ex. `/messagerie/${chantierId}`. */
  hrefBase: string;
  user: { isAdmin: boolean; isConducteur: boolean };
  variant?: "tabs" | "list";
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const canCreate = canCreateChannel(user);
  const hrefFor = (id: string) =>
    `${hrefBase}?canal=${encodeURIComponent(id)}`;

  return (
    <>
      {variant === "list" ? (
        <ChannelList
          channels={channels}
          activeId={activeId}
          hrefFor={hrefFor}
          canCreate={canCreate}
          onCreateClick={() => setDialogOpen(true)}
        />
      ) : (
        <ChannelTabs
          channels={channels}
          activeId={activeId}
          hrefFor={hrefFor}
          canCreate={canCreate}
          onCreateClick={() => setDialogOpen(true)}
        />
      )}
      <ChannelCreateDialog
        projectId={projectId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
