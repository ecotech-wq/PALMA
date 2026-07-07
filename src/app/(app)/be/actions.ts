"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireChantierAccess,
  requireChantierManager,
} from "@/lib/auth-helpers";

// ─── Bureau d'études, phase 1 : temps passés et phases d'honoraires ────────
// Conventions du dépôt : garde requireX puis validation zod, revalidatePath
// des vues touchées. Une étude est un Chantier de type ETUDE.

async function verifierEtude(chantierId: string) {
  const projet = await db.chantier.findUnique({
    where: { id: chantierId },
    select: { type: true },
  });
  if (!projet) throw new Error("Étude introuvable");
  if (projet.type !== "ETUDE") throw new Error("Ce projet n'est pas une étude");
}

// ─── Temps passés ───────────────────────────────────────────────────────────

const tempsSchema = z.object({
  chantierId: z.string().min(1, "Étude requise"),
  phaseId: z.string().optional().or(z.literal("")),
  date: z.string().min(1, "Date requise"),
  heures: z.coerce
    .number()
    .min(0.25, "Minimum 0,25 h")
    .max(14, "Maximum 14 h par ligne"),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function saisirTemps(formData: FormData) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Accès refusé");
  const d = tempsSchema.parse({
    chantierId: formData.get("chantierId"),
    phaseId: formData.get("phaseId"),
    date: formData.get("date"),
    heures: formData.get("heures"),
    note: formData.get("note"),
  });
  await requireChantierAccess(me, d.chantierId);
  await verifierEtude(d.chantierId);
  // La phase, facultative, doit appartenir à l'étude (sinon on l'ignore).
  let phaseId: string | null = d.phaseId || null;
  if (phaseId) {
    const phase = await db.phaseEtude.findUnique({
      where: { id: phaseId },
      select: { chantierId: true },
    });
    if (!phase || phase.chantierId !== d.chantierId) phaseId = null;
  }
  await db.tempsPasse.create({
    data: {
      chantierId: d.chantierId,
      phaseId,
      userId: me.id,
      date: new Date(d.date),
      heures: d.heures,
      note: d.note || null,
    },
  });
  revalidatePath("/be/temps");
  revalidatePath(`/be/${d.chantierId}`);
}

export async function supprimerTemps(id: string) {
  const me = await requireAuth();
  const ligne = await db.tempsPasse.findUnique({
    where: { id },
    select: { userId: true, chantierId: true },
  });
  if (!ligne) return;
  // Chacun corrige ses propres saisies ; l'admin peut nettoyer.
  if (ligne.userId !== me.id && !me.isAdmin) {
    throw new Error("Seul l'auteur (ou un admin) peut supprimer cette ligne");
  }
  await db.tempsPasse.delete({ where: { id } });
  revalidatePath("/be/temps");
  revalidatePath(`/be/${ligne.chantierId}`);
}

// ─── Phases d'honoraires ────────────────────────────────────────────────────

const phaseSchema = z.object({
  chantierId: z.string().min(1),
  code: z.string().min(1, "Code requis").max(12),
  libelle: z.string().min(1, "Libellé requis").max(120),
  montantVendu: z.coerce.number().nonnegative().default(0),
  budgetHeures: z.coerce.number().nonnegative().optional(),
  dateDebut: z.string().optional().or(z.literal("")),
  dateFin: z.string().optional().or(z.literal("")),
});

export async function creerPhase(formData: FormData) {
  const me = await requireAuth();
  const d = phaseSchema.parse({
    chantierId: formData.get("chantierId"),
    code: formData.get("code"),
    libelle: formData.get("libelle"),
    montantVendu: formData.get("montantVendu") || 0,
    budgetHeures: formData.get("budgetHeures") || undefined,
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
  });
  await requireChantierManager(me, d.chantierId);
  await verifierEtude(d.chantierId);
  const dernier = await db.phaseEtude.aggregate({
    where: { chantierId: d.chantierId },
    _max: { ordre: true },
  });
  await db.phaseEtude.create({
    data: {
      chantierId: d.chantierId,
      code: d.code.toUpperCase(),
      libelle: d.libelle,
      montantVendu: d.montantVendu,
      budgetHeures: d.budgetHeures ?? null,
      dateDebut: d.dateDebut ? new Date(d.dateDebut) : null,
      dateFin: d.dateFin ? new Date(d.dateFin) : null,
      ordre: (dernier._max.ordre ?? 0) + 1,
    },
  });
  revalidatePath(`/be/${d.chantierId}`);
}

export async function supprimerPhase(id: string) {
  const phase = await db.phaseEtude.findUnique({
    where: { id },
    select: { chantierId: true, _count: { select: { tempsPasses: true } } },
  });
  if (!phase) return;
  const me = await requireAuth();
  await requireChantierManager(me, phase.chantierId);
  // Les temps déjà saisis ne sont pas perdus : la FK passe la phase à null.
  await db.phaseEtude.delete({ where: { id } });
  revalidatePath(`/be/${phase.chantierId}`);
}
