"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { calcPaie } from "@/lib/calc-paie";

const generateSchema = z.object({
  ouvrierId: z.string().min(1),
  periodeDebut: z.string().min(1),
  periodeFin: z.string().min(1),
  mode: z.enum(["ESPECES", "VIREMENT"]),
});

export async function generatePaiement(formData: FormData) {
  const data = generateSchema.parse({
    ouvrierId: formData.get("ouvrierId"),
    periodeDebut: formData.get("periodeDebut"),
    periodeFin: formData.get("periodeFin"),
    mode: formData.get("mode") || "ESPECES",
  });

  const debut = new Date(data.periodeDebut);
  const fin = new Date(data.periodeFin);
  if (fin < debut) throw new Error("La date de fin doit être après le début");

  const ouvrier = await db.ouvrier.findUnique({
    where: { id: data.ouvrierId },
    include: {
      pointages: {
        where: { date: { gte: debut, lte: fin } },
      },
      avances: { where: { reglee: false }, orderBy: { date: "asc" } },
      outilsPersonnels: { where: { solde: false } },
    },
  });
  if (!ouvrier) throw new Error("Ouvrier introuvable");

  const joursTravailles = ouvrier.pointages.reduce(
    (s, p) => s + Number(p.joursTravailles),
    0
  );

  const calc = calcPaie({
    typeContrat: ouvrier.typeContrat,
    tarifBase: Number(ouvrier.tarifBase),
    joursTravailles,
    avances: ouvrier.avances.map((a) => ({ id: a.id, montant: Number(a.montant) })),
    outilsPersonnels: ouvrier.outilsPersonnels.map((o) => ({
      id: o.id,
      mensualite: Number(o.mensualite),
      restantDu: Number(o.restantDu),
    })),
  });

  const paiement = await db.$transaction(async (tx) => {
    const created = await tx.paiement.create({
      data: {
        ouvrierId: data.ouvrierId,
        periodeDebut: debut,
        periodeFin: fin,
        joursTravailles,
        montantBrut: calc.montantBrut,
        avancesDeduites: calc.avancesDeduites,
        retenueOutil: calc.retenueOutil,
        montantNet: calc.montantNet,
        mode: data.mode,
        date: new Date(),
        statut: "CALCULE",
      },
    });

    if (calc.avancesIds.length > 0) {
      await tx.avance.updateMany({
        where: { id: { in: calc.avancesIds } },
        data: { reglee: true, paiementId: created.id },
      });
    }

    for (const ret of calc.retenuesParOutil) {
      await tx.retenueOutil.create({
        data: {
          outilPersonnelId: ret.outilId,
          paiementId: created.id,
          montant: ret.montant,
        },
      });
      const outil = await tx.outilPersonnel.findUnique({ where: { id: ret.outilId } });
      if (outil) {
        const newRestant = Math.max(0, Number(outil.restantDu) - ret.montant);
        await tx.outilPersonnel.update({
          where: { id: ret.outilId },
          data: {
            restantDu: newRestant,
            solde: newRestant === 0,
          },
        });
      }
    }

    return created;
  });

  revalidatePath("/paie");
  revalidatePath(`/ouvriers/${data.ouvrierId}`);
  redirect(`/paie/${paiement.id}`);
}

export async function marquerPaye(id: string) {
  await db.paiement.update({
    where: { id },
    data: { statut: "PAYE" },
  });
  revalidatePath("/paie");
  revalidatePath(`/paie/${id}`);
}

/**
 * Repasse un paiement payé en statut "Calculé" (= en attente).
 * Pratique pour corriger un paiement marqué payé par erreur, ou pour
 * pouvoir l'éditer plus librement avant de le re-valider.
 */
export async function marquerEnAttente(id: string) {
  const existing = await db.paiement.findUnique({
    where: { id },
    select: { statut: true, ouvrierId: true },
  });
  if (!existing) throw new Error("Paiement introuvable");
  if (existing.statut !== "PAYE") {
    throw new Error("Seul un paiement marqué payé peut repasser en attente");
  }
  await db.paiement.update({
    where: { id },
    data: { statut: "CALCULE" },
  });
  revalidatePath("/paie");
  revalidatePath(`/paie/${id}`);
  revalidatePath(`/ouvriers/${existing.ouvrierId}`);
}

export async function annulerPaiement(id: string) {
  const p = await db.paiement.findUnique({
    where: { id },
    include: { avances: true, retenuesOutils: true },
  });
  if (!p) throw new Error("Paiement introuvable");
  if (p.statut === "ANNULE") {
    // Idempotent : déjà annulé
    return;
  }

  await db.$transaction(async (tx) => {
    // Restaurer les avances
    await tx.avance.updateMany({
      where: { paiementId: id },
      data: { reglee: false, paiementId: null },
    });
    // Restaurer le restant dû des outils
    for (const ret of p.retenuesOutils) {
      const outil = await tx.outilPersonnel.findUnique({
        where: { id: ret.outilPersonnelId },
      });
      if (outil) {
        await tx.outilPersonnel.update({
          where: { id: ret.outilPersonnelId },
          data: {
            restantDu: Number(outil.restantDu) + Number(ret.montant),
            solde: false,
          },
        });
      }
    }
    await tx.retenueOutil.deleteMany({ where: { paiementId: id } });
    await tx.paiement.update({
      where: { id },
      data: { statut: "ANNULE" },
    });
  });

  revalidatePath("/paie");
  revalidatePath(`/paie/${id}`);
  revalidatePath(`/ouvriers/${p.ouvrierId}`);
}

// =====================================================
// Edition métadonnées (mode + date) — paiement non finalisé
// =====================================================

const updateMetaSchema = z.object({
  mode: z.enum(["ESPECES", "VIREMENT"]),
  date: z.string().min(1),
});

export async function updatePaiementMeta(id: string, formData: FormData) {
  const data = updateMetaSchema.parse({
    mode: formData.get("mode"),
    date: formData.get("date"),
  });

  const existing = await db.paiement.findUnique({
    where: { id },
    select: { statut: true, ouvrierId: true },
  });
  if (!existing) throw new Error("Paiement introuvable");
  if (existing.statut === "ANNULE") {
    throw new Error(
      "Un paiement annulé ne peut plus être modifié. Génère-en un nouveau."
    );
  }

  const dateObj = new Date(data.date);
  if (isNaN(dateObj.getTime())) throw new Error("Date invalide");

  await db.paiement.update({
    where: { id },
    data: { mode: data.mode, date: dateObj },
  });

  revalidatePath("/paie");
  revalidatePath(`/paie/${id}`);
  revalidatePath(`/ouvriers/${existing.ouvrierId}`);
}

// =====================================================
// Suppression définitive (avec restauration des avances/retenues si besoin)
// =====================================================

/**
 * Supprime définitivement un paiement, quel que soit son statut.
 * Si le paiement n'est pas déjà annulé, les avances réglées et les
 * retenues outils sont restaurées avant la suppression (comme pour une
 * annulation), pour ne pas laisser de données orphelines.
 */
export async function deletePaiement(id: string) {
  const existing = await db.paiement.findUnique({
    where: { id },
    include: { retenuesOutils: true },
  });
  if (!existing) throw new Error("Paiement introuvable");

  await db.$transaction(async (tx) => {
    // Si pas encore annulé, on restaure les avances + retenues outils
    if (existing.statut !== "ANNULE") {
      await tx.avance.updateMany({
        where: { paiementId: id },
        data: { reglee: false, paiementId: null },
      });
      for (const ret of existing.retenuesOutils) {
        const outil = await tx.outilPersonnel.findUnique({
          where: { id: ret.outilPersonnelId },
        });
        if (outil) {
          await tx.outilPersonnel.update({
            where: { id: ret.outilPersonnelId },
            data: {
              restantDu: Number(outil.restantDu) + Number(ret.montant),
              solde: false,
            },
          });
        }
      }
      await tx.retenueOutil.deleteMany({ where: { paiementId: id } });
    }
    await tx.paiement.delete({ where: { id } });
  });

  revalidatePath("/paie");
  revalidatePath(`/ouvriers/${existing.ouvrierId}`);
  redirect("/paie");
}
