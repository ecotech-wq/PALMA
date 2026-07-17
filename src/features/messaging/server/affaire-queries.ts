import "server-only";
import { db } from "@/lib/db";
import type { ChannelRef } from "../core/types";

/* -------------------------------------------------------------------------
 *  Canal d'une AFFAIRE (CRM) : requêtes serveur partagées.
 *
 *  Une affaire porte UN canal « Général » (chantierId null, affaireId
 *  renseigné), créé avec l'affaire par creerAffaire. Ce helper le relit,
 *  et le recrée au besoin pour les données antérieures (même tolérance
 *  que getOrCreateGeneral côté chantier). Utilisé par le fil
 *  /messagerie/affaire/[affaireId], ses routes API et postChantierMessage.
 * ----------------------------------------------------------------------- */

const channelSelect = {
  id: true,
  nom: true,
  visibility: true,
  ordre: true,
  archivedAt: true,
} as const;

/** Canal de l'affaire (le premier créé fait foi), créé s'il manque.
 *  Pas de contrainte unique côté base pour (affaireId, nom) : la course
 *  entre deux requêtes peut créer un doublon transitoire, mais le
 *  findFirst ordonné par createdAt reste déterministe. */
export async function getOrCreateCanalAffaire(
  affaireId: string
): Promise<ChannelRef> {
  const existant = await db.canal.findFirst({
    where: { affaireId },
    orderBy: { createdAt: "asc" },
    select: channelSelect,
  });
  if (existant) return existant;
  return db.canal.create({
    data: { affaireId, nom: "Général", visibility: "INTERNE", ordre: 0 },
    select: channelSelect,
  });
}
