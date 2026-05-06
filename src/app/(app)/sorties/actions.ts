"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";

const sortieSchema = z.object({
  materielId: z.string().min(1, "Matériel requis"),
  equipeId: z.string().optional().or(z.literal("")),
  chantierId: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

export async function createSortie(formData: FormData) {
  const data = sortieSchema.parse({
    materielId: formData.get("materielId"),
    equipeId: formData.get("equipeId"),
    chantierId: formData.get("chantierId"),
    note: formData.get("note"),
  });

  if (!data.equipeId && !data.chantierId) {
    throw new Error("Affecte la sortie à au moins une équipe ou un chantier");
  }

  await db.$transaction([
    db.sortieMateriel.create({
      data: {
        materielId: data.materielId,
        equipeId: data.equipeId || null,
        chantierId: data.chantierId || null,
        note: data.note || null,
      },
    }),
    db.materiel.update({
      where: { id: data.materielId },
      data: { statut: "SORTI" },
    }),
  ]);

  revalidatePath("/sorties");
  revalidatePath("/materiel");
  if (data.equipeId) revalidatePath(`/equipes/${data.equipeId}`);
  if (data.chantierId) revalidatePath(`/chantiers/${data.chantierId}`);
  redirect("/sorties");
}

const retourSchema = z.object({
  etatRetour: z.enum(["BON", "USE", "CASSE", "MANQUANT"]),
  note: z.string().optional().or(z.literal("")),
});

export async function cloturerSortie(sortieId: string, formData: FormData) {
  const data = retourSchema.parse({
    etatRetour: formData.get("etatRetour") || "BON",
    note: formData.get("note"),
  });

  const sortie = await db.sortieMateriel.findUnique({ where: { id: sortieId } });
  if (!sortie) throw new Error("Sortie introuvable");
  if (sortie.dateRetour) throw new Error("Sortie déjà clôturée");

  const noteFinal = data.note ? `${sortie.note ? sortie.note + "\n" : ""}Retour: ${data.note}` : sortie.note;
  const newStatut = data.etatRetour === "CASSE" || data.etatRetour === "MANQUANT" ? "HS" : "DISPO";

  await db.$transaction([
    db.sortieMateriel.update({
      where: { id: sortieId },
      data: {
        dateRetour: new Date(),
        etatRetour: data.etatRetour,
        note: noteFinal,
      },
    }),
    db.materiel.update({
      where: { id: sortie.materielId },
      data: { statut: newStatut },
    }),
  ]);

  revalidatePath("/sorties");
  revalidatePath("/materiel");
  if (sortie.equipeId) revalidatePath(`/equipes/${sortie.equipeId}`);
  if (sortie.chantierId) revalidatePath(`/chantiers/${sortie.chantierId}`);
}
