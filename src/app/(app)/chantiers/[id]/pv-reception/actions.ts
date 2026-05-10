"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireAdmin,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";

/**
 * Récupère le PV d'un chantier, ou crée un brouillon vide à la volée
 * si demandé.
 */
export async function getOrCreatePv(chantierId: string, createIfMissing = false) {
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);
  let pv = await db.pvReception.findUnique({ where: { chantierId } });
  if (!pv && createIfMissing && me.isAdmin) {
    pv = await db.pvReception.create({
      data: {
        chantierId,
        dateReception: new Date(),
      },
    });
  }
  return pv;
}

const updatePvSchema = z.object({
  dateReception: z.string().min(1, "Date requise"),
  texteRecap: z.string().optional().or(z.literal("")),
});

/** L'admin met à jour les infos générales du PV (date, récap). */
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

/** Ajoute une réserve à la liste. */
export async function ajouterReserve(chantierId: string, formData: FormData) {
  await requireAdmin();
  const texte = String(formData.get("reserve") || "").trim();
  if (!texte) return;
  const pv = await db.pvReception.findUnique({ where: { chantierId } });
  if (!pv) return;
  await db.pvReception.update({
    where: { chantierId },
    data: { reserves: [...pv.reserves, texte] },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** Retire une réserve par son index. */
export async function retirerReserve(chantierId: string, index: number) {
  await requireAdmin();
  const pv = await db.pvReception.findUnique({ where: { chantierId } });
  if (!pv) return;
  const next = pv.reserves.filter((_, i) => i !== index);
  await db.pvReception.update({
    where: { chantierId },
    data: { reserves: next },
  });
  revalidatePath(`/chantiers/${chantierId}/pv-reception`);
}

/** L'admin signe et envoie le PV au client. */
export async function signPvAdmin(chantierId: string, signatureDataUrl: string) {
  await requireAdmin();
  await db.pvReception.update({
    where: { chantierId },
    data: {
      signatureAdminUrl: signatureDataUrl,
      signatureAdminLe: new Date(),
      statut: "ENVOYE_CLIENT",
    },
  });

  // Notifier les clients du chantier
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

/**
 * Le client signe la levée des réserves (signature finale, distinct de
 * la première signature). Marque le PV en RESERVES_LEVEES.
 */
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
