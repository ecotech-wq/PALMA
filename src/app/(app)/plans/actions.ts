"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPlan, deleteUploadedPhoto } from "@/lib/upload";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";

const baseSchema = z.object({
  chantierId: z.string().min(1),
  nom: z.string().min(1, "Nom requis"),
  description: z.string().optional().or(z.literal("")),
});

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
  });

  await requireChantierAccess(me, data.chantierId);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Fichier requis");

  const saved = await saveUploadedPlan(file);

  await db.planChantier.create({
    data: {
      chantierId: data.chantierId,
      uploaderId: me.id,
      nom: data.nom,
      description: data.description || null,
      fileUrl: saved.url,
      mimeType: saved.mimeType,
      fileSize: saved.size,
    },
  });

  revalidatePath(`/chantiers/${data.chantierId}/plans`);
  revalidatePath(`/chantiers/${data.chantierId}`);
}

/** Suppression d'un plan — uploader ou admin uniquement. */
export async function deletePlan(id: string) {
  const me = await requireAuth();
  const existing = await db.planChantier.findUnique({ where: { id } });
  if (!existing) return;
  if (!me.isAdmin && existing.uploaderId !== me.id) {
    throw new Error("Réservé à l'auteur ou aux admins");
  }
  await deleteUploadedPhoto(existing.fileUrl);
  await db.planChantier.delete({ where: { id } });
  revalidatePath(`/chantiers/${existing.chantierId}/plans`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}
