"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

const avanceSchema = z.object({
  montant: z.coerce.number().positive("Montant doit être positif"),
  date: z.string().min(1),
  mode: z.enum(["ESPECES", "VIREMENT"]),
  note: z.string().optional().or(z.literal("")),
});

export async function addAvance(ouvrierId: string, formData: FormData) {
  const data = avanceSchema.parse({
    montant: formData.get("montant"),
    date: formData.get("date"),
    mode: formData.get("mode") || "ESPECES",
    note: formData.get("note"),
  });
  await db.avance.create({
    data: {
      ouvrierId,
      montant: data.montant,
      date: new Date(data.date),
      mode: data.mode,
      note: data.note || null,
    },
  });
  revalidatePath(`/ouvriers/${ouvrierId}`);
  revalidatePath("/paie");
}

export async function deleteAvance(id: string, ouvrierId: string) {
  const av = await db.avance.findUnique({ where: { id } });
  if (av && !av.reglee) {
    await db.avance.delete({ where: { id } });
  }
  revalidatePath(`/ouvriers/${ouvrierId}`);
}

const outilSchema = z.object({
  nom: z.string().min(1),
  prixTotal: z.coerce.number().positive(),
  mensualite: z.coerce.number().positive(),
  dateAchat: z.string().min(1),
});

export async function addOutilPersonnel(ouvrierId: string, formData: FormData) {
  const data = outilSchema.parse({
    nom: formData.get("nom"),
    prixTotal: formData.get("prixTotal"),
    mensualite: formData.get("mensualite"),
    dateAchat: formData.get("dateAchat"),
  });
  if (data.mensualite > data.prixTotal) {
    throw new Error("La mensualité ne peut pas dépasser le prix total");
  }
  await db.outilPersonnel.create({
    data: {
      ouvrierId,
      nom: data.nom,
      prixTotal: data.prixTotal,
      mensualite: data.mensualite,
      restantDu: data.prixTotal,
      dateAchat: new Date(data.dateAchat),
    },
  });
  revalidatePath(`/ouvriers/${ouvrierId}`);
}

export async function deleteOutilPersonnel(id: string, ouvrierId: string) {
  const o = await db.outilPersonnel.findUnique({
    where: { id },
    include: { _count: { select: { retenues: true } } },
  });
  if (o && o._count.retenues === 0) {
    await db.outilPersonnel.delete({ where: { id } });
  }
  revalidatePath(`/ouvriers/${ouvrierId}`);
}
