"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { notify, notifyAdmins } from "@/lib/notifications";
import { saveUploadedDocument, deleteUploadedPhoto } from "@/lib/upload";

// ─── GED chantier : plans, contrats, devis, factures, PV, rapports ──────────
// L'équipe dépose et organise les pièces du chantier. Chaque document peut
// être ouvert au client (visibleClient) et, pour les pièces contractuelles,
// passer par le circuit de signature client : SANS -> A_SIGNER -> SIGNE.
// La signature reprend le mécanisme des devis / situations de /mes-documents :
// empreinte PNG (data URL), horodatage et identité du signataire conservés
// pour la valeur probante (signature simple, art. 1367 Code civil).

const CATEGORIES = [
  "PLAN",
  "CONTRAT",
  "DEVIS",
  "FACTURE",
  "PV",
  "RAPPORT",
  "AUTRE",
] as const;

function estDataUrlPng(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.startsWith("data:image/png;base64,") &&
    s.length < 2_000_000
  );
}

/** Garde « équipe » : tout rôle interne ayant accès au chantier, jamais un client. */
async function equipeDuChantier(chantierId: string) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Action réservée à l'équipe du chantier");
  await requireChantierAccess(me, chantierId);
  return me;
}

/** Revalide toutes les vues qui affichent les documents de ce chantier. */
function revaliderDocs(chantierId: string) {
  revalidatePath(`/chantiers/${chantierId}/documents`);
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/mes-documents");
}

const ajoutSchema = z.object({
  nom: z.string().trim().optional().or(z.literal("")),
  categorie: z.enum(CATEGORIES),
  note: z.string().trim().optional().or(z.literal("")),
  visibleClient: z.boolean(),
  demanderSignature: z.boolean(),
});

/** Dépose un document sur le chantier (équipe uniquement). */
export async function ajouterDocumentChantier(
  chantierId: string,
  formData: FormData
) {
  const me = await equipeDuChantier(chantierId);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu");
  const parsed = ajoutSchema.parse({
    nom: formData.get("nom") || "",
    categorie: formData.get("categorie") || "AUTRE",
    note: formData.get("note") || "",
    visibleClient: formData.get("visibleClient") === "on",
    demanderSignature: formData.get("demanderSignature") === "on",
  });

  const saved = await saveUploadedDocument(file, "docs-chantiers");
  await db.chantierDocument.create({
    data: {
      chantierId,
      nom: parsed.nom || saved.originalName,
      categorie: parsed.categorie,
      fichier: saved.url,
      mimeType: saved.mimeType,
      taille: saved.size,
      note: parsed.note || null,
      // Une demande de signature implique que le client voie le document.
      visibleClient: parsed.visibleClient || parsed.demanderSignature,
      statutSignature: parsed.demanderSignature ? "A_SIGNER" : "SANS",
      creePar: me.name,
    },
  });
  revaliderDocs(chantierId);
}

const majSchema = z.object({
  nom: z.string().trim().min(1).optional(),
  categorie: z.enum(CATEGORIES).optional(),
  note: z.string().trim().optional(),
  visibleClient: z.boolean().optional(),
  // On ne peut demander (A_SIGNER) ou annuler (SANS) : jamais poser SIGNE ici,
  // et jamais repasser un document SIGNE dans un autre état.
  statutSignature: z.enum(["SANS", "A_SIGNER"]).optional(),
});

/** Met à jour un document : visibilité client, demande de signature, métadonnées. */
export async function majDocumentChantier(
  documentId: string,
  params: z.infer<typeof majSchema>
) {
  const doc = await db.chantierDocument.findUnique({
    where: { id: documentId },
    select: { chantierId: true, statutSignature: true, visibleClient: true },
  });
  if (!doc) throw new Error("Document introuvable");
  await equipeDuChantier(doc.chantierId);
  const parsed = majSchema.parse(params);

  if (parsed.statutSignature && doc.statutSignature === "SIGNE") {
    throw new Error(
      "Ce document est signé : son état de signature ne se modifie plus"
    );
  }
  const statutFinal = parsed.statutSignature ?? doc.statutSignature;
  const visibleFinal = parsed.visibleClient ?? doc.visibleClient;

  await db.chantierDocument.update({
    where: { id: documentId },
    data: {
      ...(parsed.nom !== undefined ? { nom: parsed.nom } : {}),
      ...(parsed.categorie !== undefined ? { categorie: parsed.categorie } : {}),
      ...(parsed.note !== undefined ? { note: parsed.note || null } : {}),
      ...(parsed.statutSignature !== undefined
        ? { statutSignature: parsed.statutSignature }
        : {}),
      // Un document en attente de signature reste forcément visible du client.
      visibleClient: statutFinal === "A_SIGNER" ? true : visibleFinal,
    },
  });
  revaliderDocs(doc.chantierId);
}

/** Supprime un document (équipe uniquement, confirmation côté interface). */
export async function supprimerDocumentChantier(documentId: string) {
  const doc = await db.chantierDocument.findUnique({
    where: { id: documentId },
    select: { chantierId: true, fichier: true },
  });
  if (!doc) return;
  await equipeDuChantier(doc.chantierId);
  // Nettoyage du fichier sur disque (best-effort), puis de la ligne.
  await deleteUploadedPhoto(doc.fichier);
  await db.chantierDocument.delete({ where: { id: documentId } });
  revaliderDocs(doc.chantierId);
}

/** Le CLIENT du chantier signe un document en attente (A_SIGNER et visible). */
export async function signerDocumentChantier(
  documentId: string,
  signatureDataUrl: string
) {
  const me = await requireAuth();
  if (!me.isClient) throw new Error("Réservé au client");
  if (!estDataUrlPng(signatureDataUrl)) throw new Error("Signature invalide");

  const doc = await db.chantierDocument.findUnique({
    where: { id: documentId },
    select: {
      chantierId: true,
      nom: true,
      visibleClient: true,
      statutSignature: true,
      chantier: { select: { nom: true } },
    },
  });
  if (!doc) throw new Error("Document introuvable");
  // Frontière : le document est sur un chantier du client (adhésion ou
  // relation chantiersClient, comme pour le PV et les devis).
  await requireChantierAccess(me, doc.chantierId);
  if (!doc.visibleClient || doc.statutSignature !== "A_SIGNER") {
    throw new Error("Ce document n'est pas en attente de votre signature");
  }

  // Écriture ATOMIQUE : la garde « encore à signer » vit dans le where, sinon
  // deux soumissions concurrentes écraseraient la première signature.
  const res = await db.chantierDocument.updateMany({
    where: { id: documentId, statutSignature: "A_SIGNER" },
    data: {
      statutSignature: "SIGNE",
      signatureClientUrl: signatureDataUrl,
      signatureClientLe: new Date(),
      signatureClientPar: me.name,
    },
  });
  if (res.count !== 1) throw new Error("Document déjà signé");

  // Prévenir l'équipe : tous les admins, plus les conducteurs du chantier.
  const titre = `Document signé : ${doc.nom}`;
  const message = `${me.name} a signé « ${doc.nom} » (chantier ${doc.chantier.nom}).`;
  const lien = `/chantiers/${doc.chantierId}/documents`;
  await notifyAdmins("AUTRE", titre, message, lien);
  const membres = await db.chantierMembre.findMany({
    where: { chantierId: doc.chantierId },
    select: { user: { select: { id: true, role: true } } },
  });
  for (const m of membres) {
    if (m.user.role === "CONDUCTEUR") {
      await notify(m.user.id, "AUTRE", titre, message, lien);
    }
  }

  revaliderDocs(doc.chantierId);
}
