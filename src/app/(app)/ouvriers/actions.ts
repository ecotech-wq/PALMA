"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPhoto, deleteUploadedPhoto } from "@/lib/upload";

const ouvrierSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  prenom: z.string().optional().or(z.literal("")),
  telephone: z.string().optional().or(z.literal("")),
  typeContrat: z.enum(["FIXE", "JOUR", "SEMAINE", "MOIS", "FORFAIT"]),
  tarifBase: z.coerce.number().nonnegative(),
  modePaie: z.enum(["JOUR", "SEMAINE", "MOIS"]),
  actif: z.coerce.boolean().optional(),
  equipeId: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

function parseOuvrier(formData: FormData) {
  const data = ouvrierSchema.parse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    telephone: formData.get("telephone"),
    typeContrat: formData.get("typeContrat") || "JOUR",
    tarifBase: formData.get("tarifBase") || 0,
    modePaie: formData.get("modePaie") || "MOIS",
    actif: formData.get("actif") === "on",
    equipeId: formData.get("equipeId"),
    notes: formData.get("notes"),
  });

  return {
    nom: data.nom,
    prenom: data.prenom || null,
    telephone: data.telephone || null,
    typeContrat: data.typeContrat,
    tarifBase: data.tarifBase,
    modePaie: data.modePaie,
    actif: data.actif ?? true,
    equipeId: data.equipeId || null,
    notes: data.notes || null,
  };
}

export async function createOuvrier(formData: FormData) {
  const data = parseOuvrier(formData);
  const photoFile = formData.get("photo") as File | null;
  let photo: string | null = null;
  if (photoFile && photoFile.size > 0) {
    photo = await saveUploadedPhoto(photoFile, "ouvriers");
  }
  const created = await db.ouvrier.create({ data: { ...data, photo } });
  revalidatePath("/ouvriers");
  redirect(`/ouvriers/${created.id}`);
}

export async function updateOuvrier(id: string, formData: FormData) {
  const data = parseOuvrier(formData);
  const photoFile = formData.get("photo") as File | null;
  const removePhoto = formData.get("removePhoto") === "1";

  const existing = await db.ouvrier.findUnique({ where: { id } });
  if (!existing) throw new Error("Ouvrier introuvable");

  let photo: string | null = existing.photo;
  if (removePhoto && existing.photo) {
    await deleteUploadedPhoto(existing.photo);
    photo = null;
  }
  if (photoFile && photoFile.size > 0) {
    if (existing.photo) await deleteUploadedPhoto(existing.photo);
    photo = await saveUploadedPhoto(photoFile, "ouvriers");
  }

  await db.ouvrier.update({ where: { id }, data: { ...data, photo } });
  revalidatePath("/ouvriers");
  revalidatePath(`/ouvriers/${id}`);
}

export async function deleteOuvrier(id: string) {
  const existing = await db.ouvrier.findUnique({ where: { id } });
  if (existing?.photo) await deleteUploadedPhoto(existing.photo);
  await db.ouvrier.delete({ where: { id } });
  revalidatePath("/ouvriers");
  redirect("/ouvriers");
}

/**
 * Bascule rapide actif / inactif depuis la liste des ouvriers ou
 * directement sur la fiche, sans passer par le formulaire complet.
 * Utile pour les ouvriers ponctuels qui ne travaillent qu'un jour : on
 * les active pour saisir leur pointage / paiement, puis on les
 * désactive pour qu'ils n'apparaissent plus dans le pointage du jour.
 */
export async function toggleOuvrierActif(id: string): Promise<boolean> {
  const o = await db.ouvrier.findUnique({
    where: { id },
    select: { actif: true },
  });
  if (!o) throw new Error("Ouvrier introuvable");
  const nextValue = !o.actif;
  await db.ouvrier.update({
    where: { id },
    data: { actif: nextValue },
  });
  revalidatePath("/ouvriers");
  revalidatePath(`/ouvriers/${id}`);
  revalidatePath("/pointage");
  revalidatePath("/paie");
  return nextValue;
}
