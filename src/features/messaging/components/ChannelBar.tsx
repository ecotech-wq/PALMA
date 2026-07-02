"use client";

import { useState } from "react";
import { canCreateChannel } from "../core/channel-policy";
import type { ChannelRef } from "../core/types";
import { ChannelCreateDialog } from "./ChannelCreateDialog";
import { ChannelTabs } from "./ChannelTabs";

/**
 * Composition prête à l'emploi pour les server components : onglets +
 * dialogue de création. Un server component ne peut pas passer de
 * fonctions (hrefFor, onCreateClick) à un client component ; ce wrapper
 * ne reçoit donc que des données sérialisables et construit lui-même
 * les liens `${hrefBase}?canal=<id>`.
 */
export function ChannelBar({
  projectId,
  channels,
  activeId,
  hrefBase,
  user,
}: {
  projectId: string;
  channels: ChannelRef[];
  activeId?: string | null;
  /** Base d'URL du fil, ex. `/messagerie/${chantierId}`. */
  hrefBase: string;
  user: { isAdmin: boolean; isConducteur: boolean };
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const canCreate = canCreateChannel(user);

  return (
    <>
      <ChannelTabs
        channels={channels}
        activeId={activeId}
        hrefFor={(id) => `${hrefBase}?canal=${encodeURIComponent(id)}`}
        canCreate={canCreate}
        onCreateClick={() => setDialogOpen(true)}
      />
      <ChannelCreateDialog
        projectId={projectId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
