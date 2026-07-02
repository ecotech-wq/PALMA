import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth-helpers";
import {
  GENERAL_CHANNEL_NAME,
  visibleChannels,
} from "../core/channel-policy";
import { isUniqueViolation } from "../core/db-errors";
import type { ChannelRef } from "../core/types";

/* -------------------------------------------------------------------------
 *  Requêtes de lecture des canaux (server components uniquement).
 * ----------------------------------------------------------------------- */

const channelSelect = {
  id: true,
  nom: true,
  visibility: true,
  ordre: true,
  archivedAt: true,
} as const;

/**
 * Liste les canaux d'un chantier visibles par l'utilisateur : filtre
 * par rôle (cf. core/channel-policy.ts), exclut les archivés, trie par
 * ordre puis date de création.
 */
export async function listChannelsFor(
  user: CurrentUser,
  chantierId: string
): Promise<ChannelRef[]> {
  const canaux = await db.canal.findMany({
    where: { chantierId },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: channelSelect,
  });
  return visibleChannels(user.role, canaux);
}

/**
 * Retourne le canal Général du chantier, en le créant (INTERNE,
 * ordre 0) s'il n'existe pas encore. Tolère la course entre deux
 * requêtes simultanées via la contrainte unique (chantierId, nom).
 */
export async function getOrCreateGeneral(
  chantierId: string
): Promise<ChannelRef> {
  const existing = await db.canal.findUnique({
    where: { chantierId_nom: { chantierId, nom: GENERAL_CHANNEL_NAME } },
    select: channelSelect,
  });
  if (existing) return existing;

  try {
    return await db.canal.create({
      data: {
        chantierId,
        nom: GENERAL_CHANNEL_NAME,
        visibility: "INTERNE",
        ordre: 0,
      },
      select: channelSelect,
    });
  } catch (e) {
    // Course : un autre appel vient de le créer, on le relit.
    if (isUniqueViolation(e)) {
      const again = await db.canal.findUnique({
        where: { chantierId_nom: { chantierId, nom: GENERAL_CHANNEL_NAME } },
        select: channelSelect,
      });
      if (again) return again;
    }
    throw e;
  }
}
