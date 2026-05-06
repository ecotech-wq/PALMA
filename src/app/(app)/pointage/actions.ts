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
