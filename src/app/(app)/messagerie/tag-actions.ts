"use server";

// =====================================================
// v4.2 : application d'un tag du catalogue sur un message du fil.
// Le tag crée la fiche correspondante (adaptateur de @/features/tag-records),
// enregistre le lien bidirectionnel message <-> fiche (MessageTag + colonne
// de liaison historique du fil), puis poste un message système dans le même
// canal. Les droits viennent du catalogue fermé (@/features/tags).
// Câblage volontairement mince : toute la logique vit dans les briques.
// =====================================================

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { canApplyTag, getTagDefinition } from "@/features/tags";
import { getAdapter } from "@/features/tag-records";
import { insertSystemMessage } from "@/app/(app)/journal/actions";
import { notifyAdmins } from "@/lib/notifications";
import { audit } from "@/lib/audit";

const LIEN: Record<string, "tacheId" | "incidentId" | "reserveId"> = {
  tache: "tacheId",
  incident: "incidentId",
  reserve: "reserveId",
};

const TYPE_SYSTEME: Record<string, "SYSTEM_TACHE" | "SYSTEM_INCIDENT" | "SYSTEM_RESERVE"> = {
  tache: "SYSTEM_TACHE",
  incident: "SYSTEM_INCIDENT",
  reserve: "SYSTEM_RESERVE",
};

/** Routes à rafraîchir selon le module cible du tag. */
const ROUTES_MODULE: Record<string, string[]> = {
  tache: ["/planning"],
  incident: ["/incidents"],
  reserve: [],
};

export async function applyTagToMessage(messageId: string, tagCode: string) {
  const me = await requireAuth();

  const def = getTagDefinition(tagCode);
  if (!def) throw new Error(`Tag inconnu : « ${tagCode} ».`);
  if (!canApplyTag(me.role, def.code)) {
    throw new Error("Vous n'avez pas le droit de poser ce tag.");
  }

  const message = await db.journalMessage.findUnique({
    where: { id: messageId },
    include: { author: { select: { name: true } }, tags: true },
  });
  if (!message) throw new Error("Message introuvable.");
  await requireChantierAccess(me, message.chantierId);

  if (message.tags.some((t) => t.tagCode === def.code)) {
    throw new Error("Ce tag est déjà posé sur ce message.");
  }

  // 1. La fiche (l'adaptateur porte ses propres invariants et transactions)
  const adapter = getAdapter(def.code);
  const fiche = await adapter.createRecord({
    chantierId: message.chantierId,
    messageId: message.id,
    texte: message.texte ?? "",
    photos: message.photos,
    authorId: message.authorId,
    authorName: message.author?.name ?? me.name,
  });

  // 2. Le lien bidirectionnel (générique + colonne historique du fil)
  const colonne = LIEN[def.code];
  await db.$transaction([
    db.messageTag.create({
      data: {
        messageId: message.id,
        tagCode: def.code,
        taggedById: me.id,
        entity: fiche.entity,
        entityId: fiche.entityId,
      },
    }),
    db.journalMessage.update({
      where: { id: message.id },
      data: { [colonne]: fiche.entityId },
    }),
  ]);

  // 3. Trace dans le fil (même canal que le message d'origine) + notification
  await insertSystemMessage({
    chantierId: message.chantierId,
    type: TYPE_SYSTEME[def.code],
    texte: fiche.resume,
    authorId: me.id,
    canalId: message.canalId ?? undefined,
    ...(colonne === "tacheId" ? { tacheId: fiche.entityId } : {}),
    ...(colonne === "incidentId" ? { incidentId: fiche.entityId } : {}),
    ...(colonne === "reserveId" ? { reserveId: fiche.entityId } : {}),
  });
  if (!me.isAdmin) {
    await notifyAdmins(
      def.code === "incident" ? "INCIDENT_OUVERT" : "AUTRE",
      `Tag #${def.code} posé par ${me.name}`,
      fiche.resume,
      fiche.url
    );
  }
  await audit(me, {
    action: "TAG_APPLIQUE",
    entity: fiche.entity,
    entityId: fiche.entityId,
    summary: `#${def.code} sur un message du fil : ${fiche.resume}`,
    metadata: { messageId: message.id, tagCode: def.code },
  });

  revalidatePath(`/messagerie/${message.chantierId}`);
  revalidatePath(`/chantiers/${message.chantierId}`);
  for (const r of ROUTES_MODULE[def.code] ?? []) revalidatePath(r);
  if (def.code === "reserve") {
    revalidatePath(`/chantiers/${message.chantierId}/pv-reception`);
  }

  return { url: fiche.url, resume: fiche.resume, entity: fiche.entity, entityId: fiche.entityId };
}
