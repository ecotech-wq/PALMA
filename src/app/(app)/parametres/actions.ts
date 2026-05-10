"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

const settingsSchema = z.object({
  joursParMois: z.coerce.number().min(20).max(31),
  joursParSemaine: z.coerce.number().min(5).max(7),
  modePaieDefault: z.enum(["ESPECES", "VIREMENT"]),
  nomEntreprise: z.string().optional().or(z.literal("")),
});

export async function updateAppSettings(formData: FormData) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Réservé aux administrateurs");
  }

  const data = settingsSchema.parse({
    joursParMois: formData.get("joursParMois"),
    joursParSemaine: formData.get("joursParSemaine"),
    modePaieDefault: formData.get("modePaieDefault"),
    nomEntreprise: formData.get("nomEntreprise"),
  });

  await db.appSettings.upsert({
    where: { id: "singleton" },
    update: {
      joursParMois: data.joursParMois,
      joursParSemaine: data.joursParSemaine,
      modePaieDefault: data.modePaieDefault,
      nomEntreprise: data.nomEntreprise || null,
    },
    create: {
      id: "singleton",
      joursParMois: data.joursParMois,
      joursParSemaine: data.joursParSemaine,
      modePaieDefault: data.modePaieDefault,
      nomEntreprise: data.nomEntreprise || null,
    },
  });

  // Revalide tous les écrans qui dépendent de ces paramètres
  revalidatePath("/parametres");
  revalidatePath("/paie");
  revalidatePath("/paie/nouveau");
  revalidatePath("/dashboard");
}
