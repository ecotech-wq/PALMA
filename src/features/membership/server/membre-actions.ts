"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth-helpers";
import { canManageMembers, canJoinCanal } from "../core/membership-policy";
import { isChantierMembre } from "./membre-queries";
import { GENERAL_CHANNEL_NAME } from "@/features/messaging";

/* -------------------------------------------------------------------------
 *  Actions de gestion des membres (v4.3).
 *  Invitation et retrait : admin, ou conducteur membre du chantier.
 *  La borne dure canal (externe -> canal de sa classe uniquement) est
 *  appliquée ici, côté serveur : l'UI ne fait que la refléter.
 * ----------------------------------------------------------------------- */

async function requireGestionnaire(chantierId: string) {
  const me = await requireAuth();
  const membre = me.isConducteur
    ? await isChantierMembre(me.id, chantierId)
    : false;
  if (!canManageMembers(me, membre)) {
    throw new Error(
      "Seuls l'administrateur ou un conducteur membre du chantier gèrent les membres"
    );
  }
  return me;
}

/** Ajoute un utilisateur au chantier (idempotent). */
export async function addChantierMembre(chantierId: string, userId: string) {
  const me = await requireGestionnaire(chantierId);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new Error("Utilisateur introuvable ou inactif");
  }

  const membre = await db.chantierMembre.upsert({
    where: { chantierId_userId: { chantierId, userId } },
    update: {},
    create: { chantierId, userId, addedById: me.id },
  });

  // Études (projets typés) : l'arrivant rejoint d'office les canaux du
  // gabarit selon sa classe (mêmes règles d'ensemencement que createCanal),
  // sinon « conception » resterait invisible pour l'équipe (les canaux ne
  // sont montrés qu'à leurs membres). Limité aux ETUDES pour ne pas changer
  // la logique d'invitation des chantiers.
  const projet = await db.chantier.findUnique({
    where: { id: chantierId },
    select: { type: true, espaceId: true },
  });
  // Socle espaces : rejoindre un projet, c'est rejoindre son espace, sinon
  // le nouveau membre serait borné à néant et ne verrait pas le projet.
  // Rôle d'espace = rôle global de l'utilisateur (affinable ensuite).
  if (projet) {
    await db.espaceMembre.upsert({
      where: { espaceId_userId: { espaceId: projet.espaceId, userId } },
      update: {},
      create: { espaceId: projet.espaceId, userId, role: user.role },
    });
  }
  if (projet?.type === "ETUDE") {
    const canaux = await db.canal.findMany({
      where: { chantierId, archivedAt: null },
      select: { id: true, visibility: true },
    });
    const eligibles = canaux.filter((c) =>
      user.role === "CLIENT"
        ? c.visibility === "CLIENT"
        : user.role === "SOUS_TRAITANT"
          ? c.visibility === "SOUS_TRAITANT"
          : c.visibility === "INTERNE" || c.visibility === "CLIENT"
    );
    if (eligibles.length) {
      await db.canalMembre.createMany({
        data: eligibles.map((c) => ({
          canalId: c.id,
          userId,
          addedById: me.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  await audit(me, {
    action: "MEMBRE_AJOUTE",
    entity: "ChantierMembre",
    entityId: membre.id,
    summary: `${user.name} (${user.role}) ajouté au chantier`,
    metadata: { chantierId, userId },
  });
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath(`/messagerie/${chantierId}`);
  return membre;
}

/**
 * Retire un utilisateur du chantier. Retire aussi, en cascade
 * applicative, ses adhésions aux canaux de ce chantier (un ancien
 * membre ne doit plus lire aucun canal).
 */
export async function removeChantierMembre(chantierId: string, userId: string) {
  const me = await requireGestionnaire(chantierId);
  if (userId === me.id && !me.isAdmin) {
    throw new Error("Un conducteur ne se retire pas lui-même du chantier");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true },
  });

  await db.$transaction([
    db.canalMembre.deleteMany({
      where: { userId, canal: { chantierId } },
    }),
    db.chantierMembre.deleteMany({ where: { chantierId, userId } }),
  ]);

  await audit(me, {
    action: "MEMBRE_RETIRE",
    entity: "ChantierMembre",
    entityId: null,
    summary: `${user?.name ?? userId} retiré du chantier (et de ses canaux)`,
    metadata: { chantierId, userId },
  });
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath(`/messagerie/${chantierId}`);
}

/** Ajoute un membre du chantier à un canal, borne dure comprise. */
export async function addCanalMembre(canalId: string, userId: string) {
  const canal = await db.canal.findUnique({
    where: { id: canalId },
    select: { id: true, nom: true, visibility: true, chantierId: true },
  });
  if (!canal) throw new Error("Canal introuvable");
  const me = await requireGestionnaire(canal.chantierId);

  if (canal.nom === GENERAL_CHANNEL_NAME) {
    throw new Error(
      "Le canal Général est ouvert de droit à toute l'équipe du chantier"
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new Error("Utilisateur introuvable ou inactif");
  }

  // Borne dure : un externe ne rejoint que les canaux de sa classe.
  if (!canJoinCanal(user.role, canal.visibility)) {
    throw new Error(
      `Un compte ${user.role} ne peut pas être membre d'un canal ${canal.visibility}`
    );
  }

  // Il faut d'abord être membre du chantier.
  if (!(await isChantierMembre(userId, canal.chantierId))) {
    throw new Error(
      "Cette personne n'est pas membre du chantier : ajoutez-la d'abord à l'équipe"
    );
  }

  await db.canalMembre.upsert({
    where: { canalId_userId: { canalId, userId } },
    update: {},
    create: { canalId, userId, addedById: me.id },
  });

  await audit(me, {
    action: "CANAL_MEMBRE_AJOUTE",
    entity: "CanalMembre",
    entityId: `${canalId}:${userId}`,
    summary: `${user.name} ajouté au canal ${canal.nom}`,
    metadata: { canalId, userId, chantierId: canal.chantierId },
  });
  revalidatePath(`/messagerie/${canal.chantierId}`);
}

/** Retire un membre d'un canal (jamais du Général : il est de droit). */
export async function removeCanalMembre(canalId: string, userId: string) {
  const canal = await db.canal.findUnique({
    where: { id: canalId },
    select: { id: true, nom: true, chantierId: true },
  });
  if (!canal) throw new Error("Canal introuvable");
  const me = await requireGestionnaire(canal.chantierId);

  if (canal.nom === GENERAL_CHANNEL_NAME) {
    throw new Error("Le canal Général n'a pas de retraits : retirez du chantier");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  await db.canalMembre.deleteMany({ where: { canalId, userId } });

  await audit(me, {
    action: "CANAL_MEMBRE_RETIRE",
    entity: "CanalMembre",
    entityId: `${canalId}:${userId}`,
    summary: `${user?.name ?? userId} retiré du canal ${canal.nom}`,
    metadata: { canalId, userId, chantierId: canal.chantierId },
  });
  revalidatePath(`/messagerie/${canal.chantierId}`);
}
