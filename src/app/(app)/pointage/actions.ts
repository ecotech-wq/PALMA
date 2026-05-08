"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

const entrySchema = z.object({
  ouvrierId: z.string().min(1),
  joursTravailles: z.coerce.number().min(0).max(2),
});

export async function savePointage(date: string, formData: FormData) {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) throw new Error("Date invalide");

  // Map<ouvrierId, jours>
  const entries = new Map<string, number>();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("jours_")) {
      const ouvrierId = key.slice("jours_".length);
      const parsed = entrySchema.safeParse({ ouvrierId, joursTravailles: value });
      if (parsed.success) {
        entries.set(parsed.data.ouvrierId, parsed.data.joursTravailles);
      }
    }
  }

  if (entries.size === 0) return;

  // Récupère l'équipe (et donc le chantier) de chaque ouvrier
  const ouvriers = await db.ouvrier.findMany({
    where: { id: { in: Array.from(entries.keys()) } },
    include: { equipe: { select: { chantierId: true } } },
  });

  await db.$transaction(async (tx) => {
    for (const ouvrier of ouvriers) {
      const jours = entries.get(ouvrier.id) ?? 0;
      const chantierId = ouvrier.equipe?.chantierId ?? null;

      if (jours <= 0) {
        // Suppression du pointage (absent)
        await tx.pointage.deleteMany({
          where: { ouvrierId: ouvrier.id, date: dateObj },
        });
      } else {
        await tx.pointage.upsert({
          where: { ouvrierId_date: { ouvrierId: ouvrier.id, date: dateObj } },
          update: { joursTravailles: jours, chantierId },
          create: {
            ouvrierId: ouvrier.id,
            date: dateObj,
            joursTravailles: jours,
            chantierId,
          },
        });
      }
    }
  });

  revalidatePath("/pointage");
  revalidatePath("/dashboard");
}

// =====================================================
// Edition / suppression d'un pointage individuel
// =====================================================

const updateSchema = z.object({
  joursTravailles: z.coerce.number().min(0.25).max(2),
  chantierId: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

export async function updatePointage(id: string, formData: FormData) {
  const data = updateSchema.parse({
    joursTravailles: formData.get("joursTravailles"),
    chantierId: formData.get("chantierId"),
    note: formData.get("note"),
  });

  const existing = await db.pointage.findUnique({
    where: { id },
    select: { ouvrierId: true },
  });
  if (!existing) throw new Error("Pointage introuvable");

  await db.pointage.update({
    where: { id },
    data: {
      joursTravailles: data.joursTravailles,
      chantierId: data.chantierId || null,
      note: data.note || null,
    },
  });

  revalidatePath("/pointage");
  revalidatePath(`/ouvriers/${existing.ouvrierId}`);
  revalidatePath("/dashboard");
}

// =====================================================
// Saisie sur une plage de dates pour UN ouvrier
// (rattrapage en fin de semaine, fin de mois, forfait, etc.)
// =====================================================

const rangeSchema = z.object({
  ouvrierId: z.string().min(1),
  dateDebut: z.string().min(1),
  dateFin: z.string().min(1),
  joursParJour: z.coerce.number().min(0.25).max(2),
  inclureWeekend: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.null()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
  chantierId: z.string().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
  ecraserExistants: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.null()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
});

export async function addPointagesRange(formData: FormData) {
  const data = rangeSchema.parse({
    ouvrierId: formData.get("ouvrierId"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    joursParJour: formData.get("joursParJour"),
    inclureWeekend: formData.get("inclureWeekend"),
    chantierId: formData.get("chantierId"),
    note: formData.get("note"),
    ecraserExistants: formData.get("ecraserExistants"),
  });

  // Construit toutes les dates concernées (UTC midnight, comme savePointage)
  const debut = new Date(data.dateDebut + "T00:00:00.000Z");
  const fin = new Date(data.dateFin + "T00:00:00.000Z");
  if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
    throw new Error("Dates invalides");
  }
  if (fin < debut) throw new Error("La date de fin doit être après le début");

  const dates: Date[] = [];
  const cursor = new Date(debut);
  while (cursor <= fin) {
    const dow = cursor.getUTCDay(); // 0 = dimanche, 6 = samedi
    const isWeekend = dow === 0 || dow === 6;
    if (data.inclureWeekend || !isWeekend) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (dates.length === 0) {
    throw new Error("Aucun jour à enregistrer dans cette plage");
  }

  // Récupère l'équipe/chantier pour pouvoir hériter du chantier si besoin
  const ouvrier = await db.ouvrier.findUnique({
    where: { id: data.ouvrierId },
    include: { equipe: { select: { chantierId: true } } },
  });
  if (!ouvrier) throw new Error("Ouvrier introuvable");

  const chantierId =
    (data.chantierId && data.chantierId.length > 0 ? data.chantierId : null) ??
    ouvrier.equipe?.chantierId ??
    null;

  await db.$transaction(async (tx) => {
    for (const d of dates) {
      const existing = await tx.pointage.findUnique({
        where: { ouvrierId_date: { ouvrierId: data.ouvrierId, date: d } },
      });
      if (existing && !data.ecraserExistants) {
        // Saute les jours déjà pointés (sécurité)
        continue;
      }
      await tx.pointage.upsert({
        where: { ouvrierId_date: { ouvrierId: data.ouvrierId, date: d } },
        update: {
          joursTravailles: data.joursParJour,
          chantierId,
          note: data.note || null,
        },
        create: {
          ouvrierId: data.ouvrierId,
          date: d,
          joursTravailles: data.joursParJour,
          chantierId,
          note: data.note || null,
        },
      });
    }
  });

  revalidatePath("/pointage");
  revalidatePath(`/ouvriers/${data.ouvrierId}`);
  revalidatePath("/dashboard");
}

export async function deletePointage(id: string) {
  const existing = await db.pointage.findUnique({
    where: { id },
    select: { ouvrierId: true },
  });
  if (!existing) return;

  await db.pointage.delete({ where: { id } });

  revalidatePath("/pointage");
  revalidatePath(`/ouvriers/${existing.ouvrierId}`);
  revalidatePath("/dashboard");
}
