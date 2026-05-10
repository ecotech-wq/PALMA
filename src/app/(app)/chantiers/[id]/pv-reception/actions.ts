"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireAdmin,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";
import {
  saveUploadedPhoto,
  saveUploadedPlanImage,
  deleteUploadedPhoto,
} from "@/lib/upload";

/* -------------------------------------------------------------------------
 * PV : infos générales / cycle de vie
 * ----------------------------------------------------------------------- */

const updatePvSchema = z.object({
  dateReception: z.string().min(1, "Date requise"),
  texteRecap: z.string().optional().or(z.literal("")),
});

/** Crée le PV en brouillon s'il n'existe pas, ou met à jour les infos. */
export async function updatePvInfos(chantierId: string, formData: FormData) {
  await requireAdmin();
  const data = updatePvSchema.parse({
    dateReception: formData.get("dateReception"),
    texteRecap: formData.get("texteRecap") || "",
  });
  await db.pvReception.upsert({
    where: { chantierId },
    update: {
      dateReception: new Date(data.dateReception + "T00:00:00.000Z"),
      texteRecap: data.texteRecap || null,
    },
    create: {
      chantierId,
      dateReception: new Date(data.dateReception + "T00:00:00.000Z"),
      texteRecap: data.texteRecap || null,
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/**
 * Supprime entièrement le PV : toutes les réserves, plans et photos
 * associés (cascade DB) et nettoyage des fichiers sur disque.
 */
export async function supprimerPv(chantierId: string) {
  await requireAdmin();
  const pv = await db.pvReception.findUnique({
    where: { chantierId },
    include: { plans: true, reserves: true },
  });
  if (!pv) return;

  // Nettoyage fichiers
  for (const p of pv.plans) {
    await deleteUploadedPhoto(p.url);
  }
  for (const r of pv.reserves) {
    for (const photo of r.photos) {
      await deleteUploadedPhoto(photo);
    }
  }
  await db.pvReception.delete({ where: { chantierId } });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
  redirect(`/chantiers/${chantierId}`);
}

/**
 * Réinitialise le PV en brouillon : supprime les signatures (admin,
 * client, levée). Permet à l'admin de corriger après envoi.
 */
export async function reinitialiserPv(chantierId: string) {
  await requireAdmin();
  await db.pvReception.update({
    where: { chantierId },
    data: {
      statut: "BROUILLON",
      signatureAdminUrl: null,
      signatureAdminLe: null,
      signatureClientUrl: null,
      signatureClientLe: null,
      reservesLeveeUrl: null,
      reservesLeveeLe: null,
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/* -------------------------------------------------------------------------
 * Plans (image uploadée pour placer les puces)
 * ----------------------------------------------------------------------- */

/** Upload un plan (image PNG/JPG/WEBP) sur le PV. */
export async function ajouterPlan(chantierId: string, formData: FormData) {
  await requireAdmin();
  const file = formData.get("plan") as File | null;
  const nom = String(formData.get("nom") || "").trim() || null;
  if (!file || file.size === 0) throw new Error("Aucun fichier");

  // On n'accepte que des images pour permettre la pose de puces.
  if (!file.type.startsWith("image/")) {
    throw new Error(
      "Seules les images (PNG/JPG/WEBP) sont acceptées pour permettre la pose de puces. Convertissez votre PDF en image au préalable."
    );
  }

  // S'assure que le PV existe
  const pv = await db.pvReception.upsert({
    where: { chantierId },
    update: {},
    create: { chantierId, dateReception: new Date() },
  });

  // Plans : on garde la pleine résolution (pas de resize), conversion webp
  const url = await saveUploadedPlanImage(file);
  const lastOrdre = await db.pvPlan.aggregate({
    where: { pvId: pv.id },
    _max: { ordre: true },
  });
  await db.pvPlan.create({
    data: {
      pvId: pv.id,
      url,
      nom,
      mimeType: file.type,
      ordre: (lastOrdre._max.ordre ?? -1) + 1,
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Supprime un plan et détache les réserves qui pointaient dessus. */
export async function supprimerPlan(chantierId: string, planId: string) {
  await requireAdmin();
  const plan = await db.pvPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  await deleteUploadedPhoto(plan.url);
  // Les réserves liées passent en planId=null via onDelete: SetNull,
  // mais on reset aussi posX/posY pour qu'elles ne gardent pas de
  // coordonnées orphelines.
  await db.pvReserve.updateMany({
    where: { planId },
    data: { planId: null, posX: null, posY: null },
  });
  await db.pvPlan.delete({ where: { id: planId } });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/* -------------------------------------------------------------------------
 * Réserves
 * ----------------------------------------------------------------------- */

const reserveSchema = z.object({
  texte: z.string().min(1, "Description requise"),
  zone: z.string().optional().or(z.literal("")),
  planId: z.string().optional().or(z.literal("")),
  posX: z.coerce.number().min(0).max(1).optional().or(z.literal("")),
  posY: z.coerce.number().min(0).max(1).optional().or(z.literal("")),
});

/** Crée une nouvelle réserve. Optionnellement liée à une position de plan. */
export async function ajouterReserve(chantierId: string, formData: FormData) {
  await requireAdmin();
  const parsed = reserveSchema.parse({
    texte: formData.get("texte"),
    zone: formData.get("zone") || "",
    planId: formData.get("planId") || "",
    posX: formData.get("posX") || "",
    posY: formData.get("posY") || "",
  });

  // S'assure que le PV existe
  const pv = await db.pvReception.upsert({
    where: { chantierId },
    update: {},
    create: { chantierId, dateReception: new Date() },
  });

  // Numérotation : prochain numéro
  const last = await db.pvReserve.aggregate({
    where: { pvId: pv.id },
    _max: { numero: true },
  });
  const nextNumero = (last._max.numero ?? 0) + 1;

  // Photos uploadées (peuvent être plusieurs)
  const files = formData.getAll("photos") as File[];
  const photoUrls: string[] = [];
  for (const f of files) {
    if (f && f.size > 0) {
      const url = await saveUploadedPhoto(f, "pv");
      photoUrls.push(url);
    }
  }

  await db.pvReserve.create({
    data: {
      pvId: pv.id,
      numero: nextNumero,
      texte: parsed.texte,
      zone: parsed.zone || null,
      planId: parsed.planId || null,
      posX: typeof parsed.posX === "number" ? parsed.posX : null,
      posY: typeof parsed.posY === "number" ? parsed.posY : null,
      photos: photoUrls,
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

const reserveUpdateSchema = z.object({
  texte: z.string().min(1, "Description requise"),
  zone: z.string().optional().or(z.literal("")),
});

/** Met à jour le texte / la zone d'une réserve. */
export async function modifierReserve(
  chantierId: string,
  reserveId: string,
  formData: FormData
) {
  await requireAdmin();
  const parsed = reserveUpdateSchema.parse({
    texte: formData.get("texte"),
    zone: formData.get("zone") || "",
  });

  // Photos additionnelles
  const files = formData.getAll("photos") as File[];
  const newPhotos: string[] = [];
  for (const f of files) {
    if (f && f.size > 0) {
      const url = await saveUploadedPhoto(f, "pv");
      newPhotos.push(url);
    }
  }

  const existing = await db.pvReserve.findUnique({
    where: { id: reserveId },
  });
  if (!existing) throw new Error("Réserve introuvable");

  await db.pvReserve.update({
    where: { id: reserveId },
    data: {
      texte: parsed.texte,
      zone: parsed.zone || null,
      photos: [...existing.photos, ...newPhotos],
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Retire une photo d'une réserve. */
export async function retirerPhotoReserve(
  chantierId: string,
  reserveId: string,
  photoUrl: string
) {
  await requireAdmin();
  const r = await db.pvReserve.findUnique({ where: { id: reserveId } });
  if (!r) return;
  await deleteUploadedPhoto(photoUrl);
  await db.pvReserve.update({
    where: { id: reserveId },
    data: { photos: r.photos.filter((p) => p !== photoUrl) },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Supprime entièrement une réserve. */
export async function supprimerReserve(chantierId: string, reserveId: string) {
  await requireAdmin();
  const r = await db.pvReserve.findUnique({ where: { id: reserveId } });
  if (!r) return;
  for (const photo of r.photos) {
    await deleteUploadedPhoto(photo);
  }
  await db.pvReserve.delete({ where: { id: reserveId } });

  // Renuméroter les réserves restantes pour garder une suite continue.
  const remaining = await db.pvReserve.findMany({
    where: { pvId: r.pvId },
    orderBy: { numero: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].numero !== i + 1) {
      await db.pvReserve.update({
        where: { id: remaining[i].id },
        data: { numero: i + 1 },
      });
    }
  }
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Marque une réserve comme levée (ou annule la levée). */
export async function basculerLeveeReserve(
  chantierId: string,
  reserveId: string,
  noteLevee?: string
) {
  await requireAdmin();
  const r = await db.pvReserve.findUnique({ where: { id: reserveId } });
  if (!r) return;
  await db.pvReserve.update({
    where: { id: reserveId },
    data: {
      leveLe: r.leveLe ? null : new Date(),
      leveNote: r.leveLe ? null : noteLevee || null,
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/* -------------------------------------------------------------------------
 * Signatures
 * ----------------------------------------------------------------------- */

/** L'admin signe et envoie le PV au client. */
export async function signPvAdmin(
  chantierId: string,
  signatureDataUrl: string
) {
  await requireAdmin();
  await db.pvReception.update({
    where: { chantierId },
    data: {
      signatureAdminUrl: signatureDataUrl,
      signatureAdminLe: new Date(),
      statut: "ENVOYE_CLIENT",
    },
  });

  const chantier = await db.chantier.findUnique({
    where: { id: chantierId },
    include: { clients: { select: { id: true } } },
  });
  if (chantier) {
    for (const c of chantier.clients) {
      await notify(
        c.id,
        "RAPPORT_CREE",
        `PV de réception — ${chantier.nom}`,
        "Un PV de réception est à signer.",
        `/chantiers/${chantierId}/pv-reception`
      );
    }
  }

  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Le client signe le PV. */
export async function signPvClient(
  chantierId: string,
  signatureDataUrl: string
) {
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);
  if (!me.isClient) {
    throw new Error("Seul un client peut signer ce PV");
  }
  const pv = await db.pvReception.findUnique({ where: { chantierId } });
  if (!pv) throw new Error("PV introuvable");
  if (pv.statut === "BROUILLON") {
    throw new Error("Le PV n'a pas encore été envoyé pour signature");
  }
  await db.pvReception.update({
    where: { chantierId },
    data: {
      signatureClientUrl: signatureDataUrl,
      signatureClientLe: new Date(),
      statut: "SIGNE_CLIENT",
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Le client signe la levée des réserves. */
export async function signLeveeReserves(
  chantierId: string,
  signatureDataUrl: string
) {
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);
  if (!me.isClient) {
    throw new Error("Seul un client peut signer la levée des réserves");
  }
  const pv = await db.pvReception.findUnique({ where: { chantierId } });
  if (!pv) throw new Error("PV introuvable");
  if (pv.statut !== "SIGNE_CLIENT") {
    throw new Error("Le PV doit d'abord être signé par le client");
  }
  await db.pvReception.update({
    where: { chantierId },
    data: {
      reservesLeveeUrl: signatureDataUrl,
      reservesLeveeLe: new Date(),
      statut: "RESERVES_LEVEES",
    },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}
