import "server-only";
import { db } from "@/lib/db";

/**
 * Helper de suivi "lu / non lu" par ressource pour chaque utilisateur.
 *
 * Conventions de clé `resource` :
 *   - "chantier:<id>"  → messagerie d'un chantier
 *   - "incidents"      → liste globale des incidents
 *   - "demandes"       → liste globale des demandes matériel
 *
 * Tout événement (message, incident, demande...) créé APRÈS le
 * `lastReadAt` compte comme "non lu" pour cet utilisateur.
 */

/** Marque une ressource comme lue maintenant pour cet utilisateur. */
export async function markResourceRead(
  userId: string,
  resource: string
): Promise<void> {
  await db.userReadState.upsert({
    where: { userId_resource: { userId, resource } },
    update: { lastReadAt: new Date() },
    create: { userId, resource, lastReadAt: new Date() },
  });
}

/** Retourne le timestamp de dernière lecture pour une ressource.
 *  `null` si jamais consulté (tout est considéré non lu). */
export async function getLastReadAt(
  userId: string,
  resource: string
): Promise<Date | null> {
  const rs = await db.userReadState.findUnique({
    where: { userId_resource: { userId, resource } },
    select: { lastReadAt: true },
  });
  return rs?.lastReadAt ?? null;
}

/**
 * Compte les messages non lus pour un user sur l'ensemble de ses
 * chantiers accessibles. Renvoie { total, byChantier }.
 */
export async function unreadMessagerieFor(
  userId: string,
  chantierIds: string[] | null
): Promise<{ total: number; byChantier: Record<string, number> }> {
  if (chantierIds && chantierIds.length === 0) {
    return { total: 0, byChantier: {} };
  }

  // Charge les lastReadAt par chantier en une seule requête
  const reads = await db.userReadState.findMany({
    where: {
      userId,
      resource: { startsWith: "chantier:" },
    },
    select: { resource: true, lastReadAt: true },
  });
  const lastReadByChantier = new Map<string, Date>();
  for (const r of reads) {
    lastReadByChantier.set(r.resource.replace(/^chantier:/, ""), r.lastReadAt);
  }

  // Pour chaque chantier accessible, compte les messages créés
  // après lastReadAt (ou tous si jamais lu).
  const groups = await db.journalMessage.groupBy({
    by: ["chantierId"],
    where: {
      ...(chantierIds !== null ? { chantierId: { in: chantierIds } } : {}),
      // On exclut les messages dont l'utilisateur est l'auteur
      // (ses propres envois ne devraient pas s'incrémenter en non lu)
      NOT: { authorId: userId },
    },
    _max: { createdAt: true },
    _count: { _all: true },
  });

  let total = 0;
  const byChantier: Record<string, number> = {};

  for (const g of groups) {
    const lastRead = lastReadByChantier.get(g.chantierId);
    if (!lastRead) {
      // Jamais ouvert → tous les messages comptent comme non lus
      const c = await db.journalMessage.count({
        where: { chantierId: g.chantierId, NOT: { authorId: userId } },
      });
      byChantier[g.chantierId] = c;
      total += c;
      continue;
    }
    if (g._max.createdAt && g._max.createdAt > lastRead) {
      const c = await db.journalMessage.count({
        where: {
          chantierId: g.chantierId,
          createdAt: { gt: lastRead },
          NOT: { authorId: userId },
        },
      });
      byChantier[g.chantierId] = c;
      total += c;
    } else {
      byChantier[g.chantierId] = 0;
    }
  }

  return { total, byChantier };
}

/**
 * Compte les incidents "non lus" (créés après le lastReadAt sur
 * "incidents" pour cet utilisateur). On garde le filtre "OUVERT/EN_COURS"
 * en plus pour ne pas signaler des incidents déjà résolus.
 */
export async function unreadIncidentsFor(userId: string): Promise<number> {
  const lastRead = await getLastReadAt(userId, "incidents");
  return db.incident.count({
    where: {
      statut: { in: ["OUVERT", "EN_COURS"] },
      ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
    },
  });
}

/**
 * Compte les demandes "non lues" (créées après lastReadAt sur "demandes"
 * et toujours en statut DEMANDEE — c'est ce qui attend validation).
 */
export async function unreadDemandesFor(userId: string): Promise<number> {
  const lastRead = await getLastReadAt(userId, "demandes");
  return db.demandeMateriel.count({
    where: {
      statut: "DEMANDEE",
      ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
    },
  });
}
