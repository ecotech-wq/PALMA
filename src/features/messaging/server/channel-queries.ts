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
 * Liste les canaux d'un chantier visibles par l'utilisateur.
 * Deux couches (v4.3) :
 *  1. la classe de sécurité (rôle x visibilité, core/channel-policy.ts)
 *     et l'exclusion des archivés ;
 *  2. l'adhésion explicite (CanalMembre) : le Général est de droit pour
 *     l'équipe interne ; l'admin et le conducteur membre du chantier
 *     voient tous les canaux (ils les gèrent) ; les autres ne voient
 *     que les canaux dont ils sont membres.
 */
export async function listChannelsFor(
  user: CurrentUser,
  chantierId: string
): Promise<ChannelRef[]> {
  const canaux = await db.canal.findMany({
    where: { chantierId },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: {
      ...channelSelect,
      membres: { where: { userId: user.id }, select: { userId: true } },
    },
  });
  const parClasse = visibleChannels(user.role, canaux);

  let voitTout = user.isAdmin;
  if (!voitTout && user.isConducteur) {
    const membre = await db.chantierMembre.findUnique({
      where: { chantierId_userId: { chantierId, userId: user.id } },
      select: { id: true },
    });
    voitTout = membre !== null;
  }

  return parClasse
    .filter(
      (c) =>
        voitTout || c.nom === GENERAL_CHANNEL_NAME || c.membres.length > 0
    )
    .map(({ membres: _membres, ...ref }) => ref);
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
