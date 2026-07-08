"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";

// ─── Volet client : signature électronique des devis et situations ───────────
// Le client signe pour ACCEPTER un devis, ou pour approuver l'avancement d'une
// situation (bon à payer de la demande d'acompte). Signature simple recevable
// (art. 1367 Code civil) : on conserve l'empreinte PNG, l'horodatage, l'identité
// (id + nom du compte) pour la valeur probante. Toute action est gardée :
// - me.isClient (seul un client signe),
// - requireChantierAccess (le doc est sur un chantier du client),
// - le drapeau de visibilité correspondant est ouvert par l'admin,
// - le doc appartient bien à un chantier du client (pas d'id forgé d'un autre).

function estDataUrlPng(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/png;base64,") && s.length < 2_000_000;
}

/** Vérifie que le compte courant est un client autorisé à voir ce volet. */
async function clientAutorise(flag: "showDevis" | "showSituations") {
  const me = await requireAuth();
  if (!me.isClient) throw new Error("Réservé au client");
  const u = await db.user.findUnique({
    where: { id: me.id },
    select: { showDevis: true, showSituations: true },
  });
  if (!u || !u[flag]) {
    throw new Error("Ce document ne vous est pas ouvert");
  }
  return me;
}

export async function signerDevisClient(devisId: string, signatureDataUrl: string) {
  const me = await clientAutorise("showDevis");
  if (!estDataUrlPng(signatureDataUrl)) throw new Error("Signature invalide");
  const dv = await db.devis.findUnique({
    where: { id: devisId },
    select: {
      chantierId: true,
      statut: true,
      signatureClientUrl: true,
      clientUserId: true,
    },
  });
  if (!dv || !dv.chantierId) throw new Error("Devis introuvable");
  // Frontière : le devis doit être sur un chantier du client.
  await requireChantierAccess(me, dv.chantierId);
  // Un devis peut désigner SON destinataire (clientUserId). Sur un chantier
  // partagé entre plusieurs clients, on n'accepte QUE le sien (l'acceptation
  // engage juridiquement le signataire). Sans destinataire désigné : ouvert
  // à tout client du chantier.
  if (dv.clientUserId && dv.clientUserId !== me.id) {
    throw new Error("Ce devis ne vous est pas adressé");
  }
  if (dv.signatureClientUrl) throw new Error("Devis déjà signé");
  if (dv.statut !== "ENVOYE" && dv.statut !== "RELANCE") {
    throw new Error("Ce devis n'est pas en attente de signature");
  }
  // Écriture ATOMIQUE : la garde « pas encore signé, en attente » vit dans le
  // where, sinon deux soumissions concurrentes écraseraient la 1re signature.
  const res = await db.devis.updateMany({
    where: {
      id: devisId,
      signatureClientUrl: null,
      statut: { in: ["ENVOYE", "RELANCE"] },
    },
    data: {
      signatureClientUrl: signatureDataUrl,
      signatureClientLe: new Date(),
      signatureClientId: me.id,
      signatureClientNom: me.name,
      // Un devis signé par le client vaut acceptation.
      statut: "ACCEPTE",
      dateAcceptation: new Date(),
    },
  });
  if (res.count !== 1) throw new Error("Devis déjà signé");
  revalidatePath("/mes-documents");
  revalidatePath("/finance");
  revalidatePath(`/finance/${dv.chantierId}`);
}

export async function signerSituationClient(
  situationId: string,
  signatureDataUrl: string
) {
  const me = await clientAutorise("showSituations");
  if (!estDataUrlPng(signatureDataUrl)) throw new Error("Signature invalide");
  const st = await db.situationTravaux.findUnique({
    where: { id: situationId },
    select: { chantierId: true, statut: true, signatureClientUrl: true },
  });
  if (!st) throw new Error("Situation introuvable");
  await requireChantierAccess(me, st.chantierId);
  if (st.signatureClientUrl) throw new Error("Situation déjà signée");
  // On ne signe qu'une situation transmise ou visée par la maîtrise d'œuvre.
  if (st.statut !== "TRANSMISE" && st.statut !== "VISEE_MOE") {
    throw new Error("Cette situation n'est pas en attente de signature");
  }
  // Écriture ATOMIQUE (même raison que le devis).
  const res = await db.situationTravaux.updateMany({
    where: {
      id: situationId,
      signatureClientUrl: null,
      statut: { in: ["TRANSMISE", "VISEE_MOE"] },
    },
    data: {
      signatureClientUrl: signatureDataUrl,
      signatureClientLe: new Date(),
      signatureClientId: me.id,
      signatureClientNom: me.name,
      // La signature du client vaut acceptation de l'avancement.
      statut: "ACCEPTEE",
    },
  });
  if (res.count !== 1) throw new Error("Situation déjà signée");
  revalidatePath("/mes-documents");
  revalidatePath("/finance");
  revalidatePath(`/finance/${st.chantierId}`);
}
