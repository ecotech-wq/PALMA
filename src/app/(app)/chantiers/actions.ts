"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";

const chantierSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  adresse: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  dateDebut: z.string().optional().or(z.literal("")),
  dateFin: z.string().optional().or(z.literal("")),
  statut: z.enum(["PLANIFIE", "EN_COURS", "PAUSE", "TERMINE", "ANNULE"]),
  budgetEspeces: z.coerce.number().nonnegative().default(0),
  budgetVirement: z.coerce.number().nonnegative().default(0),
  chefId: z.string().optional().or(z.literal("")),
});

function parseChantier(formData: FormData) {
  const data = chantierSchema.parse({
    nom: formData.get("nom"),
    adresse: formData.get("adresse"),
    description: formData.get("description"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    statut: formData.get("statut") || "PLANIFIE",
    budgetEspeces: formData.get("budgetEspeces") || 0,
    budgetVirement: formData.get("budgetVirement") || 0,
    chefId: formData.get("chefId"),
  });

  return {
    nom: data.nom,
    adresse: data.adresse || null,
    description: data.description || null,
    dateDebut: data.dateDebut ? new Date(data.dateDebut) : null,
    dateFin: data.dateFin ? new Date(data.dateFin) : null,
    statut: data.statut,
    budgetEspeces: data.budgetEspeces,
    budgetVirement: data.budgetVirement,
    chefId: data.chefId || null,
  };
}

export async function createChantier(formData: FormData) {
  await requireAdmin();
  const data = parseChantier(formData);
  const created = await db.chantier.create({ data });
  revalidatePath("/chantiers");
  redirect(`/chantiers/${created.id}`);
}

export async function updateChantier(id: string, formData: FormData) {
  const me = await requireAuth();
  const data = parseChantier(formData);
  // Sécurité : un CHEF ne peut PAS modifier le budget. On force les
  // valeurs existantes en DB, ignorant le payload.
  if (!me.isAdmin) {
    const existing = await db.chantier.findUnique({
      where: { id },
      select: { budgetEspeces: true, budgetVirement: true },
    });
    if (existing) {
      data.budgetEspeces = Number(existing.budgetEspeces);
      data.budgetVirement = Number(existing.budgetVirement);
    }
  }
  await db.chantier.update({ where: { id }, data });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

export async function deleteChantier(id: string) {
  await requireAdmin();
  await db.chantier.delete({ where: { id } });
  revalidatePath("/chantiers");
  redirect("/chantiers");
}

export async function affecterEquipeAuChantier(equipeId: string, chantierId: string | null) {
  await db.equipe.update({
    where: { id: equipeId },
    data: { chantierId: chantierId || null },
  });
  revalidatePath("/chantiers");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/equipes");
}
