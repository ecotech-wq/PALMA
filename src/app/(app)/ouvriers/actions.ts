"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedPhoto, deleteUploadedPhoto } from "@/lib/upload";
import {
  requireAdmin,
  requireAdminOrConducteur,
  requireEspaceCourant,
  espaceFilter,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { nombreProtege } from "@/lib/visibilite-guards";

/**
 * Frontière d'espace pour UN ouvrier (même régime que les chantiers) :
 * lève si l'ouvrier n'appartient pas à un espace de l'utilisateur.
 * Un espaceId NULL (ligne orpheline) est refusé : deny par défaut.
 */
async function verifierEspaceOuvrier(me: CurrentUser, id: string) {
  if (!me.espaceIds) return; // régime hérité, pas de bornage
  const o = await db.ouvrier.findUnique({
    where: { id },
    select: { espaceId: true },
  });
  if (!o || !o.espaceId || !me.espaceIds.includes(o.espaceId)) {
    throw new Error("Cet ouvrier n'appartient pas à votre espace");
  }
}

/** L'équipe choisie doit exister dans un espace de l'utilisateur. */
async function verifierEquipeDansEspace(me: CurrentUser, equipeId: string) {
  const eq = await db.equipe.findFirst({
    where: { id: equipeId, ...espaceFilter(me) },
    select: { id: true },
  });
  if (!eq) throw new Error("Équipe inconnue dans votre espace");
}

const ouvrierSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  prenom: z.string().optional().or(z.literal("")),
  telephone: z.string().optional().or(z.literal("")),
  typeContrat: z.enum(["FIXE", "JOUR", "SEMAINE", "MOIS", "FORFAIT"]),
  modePaie: z.enum(["JOUR", "SEMAINE", "MOIS"]),
  actif: z.coerce.boolean().optional(),
  equipeId: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

/**
 * tarifBase : champ PROTÉGÉ (audit 2026-07-17). Le formulaire ne l'émet
 * que pour l'admin (plus de hidden input à valeur réelle). Absent du
 * FormData ou appelant non admin -> undefined : Prisma ignore la clé à
 * l'update, la valeur existante est conservée.
 */
function parseOuvrier(formData: FormData, tarifAutorise: boolean) {
  const data = ouvrierSchema.parse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    telephone: formData.get("telephone"),
    typeContrat: formData.get("typeContrat") || "JOUR",
    modePaie: formData.get("modePaie") || "MOIS",
    actif: formData.get("actif") === "on",
    equipeId: formData.get("equipeId"),
    notes: formData.get("notes"),
  });

  return {
    nom: data.nom,
    prenom: data.prenom || null,
    telephone: data.telephone || null,
    typeContrat: data.typeContrat,
    tarifBase: nombreProtege(tarifAutorise, formData.get("tarifBase")),
    modePaie: data.modePaie,
    actif: data.actif ?? true,
    equipeId: data.equipeId || null,
    notes: data.notes || null,
  };
}

export async function createOuvrier(formData: FormData) {
  const me = await requireAdminOrConducteur();
  // Socle espaces : un ouvrier naît rattaché à l'entreprise courante.
  const espace = requireEspaceCourant(me);
  const parsed = parseOuvrier(formData, me.isAdmin);
  // À la création, un tarif absent (conducteur) vaut 0 : l'admin le fixe
  // ensuite depuis la fiche.
  const data = { ...parsed, tarifBase: parsed.tarifBase ?? 0 };
  if (data.equipeId) await verifierEquipeDansEspace(me, data.equipeId);
  const photoFile = formData.get("photo") as File | null;
  let photo: string | null = null;
  if (photoFile && photoFile.size > 0) {
    photo = await saveUploadedPhoto(photoFile, "ouvriers");
  }
  const created = await db.ouvrier.create({
    data: { ...data, photo, espaceId: espace.id },
  });
  revalidatePath("/ouvriers");
  redirect(`/ouvriers/${created.id}`);
}

export async function updateOuvrier(id: string, formData: FormData) {
  const me = await requireAdminOrConducteur();
  await verifierEspaceOuvrier(me, id);
  // Sécurité : seul l'ADMIN peut modifier le tarif. Pour les autres,
  // nombreProtege renvoie undefined même sur payload forgé et Prisma ne
  // touche pas à la colonne (valeur existante conservée).
  const data = parseOuvrier(formData, me.isAdmin);
  if (data.equipeId) await verifierEquipeDansEspace(me, data.equipeId);
  const photoFile = formData.get("photo") as File | null;
  const removePhoto = formData.get("removePhoto") === "1";

  const existing = await db.ouvrier.findUnique({ where: { id } });
  if (!existing) throw new Error("Ouvrier introuvable");

  let photo: string | null = existing.photo;
  if (removePhoto && existing.photo) {
    await deleteUploadedPhoto(existing.photo);
    photo = null;
  }
  if (photoFile && photoFile.size > 0) {
    if (existing.photo) await deleteUploadedPhoto(existing.photo);
    photo = await saveUploadedPhoto(photoFile, "ouvriers");
  }

  await db.ouvrier.update({ where: { id }, data: { ...data, photo } });
  revalidatePath("/ouvriers");
  revalidatePath(`/ouvriers/${id}`);
}

export async function deleteOuvrier(id: string) {
  const me = await requireAdmin();
  await verifierEspaceOuvrier(me, id);
  const existing = await db.ouvrier.findUnique({ where: { id } });
  if (existing?.photo) await deleteUploadedPhoto(existing.photo);
  await db.ouvrier.delete({ where: { id } });
  revalidatePath("/ouvriers");
  redirect("/ouvriers");
}

/**
 * Bascule rapide actif / inactif depuis la liste des ouvriers ou
 * directement sur la fiche, sans passer par le formulaire complet.
 * Utile pour les ouvriers ponctuels qui ne travaillent qu'un jour : on
 * les active pour saisir leur pointage / paiement, puis on les
 * désactive pour qu'ils n'apparaissent plus dans le pointage du jour.
 */
export async function toggleOuvrierActif(id: string): Promise<boolean> {
  // Garde ajoutée (pré-existant : action sans aucune garde). Même niveau
  // que la création/édition : admin ou conducteur, borné à l'espace.
  const me = await requireAdminOrConducteur();
  await verifierEspaceOuvrier(me, id);
  const o = await db.ouvrier.findUnique({
    where: { id },
    select: { actif: true },
  });
  if (!o) throw new Error("Ouvrier introuvable");
  const nextValue = !o.actif;
  await db.ouvrier.update({
    where: { id },
    data: { actif: nextValue },
  });
  revalidatePath("/ouvriers");
  revalidatePath(`/ouvriers/${id}`);
  revalidatePath("/pointage");
  revalidatePath("/paie");
  return nextValue;
}

/**
 * Bascule en lot (bulk) plusieurs ouvriers actif ou inactif en une
 * seule transaction. Utile pour gérer les saisons (activer toute une
 * équipe d'été, désactiver tous les ponctuels d'un coup).
 */
export async function bulkToggleOuvriers(
  ids: string[],
  actif: boolean
): Promise<number> {
  // Garde ajoutée (pré-existant : action sans aucune garde). Le filtre
  // d'espace borne le lot : les ids d'un autre espace sont ignorés.
  const me = await requireAdminOrConducteur();
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const result = await db.ouvrier.updateMany({
    where: { id: { in: ids }, ...espaceFilter(me) },
    data: { actif },
  });
  revalidatePath("/ouvriers");
  for (const id of ids) revalidatePath(`/ouvriers/${id}`);
  revalidatePath("/pointage");
  revalidatePath("/paie");
  return result.count;
}
