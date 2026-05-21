"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminOrConducteur } from "@/lib/auth-helpers";
import { insertSystemMessage } from "@/app/(app)/journal/actions";

const locationSchema = z.object({
  designation: z.string().min(1, "Désignation requise"),
  type: z.enum(["LOCATION", "PRET"]),
  fournisseurNom: z.string().min(1, "Fournisseur requis"),
  chantierId: z.string().optional().or(z.literal("")),
  dateDebut: z.string().min(1),
  dateFinPrevue: z.string().min(1),
  coutJour: z.coerce.number().nonnegative().default(0),
  coutTotal: z.coerce.number().nonnegative().default(0),
  note: z.string().optional().or(z.literal("")),
});

function parseLocation(formData: FormData) {
  const data = locationSchema.parse({
    designation: formData.get("designation"),
    type: formData.get("type") || "LOCATION",
    fournisseurNom: formData.get("fournisseurNom"),
    chantierId: formData.get("chantierId"),
    dateDebut: formData.get("dateDebut"),
    dateFinPrevue: formData.get("dateFinPrevue"),
    coutJour: formData.get("coutJour") || 0,
    coutTotal: formData.get("coutTotal") || 0,
    note: formData.get("note"),
  });

  return {
    designation: data.designation,
    type: data.type,
    fournisseurNom: data.fournisseurNom,
    chantierId: data.chantierId || null,
    dateDebut: new Date(data.dateDebut),
    dateFinPrevue: new Date(data.dateFinPrevue),
    coutJour: data.coutJour,
    coutTotal: data.coutTotal,
    note: data.note || null,
  };
}

export async function createLocation(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const data = parseLocation(formData);
  const created = await db.locationPret.create({ data });

  // Propagation dans la messagerie du chantier
  if (data.chantierId) {
    const dateFinStr = data.dateFinPrevue.toISOString().slice(0, 10);
    const typeLabel = data.type === "PRET" ? "Prêt" : "Location";
    await insertSystemMessage({
      chantierId: data.chantierId,
      type: "SYSTEM_LOCATION",
      texte: `🚚 ${typeLabel} démarré(e) : ${data.designation} chez ${data.fournisseurNom} — à rendre le ${dateFinStr}${data.coutJour > 0 ? ` · ${data.coutJour}€/jour` : ""}`,
      authorId: me.id,
    });
    revalidatePath(`/messagerie/${data.chantierId}`);
  }

  revalidatePath("/locations");
  if (data.chantierId) revalidatePath(`/chantiers/${data.chantierId}`);
  redirect(`/locations/${created.id}`);
}

export async function updateLocation(id: string, formData: FormData) {
  await requireAdminOrConducteur();
  const data = parseLocation(formData);
  const existing = await db.locationPret.findUnique({ where: { id } });
  await db.locationPret.update({ where: { id }, data });
  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  if (data.chantierId) revalidatePath(`/chantiers/${data.chantierId}`);
  if (existing?.chantierId && existing.chantierId !== data.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

const cloturerSchema = z.object({
  dateRetourReel: z.string().min(1),
  coutTotalFinal: z.coerce.number().nonnegative().optional(),
  note: z.string().optional().or(z.literal("")),
});

export async function cloturerLocation(id: string, formData: FormData) {
  const me = await requireAdminOrConducteur();
  const data = cloturerSchema.parse({
    dateRetourReel: formData.get("dateRetourReel"),
    coutTotalFinal: formData.get("coutTotalFinal"),
    note: formData.get("note"),
  });

  const existing = await db.locationPret.findUnique({ where: { id } });
  if (!existing) throw new Error("Introuvable");

  const updateData: {
    dateRetourReel: Date;
    cloture: boolean;
    coutTotal?: number;
    note?: string;
  } = {
    dateRetourReel: new Date(data.dateRetourReel),
    cloture: true,
  };

  if (data.coutTotalFinal !== undefined && data.coutTotalFinal > 0) {
    updateData.coutTotal = data.coutTotalFinal;
  }
  if (data.note) {
    updateData.note = `${existing.note ? existing.note + "\n" : ""}Retour: ${data.note}`;
  }

  await db.locationPret.update({ where: { id }, data: updateData });

  // Propagation dans la messagerie
  if (existing.chantierId) {
    const typeLabel = existing.type === "PRET" ? "Prêt" : "Location";
    const finalCost =
      updateData.coutTotal ?? Number(existing.coutTotal);
    await insertSystemMessage({
      chantierId: existing.chantierId,
      type: "SYSTEM_LOCATION_FIN",
      texte: `🏁 ${typeLabel} restitué(e) : ${existing.designation} (${existing.fournisseurNom})${finalCost > 0 ? ` · total ${finalCost}€` : ""}${data.note ? "\n" + data.note : ""}`,
      authorId: me.id,
    });
    revalidatePath(`/messagerie/${existing.chantierId}`);
  }

  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  if (existing.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
}

export async function deleteLocation(id: string) {
  await requireAdminOrConducteur();
  const existing = await db.locationPret.findUnique({ where: { id } });
  await db.locationPret.delete({ where: { id } });
  revalidatePath("/locations");
  if (existing?.chantierId) revalidatePath(`/chantiers/${existing.chantierId}`);
  redirect("/locations");
}
