"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveUploadedDocument, deleteUploadedPhoto } from "@/lib/upload";
import { requireAuth, type CurrentUser } from "@/lib/auth-helpers";

/**
 * Garde d'accès des documents RH d'un ouvrier (CV, habilitations,
 * contrats, pièces d'identité, visites médicales) : réservé à
 * l'administrateur et au conducteur de travaux. Le chef de chantier et
 * les autres rôles n'y touchent pas.
 */
async function requireGestionDocsOuvrier(): Promise<CurrentUser> {
  const me = await requireAuth();
  if (!me.isAdmin && !me.isConducteur) {
    throw new Error(
      "Action réservée aux administrateurs et conducteurs de travaux"
    );
  }
  return me;
}

/**
 * Frontière d'espace pour UN ouvrier (même régime que actions.ts) :
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

const documentSchema = z.object({
  nom: z.string().optional().or(z.literal("")),
  categorie: z.enum([
    "CV",
    "HABILITATION",
    "CONTRAT",
    "IDENTITE",
    "MEDICAL",
    "AUTRE",
  ]),
  note: z.string().optional().or(z.literal("")),
});

export async function ajouterDocumentOuvrier(
  ouvrierId: string,
  formData: FormData
) {
  const me = await requireGestionDocsOuvrier();
  await verifierEspaceOuvrier(me, ouvrierId);

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Aucun fichier reçu");
  }
  const data = documentSchema.parse({
    nom: formData.get("nom"),
    categorie: formData.get("categorie") || "AUTRE",
    note: formData.get("note"),
  });

  const saved = await saveUploadedDocument(fichier, "docs-ouvriers");
  await db.ouvrierDocument.create({
    data: {
      ouvrierId,
      // Par défaut, on garde le nom d'origine du fichier (lisible),
      // pas le nom technique généré au stockage.
      nom: data.nom || saved.originalName,
      categorie: data.categorie,
      fichier: saved.url,
      mimeType: saved.mimeType,
      taille: saved.size,
      note: data.note || null,
      creePar: me.name,
    },
  });
  revalidatePath(`/ouvriers/${ouvrierId}`);
}

export async function supprimerDocumentOuvrier(id: string) {
  const me = await requireGestionDocsOuvrier();
  const doc = await db.ouvrierDocument.findUnique({
    where: { id },
    select: { id: true, ouvrierId: true, fichier: true },
  });
  if (!doc) return;
  await verifierEspaceOuvrier(me, doc.ouvrierId);
  // Efface aussi le fichier physique sous /uploads (helper générique,
  // déjà utilisé pour les photos : il est borné au dossier uploads).
  await deleteUploadedPhoto(doc.fichier);
  await db.ouvrierDocument.delete({ where: { id } });
  revalidatePath(`/ouvriers/${doc.ouvrierId}`);
}
