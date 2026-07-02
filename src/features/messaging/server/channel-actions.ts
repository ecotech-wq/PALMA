"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import {
  GENERAL_CHANNEL_NAME,
  normalizeChannelName,
} from "../core/channel-policy";
import { isUniqueViolation } from "../core/db-errors";
import type { ChannelVisibility } from "../core/types";
import type { Role } from "@/generated/prisma/enums";

/* -------------------------------------------------------------------------
 *  Actions de gestion des canaux de messagerie (v4.2).
 *  Création / renommage / archivage : admin ou conducteur uniquement
 *  (cf. canCreateChannel dans core/channel-policy.ts). Pas de
 *  suppression : on archive, l'historique des messages reste intact.
 * ----------------------------------------------------------------------- */

const VISIBILITIES = [
  "INTERNE",
  "CLIENT",
  "SOUS_TRAITANT",
] as const satisfies readonly ChannelVisibility[];

const nomSchema = z
  .string()
  .trim()
  .min(1, "Le nom du canal est requis")
  .max(40, "Le nom du canal est limité à 40 caractères");

const createSchema = z.object({
  chantierId: z.string().min(1, "Chantier requis"),
  nom: nomSchema,
  visibility: z.enum(VISIBILITIES),
});

/**
 * Crée un canal sur un chantier. Le canal est placé en fin de liste
 * (ordre = max + 1). Le nom est unique par chantier : un doublon
 * (contrainte P2002) est remonté en message clair.
 */
export async function createChannel(
  chantierId: string,
  nom: string,
  visibility: ChannelVisibility
) {
  const me = await requireAdminOrConducteur();
  const data = createSchema.parse({ chantierId, nom, visibility });
  await requireChantierAccess(me, data.chantierId);

  // Doublon "humain" : la contrainte unique en base ne voit que
  // l'égalité stricte ; on refuse aussi "general" quand "Général"
  // existe déjà (casse, accents, espaces).
  const canon = normalizeChannelName(data.nom);
  const freres = await db.canal.findMany({
    where: { chantierId: data.chantierId, archivedAt: null },
    select: { nom: true },
  });
  if (freres.some((f) => normalizeChannelName(f.nom) === canon)) {
    throw new Error(
      `Un canal nommé "${data.nom}" existe déjà sur ce chantier`
    );
  }

  const last = await db.canal.aggregate({
    where: { chantierId: data.chantierId },
    _max: { ordre: true },
  });

  try {
    const canal = await db.canal.create({
      data: {
        chantierId: data.chantierId,
        nom: data.nom,
        visibility: data.visibility,
        ordre: (last._max.ordre ?? 0) + 1,
        createdById: me.id,
      },
    });

    // v4.3 : ensemencement des membres. INTERNE : toute l'équipe interne
    // du chantier. CLIENT : équipe interne + clients membres du chantier.
    // SOUS_TRAITANT : équipe interne seule, les externes sont invités à
    // la main. Le créateur est toujours membre.
    const rolesSeed: Role[] =
      data.visibility === "CLIENT"
        ? ["CONDUCTEUR", "CHEF", "CLIENT"]
        : ["CONDUCTEUR", "CHEF"];
    const membres = await db.chantierMembre.findMany({
      where: {
        chantierId: data.chantierId,
        user: { role: { in: rolesSeed }, status: "ACTIVE" },
      },
      select: { userId: true },
    });
    const seedIds = new Set(membres.map((m) => m.userId));
    seedIds.add(me.id);
    await db.canalMembre.createMany({
      data: [...seedIds].map((userId) => ({
        canalId: canal.id,
        userId,
        addedById: me.id,
      })),
      skipDuplicates: true,
    });

    revalidatePath(`/messagerie/${data.chantierId}`);
    return canal;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error(
        `Un canal nommé "${data.nom}" existe déjà sur ce chantier`
      );
    }
    throw e;
  }
}

/**
 * Renomme un canal. Le canal Général est protégé : c'est le canal de
 * repli des messages historiques, son nom sert de clé fonctionnelle
 * (cf. getOrCreateGeneral).
 */
export async function renameChannel(id: string, nom: string) {
  const me = await requireAdminOrConducteur();
  const cleaned = nomSchema.parse(nom);

  const canal = await db.canal.findUnique({
    where: { id },
    select: { id: true, chantierId: true, nom: true },
  });
  if (!canal) throw new Error("Canal introuvable");
  await requireChantierAccess(me, canal.chantierId);
  if (canal.nom === GENERAL_CHANNEL_NAME) {
    throw new Error("Le canal Général ne peut pas être renommé");
  }

  // Même garde anti-doublon "humain" qu'à la création (hors soi-même)
  const canon = normalizeChannelName(cleaned);
  const freres = await db.canal.findMany({
    where: { chantierId: canal.chantierId, archivedAt: null, id: { not: id } },
    select: { nom: true },
  });
  if (freres.some((f) => normalizeChannelName(f.nom) === canon)) {
    throw new Error(
      `Un canal nommé "${cleaned}" existe déjà sur ce chantier`
    );
  }

  try {
    const updated = await db.canal.update({
      where: { id },
      data: { nom: cleaned },
    });
    revalidatePath(`/messagerie/${canal.chantierId}`);
    return updated;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error(
        `Un canal nommé "${cleaned}" existe déjà sur ce chantier`
      );
    }
    throw e;
  }
}

/**
 * Archive un canal (pas de suppression : les messages restent en base
 * et le canal disparaît simplement des onglets). Idempotent : archiver
 * un canal déjà archivé ne change rien. Le canal Général, fil de repli
 * du chantier, n'est pas archivable.
 */
export async function archiveChannel(id: string) {
  const me = await requireAdminOrConducteur();

  const canal = await db.canal.findUnique({
    where: { id },
    select: { id: true, chantierId: true, nom: true, archivedAt: true },
  });
  if (!canal) throw new Error("Canal introuvable");
  await requireChantierAccess(me, canal.chantierId);
  if (canal.nom === GENERAL_CHANNEL_NAME) {
    throw new Error("Le canal Général ne peut pas être archivé");
  }
  if (canal.archivedAt) return canal;

  const updated = await db.canal.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  revalidatePath(`/messagerie/${canal.chantierId}`);
  return updated;
}
