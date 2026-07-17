/**
 * Brique messagerie (canaux) : point d'entrée public unique.
 *
 * À importer depuis des SERVER components / actions uniquement : le
 * barrel réexporte channel-queries.ts qui est marqué "server-only".
 * Les client components de l'application n'ont pas besoin d'importer
 * ce barrel : ils reçoivent ChannelBar / ChannelTabs déjà rendus par
 * une page serveur (les composants internes de la brique s'importent
 * entre eux en relatif).
 */

// Types et logique métier pure (core/)
export type {
  ChannelRef,
  ChannelRole,
  ChannelVisibility,
} from "./core/types";
export {
  GENERAL_CHANNEL_NAME,
  canCreateChannel,
  canSeeChannel,
  normalizeChannelName,
  visibleChannels,
} from "./core/channel-policy";
export { readResourceKey } from "./core/unread";

// Server actions (gestion des canaux)
export {
  archiveChannel,
  createChannel,
  renameChannel,
} from "./server/channel-actions";

// Requêtes serveur (lecture)
export { getOrCreateGeneral, listChannelsFor } from "./server/channel-queries";
export { getOrCreateCanalAffaire } from "./server/affaire-queries";

// Composants UI
export { ChannelBar } from "./components/ChannelBar";
export { ChannelCreateDialog } from "./components/ChannelCreateDialog";
export { ChannelList } from "./components/ChannelList";
export { ChannelTabs } from "./components/ChannelTabs";
