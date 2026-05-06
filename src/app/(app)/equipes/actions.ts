"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";

const equipeSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  chantierId: z.string().optional().or(z.literal("")),
});

export async function createEquipe(formData: FormData) {
  const data = equipeSchema.parse({
    nom: formData.get("nom"),
    chantierId: formData.get("chantierId"),
  });
  const created = await db.equipe.create({
    data: { nom: data.nom, chantierId: data.chantierId || null },
  });
  revalidatePath("/equipes");
  redirect(`/equipes/${created.id}`);
}

export async function updateEquipe(id: string, formData: FormData) {
  const data = equipeSchema.parse({
    nom: formData.get("nom"),
    chantierId: formData.get("chantierId"),
  });
  await db.equipe.update({
    where: { id },
    data: { nom: data.nom, chantierId: data.chantierId || null },
  });
  revalidatePath("/equipes");
  revalidatePath(`/equipes/${id}`);
}

export async function deleteEquipe(id: string) {
  await db.equipe.delete({ where: { id } });
  revalidatePath("/equipes");
  redirect("/equipes");
}

export async function affecterOuvrierAEquipe(ouvrierId: string, equipeId: string | null) {
  await db.ouvrier.update({
    where: { id: ouvrierId },
    data: { equipeId: equipeId || null },
  });
  revalidatePath("/equipes");
  if (equipeId) revalidatePath(`/equipes/${equipeId}`);
  revalidatePath("/ouvriers");
}
