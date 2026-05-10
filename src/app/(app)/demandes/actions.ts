"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

const urgenceEnum = z.enum(["INFO", "ATTENTION", "URGENT"]);

const baseSchema = z.object({
  chantierId: z.string().min(1),
  description: z.string().min(1, "Description requise"),
  quantite: z.coerce.number().min(0.01, "Quantité positive requise"),
  unite: z.string().optional().or(z.literal("")),
  urgence: urgenceEnum,
  fournisseur: z.string().optional().or(z.literal("")),
});

/** Création d'une demande (chef ou admin). */
export async function createDemande(formData: FormData) {
  const me = await requireAuth();
  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    description: formData.get("description"),
    quantite: formData.get("quantite") || 1,
    unite: formData.get("unite") || "",
    urgence: formData.get("urgence") || "ATTENTION",
    fournisseur: formData.get("fournisseur") || "",
  });

  await db.demandeMateriel.create({
    data: {
      chantierId: data.chantierId,
      requesterId: me.id,
      description: data.description,
      quantite: data.quantite,
      unite: data.unite || null,
      urgence: data.urgence,
      fournisseur: data.fournisseur || null,
    },
  });

  revalidatePath("/demandes");
  revalidatePath(`/chantiers/${data.chantierId}`);
  redirect("/demandes");
}

/** Modifier une demande — auteur uniquement, et uniquement si DEMANDEE. */
export async function updateDemande(id: string, formData: FormData) {
  const me = await requireAuth();
  const existing = await db.demandeMateriel.findUnique({ where: { id } });
  if (!existing) throw new Error("Demande introuvable");
  if (!me.isAdmin && existing.requesterId !== me.id) {
    throw new Error("Réservé à l'auteur");
  }
  if (existing.statut !== "DEMANDEE") {
    throw new Error("Cette demande est déjà traitée et ne peut plus être modifiée");
  }

  const data = baseSchema.parse({
    chantierId: existing.chantierId,
    description: formData.get("description"),
    quantite: formData.get("quantite") || 1,
    unite: formData.get("unite") || "",
    urgence: formData.get("urgence") || "ATTENTION",
    fournisseur: formData.get("fournisseur") || "",
  });

  await db.demandeMateriel.update({
    where: { id },
    data: {
      description: data.description,
      quantite: data.quantite,
      unite: data.unite || null,
      urgence: data.urgence,
      fournisseur: data.fournisseur || null,
    },
  });

  revalidatePath("/demandes");
  revalidatePath(`/demandes/${id}`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}

const responseSchema = z.object({
  reponseNote: z.string().optional().or(z.literal("")),
});

/** Approuve la demande (admin). */
export async function approveDemande(id: string, formData: FormData) {
  const me = await requireAdmin();
  const data = responseSchema.parse({
    reponseNote: formData.get("reponseNote") || "",
  });
  const existing = await db.demandeMateriel.findUnique({ where: { id } });
  if (!existing) throw new Error("Demande introuvable");

  await db.demandeMateriel.update({
    where: { id },
    data: {
      statut: "APPROUVEE",
      reponseNote: data.reponseNote || null,
      approverId: me.id,
      approuveLe: new Date(),
    },
  });

  revalidatePath("/demandes");
  revalidatePath(`/demandes/${id}`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Refuse la demande (admin) — note de réponse requise. */
export async function refuseDemande(id: string, formData: FormData) {
  const me = await requireAdmin();
  const note = String(formData.get("reponseNote") ?? "").trim();
  if (!note) throw new Error("Note de refus requise (motif)");

  const existing = await db.demandeMateriel.findUnique({ where: { id } });
  if (!existing) throw new Error("Demande introuvable");

  await db.demandeMateriel.update({
    where: { id },
    data: {
      statut: "REFUSEE",
      reponseNote: note,
      approverId: me.id,
      approuveLe: new Date(),
    },
  });

  revalidatePath("/demandes");
  revalidatePath(`/demandes/${id}`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Marque la demande comme commandée (lien optionnel vers une commande existante). */
export async function markDemandeCommandee(
  id: string,
  commandeId?: string | null
) {
  await requireAdmin();
  const existing = await db.demandeMateriel.findUnique({ where: { id } });
  if (!existing) throw new Error("Demande introuvable");
  if (existing.statut !== "APPROUVEE") {
    throw new Error("La demande doit d'abord être approuvée");
  }

  await db.demandeMateriel.update({
    where: { id },
    data: {
      statut: "COMMANDEE",
      commandeId: commandeId ?? null,
    },
  });

  revalidatePath("/demandes");
  revalidatePath(`/demandes/${id}`);
  revalidatePath(`/chantiers/${existing.chantierId}`);
}

/** Suppression — admin partout, auteur si encore DEMANDEE. */
export async function deleteDemande(id: string) {
  const me = await requireAuth();
  const existing = await db.demandeMateriel.findUnique({ where: { id } });
  if (!existing) return;
  if (!me.isAdmin) {
    if (existing.requesterId !== me.id) {
      throw new Error("Réservé à l'auteur");
    }
    if (existing.statut !== "DEMANDEE") {
      throw new Error("Cette demande est déjà traitée");
    }
  }
  await db.demandeMateriel.delete({ where: { id } });
  revalidatePath("/demandes");
  revalidatePath(`/chantiers/${existing.chantierId}`);
  redirect("/demandes");
}
