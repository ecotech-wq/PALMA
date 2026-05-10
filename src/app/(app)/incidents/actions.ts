"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPhoto, deleteUploadedPhoto } from "@/lib/upload";
import { requireAuth } from "@/lib/auth-helpers";
import { notify, notifyAdmins } from "@/lib/notifications";

const categorieEnum = z.enum([
  "MATERIEL_MANQUANT",
  "PANNE",
  "METEO",
  "RETARD_FOURNISSEUR",
  "SECURITE",
  "ACCIDENT",
  "CONFLIT",
  "AUTRE",
]);

const graviteEnum = z.enum(["INFO", "ATTENTION", "URGENT"]);

const baseSchema = z.object({
  chantierId: z.string().optional().or(z.literal("")),
  titre: z.string().min(1, "Titre requis").max(200),
  description: z.string().min(1, "Description requise"),
  categorie: categorieEnum,
  gravite: graviteEnum,
});

async function uploadPhotos(formData: FormData): Promise<string[]> {
  const files = formData.getAll("photos") as File[];
  const validFiles = files.filter((f) => f instanceof File && f.size > 0);
  const urls: string[] = [];
  for (const f of validFiles) {
    try {
      urls.push(await saveUploadedPhoto(f, "incidents"));
    } catch (e) {
      console.error("Photo upload failed:", e);
    }
  }
  return urls;
}

/** Création d'un incident (admin ou chef). */
export async function createIncident(formData: FormData) {
  const me = await requireAuth();
  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    titre: formData.get("titre"),
    description: formData.get("description"),
    categorie: formData.get("categorie") || "AUTRE",
    gravite: formData.get("gravite") || "ATTENTION",
  });

  const photos = await uploadPhotos(formData);

  const incident = await db.incident.create({
    data: {
      chantierId: data.chantierId || null,
      reporterId: me.id,
      titre: data.titre,
      description: data.description,
      categorie: data.categorie,
      gravite: data.gravite,
      photos,
    },
  });

  // Notifie les admins (sauf si l'auteur est admin lui-même)
  if (!me.isAdmin) {
    await notifyAdmins(
      "INCIDENT_OUVERT",
      `Incident ${data.gravite === "URGENT" ? "URGENT" : "signalé"} — ${data.titre}`,
      `${me.name} a remonté un problème (${data.categorie.replaceAll("_", " ").toLowerCase()}).`,
      `/incidents/${incident.id}`
    );
  }

  revalidatePath("/incidents");
  if (data.chantierId) revalidatePath(`/chantiers/${data.chantierId}`);
  redirect(`/incidents/${incident.id}`);
}

/** Modifier un incident — auteur ou admin. */
export async function updateIncident(id: string, formData: FormData) {
  const me = await requireAuth();
  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) throw new Error("Incident introuvable");
  if (!me.isAdmin && existing.reporterId !== me.id) {
    throw new Error("Tu ne peux modifier que tes propres incidents");
  }

  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    titre: formData.get("titre"),
    description: formData.get("description"),
    categorie: formData.get("categorie") || "AUTRE",
    gravite: formData.get("gravite") || "ATTENTION",
  });

  // Nouvelles photos à ajouter
  const newPhotos = await uploadPhotos(formData);
  // Photos à retirer
  const photosToRemove = formData.getAll("removePhotos") as string[];
  for (const r of photosToRemove) {
    await deleteUploadedPhoto(r);
  }
  const keptPhotos = existing.photos.filter(
    (p) => !photosToRemove.includes(p)
  );

  await db.incident.update({
    where: { id },
    data: {
      chantierId: data.chantierId || null,
      titre: data.titre,
      description: data.description,
      categorie: data.categorie,
      gravite: data.gravite,
      photos: [...keptPhotos, ...newPhotos],
    },
  });

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
  if (existing.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
  if (data.chantierId && data.chantierId !== existing.chantierId)
    revalidatePath(`/chantiers/${data.chantierId}`);
}

const resolveSchema = z.object({
  resolutionNote: z.string().min(1, "Note de résolution requise"),
});

/** Marque un incident résolu (admin uniquement). */
export async function resolveIncident(id: string, formData: FormData) {
  const me = await requireAuth();
  if (!me.isAdmin) {
    // Un chef peut marquer "EN_COURS" mais seul l'admin peut clôturer.
    throw new Error("Seul un admin peut clôturer un incident");
  }
  const data = resolveSchema.parse({
    resolutionNote: formData.get("resolutionNote"),
  });

  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) throw new Error("Incident introuvable");

  await db.incident.update({
    where: { id },
    data: {
      statut: "RESOLU",
      resolutionNote: data.resolutionNote,
      resolvedAt: new Date(),
      resolverId: me.id,
    },
  });

  // Notifie l'auteur que son incident est clos
  if (existing.reporterId !== me.id) {
    await notify(
      existing.reporterId,
      "INCIDENT_RESOLU",
      `Incident résolu — ${existing.titre}`,
      `${me.name} a clos l'incident.`,
      `/incidents/${id}`
    );
  }

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
  if (existing.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Repasse en cours un incident résolu (admin). */
export async function reopenIncident(id: string) {
  const me = await requireAuth();
  if (!me.isAdmin) throw new Error("Seul un admin peut rouvrir un incident");
  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) throw new Error("Incident introuvable");

  await db.incident.update({
    where: { id },
    data: {
      statut: "EN_COURS",
      resolutionNote: null,
      resolvedAt: null,
      resolverId: null,
    },
  });

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
  if (existing.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Bascule "OUVERT" → "EN_COURS" (chef ou admin). */
export async function setIncidentEnCours(id: string) {
  const me = await requireAuth();
  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) throw new Error("Incident introuvable");
  if (!me.isAdmin && existing.reporterId !== me.id) {
    throw new Error("Réservé à l'auteur ou aux admins");
  }
  await db.incident.update({
    where: { id },
    data: { statut: "EN_COURS" },
  });
  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
}

/** Suppression — admin ou auteur si encore OUVERT. */
export async function deleteIncident(id: string) {
  const me = await requireAuth();
  const existing = await db.incident.findUnique({ where: { id } });
  if (!existing) return;
  if (!me.isAdmin) {
    if (existing.reporterId !== me.id) {
      throw new Error("Réservé à l'auteur");
    }
    if (existing.statut !== "OUVERT") {
      throw new Error("Tu ne peux supprimer que les incidents non encore traités");
    }
  }
  for (const p of existing.photos) {
    await deleteUploadedPhoto(p);
  }
  await db.incident.delete({ where: { id } });

  revalidatePath("/incidents");
  if (existing.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
  redirect("/incidents");
}
