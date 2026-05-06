"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPhoto, deleteUploadedPhoto } from "@/lib/upload";

const materielSchema = z.object({
  nomCommun: z.string().min(1, "Nom requis"),
  marque: z.string().optional().or(z.literal("")),
  modele: z.string().optional().or(z.literal("")),
  numeroSerie: z.string().optional().or(z.literal("")),
  statut: z.enum(["DISPO", "SORTI", "EN_LOCATION", "HS", "PERDU"]),
  possesseur: z.enum(["ENTREPRISE", "LOCATION", "PRET"]),
  prixAchat: z.coerce.number().nonnegative().optional().nullable(),
  dateAchat: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

function parseMaterielForm(formData: FormData) {
  const data = materielSchema.parse({
    nomCommun: formData.get("nomCommun"),
    marque: formData.get("marque"),
    modele: formData.get("modele"),
    numeroSerie: formData.get("numeroSerie"),
    statut: formData.get("statut") || "DISPO",
    possesseur: formData.get("possesseur") || "ENTREPRISE",
    prixAchat: formData.get("prixAchat") || null,
    dateAchat: formData.get("dateAchat"),
    notes: formData.get("notes"),
  });
  return {
    nomCommun: data.nomCommun,
    marque: data.marque || null,
    modele: data.modele || null,
    numeroSerie: data.numeroSerie || null,
    statut: data.statut,
    possesseur: data.possesseur,
    prixAchat: data.prixAchat ?? null,
    dateAchat: data.dateAchat ? new Date(data.dateAchat) : null,
    notes: data.notes || null,
  };
}

export async function createMateriel(formData: FormData) {
  const parsed = parseMaterielForm(formData);
  const photoFile = formData.get("photo") as File | null;

  let photoPath: string | null = null;
  if (photoFile && photoFile.size > 0) {
    photoPath = await saveUploadedPhoto(photoFile, "materiel");
  }

  const created = await db.materiel.create({
    data: { ...parsed, photo: photoPath },
  });

  revalidatePath("/materiel");
  redirect(`/materiel/${created.id}`);
}

export async function updateMateriel(id: string, formData: FormData) {
  const parsed = parseMaterielForm(formData);
  const photoFile = formData.get("photo") as File | null;
  const removePhoto = formData.get("removePhoto") === "1";

  const existing = await db.materiel.findUnique({ where: { id } });
  if (!existing) throw new Error("Matériel introuvable");

  let photoPath: string | null = existing.photo;

  if (removePhoto && existing.photo) {
    await deleteUploadedPhoto(existing.photo);
    photoPath = null;
  }

  if (photoFile && photoFile.size > 0) {
    if (existing.photo) await deleteUploadedPhoto(existing.photo);
    photoPath = await saveUploadedPhoto(photoFile, "materiel");
  }

  await db.materiel.update({
    where: { id },
    data: { ...parsed, photo: photoPath },
  });

  revalidatePath("/materiel");
  revalidatePath(`/materiel/${id}`);
}

export async function deleteMateriel(id: string) {
  const existing = await db.materiel.findUnique({ where: { id } });
  if (existing?.photo) await deleteUploadedPhoto(existing.photo);
  await db.materiel.delete({ where: { id } });
  revalidatePath("/materiel");
  redirect("/materiel");
}

const accessoireSchema = z.object({
  type: z.string().min(1),
  nom: z.string().min(1),
  quantite: z.coerce.number().int().min(1).default(1),
  note: z.string().optional().or(z.literal("")),
});

export async function addAccessoire(materielId: string, formData: FormData) {
  const data = accessoireSchema.parse({
    type: formData.get("type"),
    nom: formData.get("nom"),
    quantite: formData.get("quantite") || 1,
    note: formData.get("note"),
  });
  await db.accessoire.create({
    data: {
      materielId,
      type: data.type,
      nom: data.nom,
      quantite: data.quantite,
      note: data.note || null,
    },
  });
  revalidatePath(`/materiel/${materielId}`);
}

export async function deleteAccessoire(id: string, materielId: string) {
  await db.accessoire.delete({ where: { id } });
  revalidatePath(`/materiel/${materielId}`);
}
