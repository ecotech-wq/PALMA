"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

const tacheSchema = z.object({
  chantierId: z.string().min(1),
  nom: z.string().min(1),
  description: z.string().optional().or(z.literal("")),
  equipeId: z.string().optional().or(z.literal("")),
  dateDebut: z.string().min(1),
  dateFin: z.string().min(1),
  avancement: z.coerce.number().int().min(0).max(100).default(0),
  statut: z.enum(["A_FAIRE", "EN_COURS", "TERMINEE", "BLOQUEE"]),
});

function parseTache(formData: FormData) {
  const data = tacheSchema.parse({
    chantierId: formData.get("chantierId"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    equipeId: formData.get("equipeId"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    avancement: formData.get("avancement") || 0,
    statut: formData.get("statut") || "A_FAIRE",
  });

  return {
    chantierId: data.chantierId,
    nom: data.nom,
    description: data.description || null,
    equipeId: data.equipeId || null,
    dateDebut: new Date(data.dateDebut),
    dateFin: new Date(data.dateFin),
    avancement: data.avancement,
    statut: data.statut,
  };
}

function extractDependances(formData: FormData): string[] {
  const ids = formData.getAll("dependances");
  return ids.map(String).filter(Boolean);
}

export async function createTache(formData: FormData) {
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }
  await db.tache.create({
    data: {
      ...data,
      ...(dependances.length > 0 && {
        dependances: { connect: dependances.map((id) => ({ id })) },
      }),
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${data.chantierId}`);
}

export async function updateTache(id: string, formData: FormData) {
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }
  // Empêche les auto-dépendances
  const filteredDeps = dependances.filter((depId) => depId !== id);

  const existing = await db.tache.findUnique({ where: { id } });
  await db.tache.update({
    where: { id },
    data: {
      ...data,
      dependances: {
        set: filteredDeps.map((depId) => ({ id: depId })),
      },
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${data.chantierId}`);
  if (existing && existing.chantierId !== data.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

export async function deleteTache(id: string) {
  const existing = await db.tache.findUnique({ where: { id } });
  await db.tache.delete({ where: { id } });
  revalidatePath("/planning");
  if (existing) revalidatePath(`/chantiers/${existing.chantierId}`);
}

export async function setAvancement(id: string, avancement: number) {
  const t = await db.tache.update({
    where: { id },
    data: {
      avancement,
      statut:
        avancement === 100
          ? "TERMINEE"
          : avancement > 0
          ? "EN_COURS"
          : "A_FAIRE",
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}
