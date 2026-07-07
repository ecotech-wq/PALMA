"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireEspaceCourant,
  requireChantierManager,
  espaceFilter,
  type CurrentUser,
} from "@/lib/auth-helpers";

// Gardes ajoutées (pré-existant : AUCUNE action de ce fichier n'était
// protégée ; tout compte authentifié, client compris, pouvait créer,
// modifier ou supprimer une équipe). Même niveau que les ouvriers :
// admin ou conducteur, borné à l'espace.

const equipeSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  chantierId: z.string().optional().or(z.literal("")),
});

/** Frontière d'espace pour UNE équipe (deny si autre entreprise). */
async function verifierEspaceEquipe(me: CurrentUser, id: string) {
  if (!me.espaceIds) return; // régime hérité, pas de bornage
  const eq = await db.equipe.findUnique({
    where: { id },
    select: { espaceId: true },
  });
  if (!eq || !eq.espaceId || !me.espaceIds.includes(eq.espaceId)) {
    throw new Error("Cette équipe n'appartient pas à votre espace");
  }
}

export async function createEquipe(formData: FormData) {
  const me = await requireAdminOrConducteur();
  // Socle espaces : une équipe naît rattachée à l'entreprise courante.
  const espace = requireEspaceCourant(me);
  const data = equipeSchema.parse({
    nom: formData.get("nom"),
    chantierId: formData.get("chantierId"),
  });
  if (data.chantierId) await requireChantierManager(me, data.chantierId);
  const created = await db.equipe.create({
    data: {
      nom: data.nom,
      chantierId: data.chantierId || null,
      espaceId: espace.id,
    },
  });
  revalidatePath("/equipes");
  redirect(`/equipes/${created.id}`);
}

export async function updateEquipe(id: string, formData: FormData) {
  const me = await requireAdminOrConducteur();
  await verifierEspaceEquipe(me, id);
  const data = equipeSchema.parse({
    nom: formData.get("nom"),
    chantierId: formData.get("chantierId"),
  });
  if (data.chantierId) await requireChantierManager(me, data.chantierId);
  await db.equipe.update({
    where: { id },
    data: { nom: data.nom, chantierId: data.chantierId || null },
  });
  revalidatePath("/equipes");
  revalidatePath(`/equipes/${id}`);
}

export async function deleteEquipe(id: string) {
  const me = await requireAdminOrConducteur();
  await verifierEspaceEquipe(me, id);
  await db.equipe.delete({ where: { id } });
  revalidatePath("/equipes");
  redirect("/equipes");
}

export async function affecterOuvrierAEquipe(ouvrierId: string, equipeId: string | null) {
  const me = await requireAdminOrConducteur();
  // L'ouvrier ET l'équipe cible doivent être dans l'espace de l'utilisateur.
  const ouvrier = await db.ouvrier.findFirst({
    where: { id: ouvrierId, ...espaceFilter(me) },
    select: { id: true },
  });
  if (!ouvrier) throw new Error("Ouvrier inconnu dans votre espace");
  if (equipeId) await verifierEspaceEquipe(me, equipeId);
  await db.ouvrier.update({
    where: { id: ouvrierId },
    data: { equipeId: equipeId || null },
  });
  revalidatePath("/equipes");
  if (equipeId) revalidatePath(`/equipes/${equipeId}`);
  revalidatePath("/ouvriers");
}
