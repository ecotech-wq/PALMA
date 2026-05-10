"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPhoto, deleteUploadedPhoto } from "@/lib/upload";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

const meteoEnum = z.enum([
  "SOLEIL",
  "NUAGEUX",
  "PLUIE",
  "ORAGE",
  "NEIGE",
  "GEL",
  "VENT_FORT",
]);

const baseSchema = z.object({
  chantierId: z.string().min(1),
  date: z.string().min(1),
  meteo: meteoEnum.optional().or(z.literal("")),
  texte: z.string().min(1, "Texte requis"),
  nbOuvriers: z.coerce.number().int().min(0).max(200).optional().or(z.nan()),
});

async function uploadPhotos(formData: FormData): Promise<string[]> {
  const files = formData.getAll("photos") as File[];
  const validFiles = files.filter((f) => f instanceof File && f.size > 0);
  if (validFiles.length === 0) return [];
  const urls: string[] = [];
  for (const f of validFiles) {
    try {
      const url = await saveUploadedPhoto(f, "rapports");
      urls.push(url);
    } catch (e) {
      // On laisse passer les photos qui échouent (mauvais format), on
      // n'arrête pas la sauvegarde du rapport
      console.error("Photo upload failed:", e);
    }
  }
  return urls;
}

/** Création d'un rapport (chef ou admin). */
export async function createRapport(formData: FormData) {
  const me = await requireAuth();
  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    date: formData.get("date"),
    meteo: formData.get("meteo") || "",
    texte: formData.get("texte"),
    nbOuvriers: formData.get("nbOuvriers"),
  });

  const photos = await uploadPhotos(formData);

  const rapport = await db.rapportChantier.create({
    data: {
      chantierId: data.chantierId,
      authorId: me.id,
      date: new Date(data.date + "T00:00:00.000Z"),
      meteo: data.meteo ? data.meteo : null,
      texte: data.texte,
      photos,
      nbOuvriers:
        typeof data.nbOuvriers === "number" && !isNaN(data.nbOuvriers)
          ? data.nbOuvriers
          : null,
    },
  });

  revalidatePath(`/chantiers/${data.chantierId}`);
  revalidatePath("/rapports");
  redirect(`/chantiers/${data.chantierId}#rapport-${rapport.id}`);
}

/** Edition d'un rapport — l'auteur ou un admin uniquement. */
export async function updateRapport(id: string, formData: FormData) {
  const me = await requireAuth();
  const existing = await db.rapportChantier.findUnique({ where: { id } });
  if (!existing) throw new Error("Rapport introuvable");
  if (!me.isAdmin && existing.authorId !== me.id) {
    throw new Error("Tu ne peux modifier que tes propres rapports");
  }

  const data = baseSchema.parse({
    chantierId: existing.chantierId,
    date: formData.get("date"),
    meteo: formData.get("meteo") || "",
    texte: formData.get("texte"),
    nbOuvriers: formData.get("nbOuvriers"),
  });

  // Photos : on conserve les existantes (plus celles à supprimer
  // explicitement) et on ajoute les nouvelles téléversées
  const photosToRemove = formData.getAll("removePhotos") as string[];
  const keptPhotos = existing.photos.filter(
    (p) => !photosToRemove.includes(p)
  );
  for (const removed of photosToRemove) {
    await deleteUploadedPhoto(removed);
  }
  const newPhotos = await uploadPhotos(formData);

  await db.rapportChantier.update({
    where: { id },
    data: {
      date: new Date(data.date + "T00:00:00.000Z"),
      meteo: data.meteo ? data.meteo : null,
      texte: data.texte,
      nbOuvriers:
        typeof data.nbOuvriers === "number" && !isNaN(data.nbOuvriers)
          ? data.nbOuvriers
          : null,
      photos: [...keptPhotos, ...newPhotos],
    },
  });

  revalidatePath(`/chantiers/${existing.chantierId}`);
  revalidatePath("/rapports");
}

/** Suppression — l'auteur ou un admin. */
export async function deleteRapport(id: string) {
  const me = await requireAuth();
  const existing = await db.rapportChantier.findUnique({ where: { id } });
  if (!existing) return;
  if (!me.isAdmin && existing.authorId !== me.id) {
    throw new Error("Tu ne peux supprimer que tes propres rapports");
  }
  // Nettoie les photos sur disque
  for (const p of existing.photos) {
    await deleteUploadedPhoto(p);
  }
  await db.rapportChantier.delete({ where: { id } });
  revalidatePath(`/chantiers/${existing.chantierId}`);
  revalidatePath("/rapports");
}

/** Suppression d'une photo individuelle d'un rapport (sans toucher au reste). */
export async function removeRapportPhoto(rapportId: string, photoUrl: string) {
  const me = await requireAuth();
  const existing = await db.rapportChantier.findUnique({
    where: { id: rapportId },
  });
  if (!existing) throw new Error("Rapport introuvable");
  if (!me.isAdmin && existing.authorId !== me.id) {
    throw new Error("Réservé à l'auteur ou aux admins");
  }
  if (!existing.photos.includes(photoUrl)) return;

  await deleteUploadedPhoto(photoUrl);
  await db.rapportChantier.update({
    where: { id: rapportId },
    data: { photos: existing.photos.filter((p) => p !== photoUrl) },
  });
  revalidatePath(`/chantiers/${existing.chantierId}`);
  revalidatePath("/rapports");
}

/** Réservé à l'admin : utile pour nettoyer en lot via /rapports admin */
export async function adminDeleteRapportsBulk(ids: string[]): Promise<number> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const rapports = await db.rapportChantier.findMany({
    where: { id: { in: ids } },
    select: { id: true, photos: true, chantierId: true },
  });
  for (const r of rapports) {
    for (const p of r.photos) {
      await deleteUploadedPhoto(p);
    }
  }
  const result = await db.rapportChantier.deleteMany({
    where: { id: { in: ids } },
  });
  for (const r of rapports) {
    revalidatePath(`/chantiers/${r.chantierId}`);
  }
  revalidatePath("/rapports");
  return result.count;
}
