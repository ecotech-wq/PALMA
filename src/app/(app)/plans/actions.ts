"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPlan, deleteUploadedPhoto } from "@/lib/upload";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { insertSystemMessage } from "@/app/(app)/journal/actions";

const baseSchema = z.object({
  chantierId: z.string().min(1),
  nom: z.string().min(1, "Nom requis"),
  description: z.string().optional().or(z.literal("")),
  type: z.string().max(40, "Type trop long (40 caractères max)").optional().or(z.literal("")),
});

/** Normalise un type de plan saisi librement : espaces réduits, vide -> null
 *  (la liste de suggestions reste propre, sans doublons de frappe). */
function normaliserTypePlan(brut: string | undefined | null): string | null {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/**
 * Upload d'un plan / fichier d'aide pour les équipes terrain.
 * Accepte PDF, images, vidéos, fichiers CAO. Visible par tous les
 * users qui ont accès au chantier (admin, chef, client si assigné).
 */
export async function uploadPlan(formData: FormData) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Réservé aux admins et chefs");

  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    nom: formData.get("nom"),
    description: formData.get("description") || "",
    type: formData.get("type") || "",
  });

  await requireChantierAccess(me, data.chantierId);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Fichier requis");

  const saved = await saveUploadedPlan(file);

  const plan = await db.planChantier.create({
    data: {
      chantierId: data.chantierId,
      uploaderId: me.id,
      nom: data.nom,
      description: data.description || null,
      type: normaliserTypePlan(data.type),
      fileUrl: saved.url,
      mimeType: saved.mimeType,
      fileSize: saved.size,
    },
  });

  // Propagation dans la messagerie : si c'est une image, on attache la photo
  // au message ; sinon on met juste le nom du fichier dans le texte.
  const isImage = saved.mimeType.startsWith("image/");
  await insertSystemMessage({
    chantierId: data.chantierId,
    type: "SYSTEM_PLAN",
    texte: `📐 Plan ajouté : ${data.nom}${data.description ? "\n" + data.description : ""}${!isImage ? `\n→ ${saved.url}` : ""}`,
    authorId: me.id,
    photos: isImage ? [saved.url] : [],
  });
  revalidatePath(`/messagerie/${data.chantierId}`);

  // Évite l'avertissement de variable non utilisée si plus tard on lie le message au plan
  void plan;

  revalidatePath(`/chantiers/${data.chantierId}/plans`);
  revalidatePath(`/chantiers/${data.chantierId}`);
}

/**
 * Modification du type d'un plan existant : simple reclassement, ouvert à
 * quiconque peut déposer un plan sur ce chantier (mêmes gardes que
 * uploadPlan : non-client + accès chantier). Type vide = retiré.
 */
export async function modifierTypePlan(id: string, type: string) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Réservé aux admins et chefs");

  const existing = await db.planChantier.findUnique({
    where: { id },
    select: { id: true, chantierId: true },
  });
  if (!existing) throw new Error("Plan introuvable");
  await requireChantierAccess(me, existing.chantierId);

  const normalise = normaliserTypePlan(
    z.string().max(40, "Type trop long (40 caractères max)").parse(type)
  );
  await db.planChantier.update({
    where: { id },
    data: { type: normalise },
  });

  revalidatePath(`/chantiers/${existing.chantierId}/plans`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Suppression d'un plan — uploader ou admin uniquement. */
export async function deletePlan(id: string) {
  const me = await requireAuth();
  const existing = await db.planChantier.findUnique({ where: { id } });
  if (!existing) return;
  // Frontière d'espace et d'adhésion AVANT le droit de suppression (même
  // garde que modifierTypePlan) : sans elle, un admin d'un autre espace
  // pouvait supprimer n'importe quel plan par id forgé.
  await requireChantierAccess(me, existing.chantierId);
  if (!me.isAdmin && existing.uploaderId !== me.id) {
    throw new Error("Réservé à l'auteur ou aux admins");
  }
  await deleteUploadedPhoto(existing.fileUrl);
  await db.planChantier.delete({ where: { id } });
  revalidatePath(`/chantiers/${existing.chantierId}/plans`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}
