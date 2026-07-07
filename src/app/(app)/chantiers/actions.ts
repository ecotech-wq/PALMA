"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";

const chantierSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  // Projets typés (VISION-LYNX-V4) : une étude BE est un Chantier de type
  // ETUDE. Le champ n'est proposé qu'à la création (figé ensuite).
  type: z.enum(["CHANTIER", "ETUDE"]).default("CHANTIER"),
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
    type: formData.get("type") || "CHANTIER",
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
    type: data.type,
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
  const me = await requireAdmin();
  const data = parseChantier(formData);
  const created = await db.chantier.create({ data });
  // Gabarit d'étude : canaux par défaut « conception » (interne) et
  // « client » (visible client), en plus du « Général » créé à la volée
  // par la messagerie. Un chantier garde son gabarit historique.
  if (data.type === "ETUDE") {
    await db.canal.createMany({
      data: [
        { chantierId: created.id, nom: "conception", visibility: "INTERNE", ordre: 1, createdById: me.id },
        { chantierId: created.id, nom: "client", visibility: "CLIENT", ordre: 2, createdById: me.id },
      ],
      skipDuplicates: true,
    });
    revalidatePath("/be");
    redirect(`/be/${created.id}`);
  }
  revalidatePath("/chantiers");
  redirect(`/chantiers/${created.id}`);
}

export async function updateChantier(id: string, formData: FormData) {
  const me = await requireAuth();
  const data = parseChantier(formData);
  // Sécurité : seul ADMIN ou CONDUCTEUR peut modifier le budget. Si
  // l'appelant ne voit pas les prix (CHEF, CLIENT), on force les valeurs
  // existantes en DB pour ignorer le payload.
  if (!me.canSeePrices) {
    const existing = await db.chantier.findUnique({
      where: { id },
      select: { budgetEspeces: true, budgetVirement: true },
    });
    if (existing) {
      data.budgetEspeces = Number(existing.budgetEspeces);
      data.budgetVirement = Number(existing.budgetVirement);
    }
  }
  // Le type de projet est figé après création : on l'écarte de la mise à
  // jour (le formulaire d'édition ne l'envoie pas, et zod remettrait le
  // défaut CHANTIER, ce qui requalifierait silencieusement une étude).
  const { type: _type, ...sansType } = data;
  void _type;
  await db.chantier.update({ where: { id }, data: sansType });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

export async function deleteChantier(id: string) {
  await requireAdmin();
  await db.chantier.delete({ where: { id } });
  revalidatePath("/chantiers");
  redirect("/chantiers");
}

/**
 * Archive un chantier (soft delete). Le chantier reste en base mais
 * disparaît des listes par défaut.
 */
export async function archiverChantier(id: string) {
  await requireAdmin();
  await db.chantier.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

/** Réouvre un chantier archivé. */
export async function reouvrirChantier(id: string) {
  await requireAdmin();
  await db.chantier.update({
    where: { id },
    data: { archivedAt: null },
  });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
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
