"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireChantierManager,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { calculerSituation, calculerEcheance } from "@/lib/suivi-commercial";

// ─── Suivi financier : server actions ────────────────────────────────────────
// Convention du dépôt (cf. be/actions.ts) : garde requireX, validation zod avec
// repli null -> "" (FormData.get renvoie null, que zod .optional().or("")
// refuse), puis revalidatePath des vues touchées. Toute mutation tient seule
// face à un POST forgé : on ne fait JAMAIS confiance aux ids reçus.
// espaceId n'est jamais lu depuis le client : il est DÉRIVÉ du chantier (dont
// requireChantierManager a déjà vérifié qu'il est dans l'espace de l'appelant).

/**
 * Garde commune : l'appelant gère le chantier (ADMIN ou CONDUCTEUR membre,
 * frontière d'espace posée avant le court-circuit admin), et on renvoie
 * l'espace du chantier pour rattacher l'objet créé.
 */
async function chantierGere(
  me: CurrentUser,
  chantierId: string
): Promise<{ espaceId: string; type: string }> {
  await requireChantierManager(me, chantierId);
  const c = await db.chantier.findUnique({
    where: { id: chantierId },
    select: { espaceId: true, type: true },
  });
  if (!c) throw new Error("Projet introuvable");
  return { espaceId: c.espaceId, type: c.type };
}

/** Recalcule l'état de règlement d'une facture depuis ses encaissements. */
async function recomposerReglementFacture(factureId: string) {
  const f = await db.facture.findUnique({
    where: { id: factureId },
    select: { montantTTC: true, statutEmission: true },
  });
  if (!f) return;
  const agg = await db.encaissement.aggregate({
    where: { factureId },
    _sum: { montant: true },
    _max: { dateEncaissement: true },
  });
  const paye = Number(agg._sum.montant ?? 0);
  const ttc = Number(f.montantTTC);
  const statutReglement =
    f.statutEmission === "ANNULEE"
      ? "ANNULEE"
      : paye <= 0
        ? "NON_PAYEE"
        : paye + 0.005 >= ttc
          ? "PAYEE"
          : "PARTIELLEMENT_PAYEE";
  await db.facture.update({
    where: { id: factureId },
    data: {
      montantPaye: paye,
      statutReglement,
      datePaiementComplet:
        statutReglement === "PAYEE" ? (agg._max.dateEncaissement ?? new Date()) : null,
    },
  });
}

function revalFinance(chantierId?: string | null) {
  revalidatePath("/finance");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
}

// ── Dates : repli/validation communes ────────────────────────────────────────
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide");
const dateOpt = z.union([dateStr, z.literal("")]);
function jour(v: string): Date {
  return new Date(v + "T00:00:00.000Z");
}

// =====================================================
// MARCHÉ
// =====================================================

const marcheSchema = z.object({
  chantierId: z.string().min(1),
  reference: z.string().min(1, "Référence requise").max(120),
  natureMarche: z.enum(["PRIVE", "PUBLIC"]).default("PRIVE"),
  modeFacturation: z
    .enum(["SITUATION_TRAVAUX", "JALON_PHASE"])
    .default("SITUATION_TRAVAUX"),
  maitreOuvrageNom: z.string().max(160).optional().or(z.literal("")),
  clientUserId: z.string().optional().or(z.literal("")),
  montantInitialHT: z.coerce.number().min(0).default(0),
  typePrix: z.enum(["FERME", "FERME_ACTUALISABLE", "REVISABLE"]).default("FERME"),
  tauxRetenueGarantie: z.coerce.number().min(0).max(10).default(0),
  delaiPaiementJours: z.coerce.number().int().min(0).max(120).default(30),
  modeCalculEcheance: z.enum(["DATE_FACTURE", "FIN_DE_MOIS"]).default("DATE_FACTURE"),
  dateSignature: dateOpt.optional(),
});

export async function creerMarche(formData: FormData) {
  const me = await requireAuth();
  const d = marcheSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    reference: formData.get("reference") ?? "",
    natureMarche: formData.get("natureMarche") || "PRIVE",
    modeFacturation: formData.get("modeFacturation") || "SITUATION_TRAVAUX",
    maitreOuvrageNom: formData.get("maitreOuvrageNom") ?? "",
    clientUserId: formData.get("clientUserId") ?? "",
    montantInitialHT: formData.get("montantInitialHT") || 0,
    typePrix: formData.get("typePrix") || "FERME",
    tauxRetenueGarantie: formData.get("tauxRetenueGarantie") || 0,
    delaiPaiementJours: formData.get("delaiPaiementJours") || 30,
    modeCalculEcheance: formData.get("modeCalculEcheance") || "DATE_FACTURE",
    dateSignature: formData.get("dateSignature") ?? "",
  });
  const { espaceId } = await chantierGere(me, d.chantierId);
  const clientUserId = await clientValide(d.clientUserId, { chantierId: d.chantierId });
  await db.marche.create({
    data: {
      espaceId,
      chantierId: d.chantierId,
      reference: d.reference,
      natureMarche: d.natureMarche,
      modeFacturation: d.modeFacturation,
      maitreOuvrageNom: d.maitreOuvrageNom || null,
      clientUserId,
      montantInitialHT: d.montantInitialHT,
      montantCourantHT: d.montantInitialHT,
      typePrix: d.typePrix,
      tauxRetenueGarantie: d.tauxRetenueGarantie,
      delaiPaiementJours: d.delaiPaiementJours,
      modeCalculEcheance: d.modeCalculEcheance,
      dateSignature: d.dateSignature ? jour(d.dateSignature) : null,
      statut: "ACTIF",
      creePar: me.id,
    },
  });
  revalFinance(d.chantierId);
}

const statutMarcheSchema = z.enum([
  "BROUILLON",
  "ACTIF",
  "RECEPTIONNE",
  "SOLDE",
  "CLOTURE",
]);

export async function majStatutMarche(id: string, statut: string) {
  const me = await requireAuth();
  const s = statutMarcheSchema.parse(statut);
  const m = await db.marche.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!m) throw new Error("Marché introuvable");
  await requireChantierManager(me, m.chantierId);
  await db.marche.update({ where: { id }, data: { statut: s } });
  revalFinance(m.chantierId);
}

// =====================================================
// DEVIS (suivi)
// =====================================================

const devisSchema = z.object({
  chantierId: z.string().optional().or(z.literal("")),
  objet: z.string().min(1, "Objet requis").max(200),
  source: z.enum(["ODOO", "CONSTRUCTOR", "MANUEL", "AUTRE"]).default("MANUEL"),
  referenceExterne: z.string().max(120).optional().or(z.literal("")),
  lienExterne: z.string().url("Lien invalide").max(500).optional().or(z.literal("")),
  clientUserId: z.string().optional().or(z.literal("")),
  montantHT: z.coerce.number().min(0).default(0),
  montantTTC: z.coerce.number().min(0).default(0),
  dateEmission: dateOpt.optional(),
  dateValidite: dateOpt.optional(),
});

/**
 * Vérifie qu'un id client est un User CLIENT rattaché soit au chantier visé,
 * soit (sans chantier) à un chantier de l'espace. Renvoie null sinon : on ne
 * lie jamais un devis à un client d'un autre espace (frontière d'espace).
 */
async function clientValide(
  clientUserId: string | undefined,
  ancrage: { chantierId?: string; espaceId?: string }
): Promise<string | null> {
  if (!clientUserId) return null;
  const u = await db.user.findUnique({
    where: { id: clientUserId },
    select: {
      role: true,
      chantiersClient: { select: { id: true, espaceId: true } },
    },
  });
  if (!u || u.role !== "CLIENT") return null;
  if (ancrage.chantierId) {
    return u.chantiersClient.some((c) => c.id === ancrage.chantierId)
      ? clientUserId
      : null;
  }
  if (ancrage.espaceId) {
    // Sans chantier : le client doit partager un chantier de l'espace.
    return u.chantiersClient.some((c) => c.espaceId === ancrage.espaceId)
      ? clientUserId
      : null;
  }
  return null;
}

export async function creerDevis(formData: FormData) {
  const me = await requireAuth();
  const d = devisSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    objet: formData.get("objet") ?? "",
    source: formData.get("source") || "MANUEL",
    referenceExterne: formData.get("referenceExterne") ?? "",
    lienExterne: formData.get("lienExterne") ?? "",
    clientUserId: formData.get("clientUserId") ?? "",
    montantHT: formData.get("montantHT") || 0,
    montantTTC: formData.get("montantTTC") || 0,
    dateEmission: formData.get("dateEmission") ?? "",
    dateValidite: formData.get("dateValidite") ?? "",
  });
  // Un devis PEUT précéder le chantier ; mais s'il en cite un, on vérifie
  // que l'appelant le gère, et on en dérive l'espace. Sinon, espace courant.
  let espaceId: string;
  if (d.chantierId) {
    espaceId = (await chantierGere(me, d.chantierId)).espaceId;
  } else {
    if (!me.espaceCourant) {
      throw new Error(
        "Choisissez une entreprise (ou rattachez le devis à un projet)"
      );
    }
    espaceId = me.espaceCourant.id;
  }
  const clientUserId = await clientValide(d.clientUserId, {
    chantierId: d.chantierId || undefined,
    espaceId,
  });
  const montantTTC = d.montantTTC || d.montantHT;
  await db.devis.create({
    data: {
      espaceId,
      chantierId: d.chantierId || null,
      objet: d.objet,
      source: d.source,
      referenceExterne: d.referenceExterne || null,
      lienExterne: d.lienExterne || null,
      clientUserId,
      montantHT: d.montantHT,
      montantTVA: Math.round((montantTTC - d.montantHT) * 100) / 100,
      montantTTC,
      statut: "BROUILLON",
      dateEmission: d.dateEmission ? jour(d.dateEmission) : null,
      dateValidite: d.dateValidite ? jour(d.dateValidite) : null,
      creePar: me.id,
    },
  });
  revalFinance(d.chantierId || null);
}

const statutDevisSchema = z.enum([
  "BROUILLON",
  "ENVOYE",
  "RELANCE",
  "ACCEPTE",
  "REFUSE",
  "EXPIRE",
]);

/** Changement de statut d'un devis en un geste, avec horodatage automatique. */
export async function majStatutDevis(
  id: string,
  statut: string,
  motifRefus?: string
) {
  const me = await requireAuth();
  const s = statutDevisSchema.parse(statut);
  const dv = await db.devis.findUnique({
    where: { id },
    select: { chantierId: true, espaceId: true, nbRelances: true },
  });
  if (!dv) throw new Error("Devis introuvable");
  await gardeObjetFinancier(me, dv.chantierId, dv.espaceId);

  const now = new Date();
  const data: Record<string, unknown> = { statut: s };
  if (s === "ENVOYE") data.dateEnvoi = now;
  if (s === "RELANCE") {
    data.nbRelances = dv.nbRelances + 1;
    data.dateDerniereRelance = now;
    // Reprogramme la surveillance : le moteur de relances (lib/relances) se
    // taira 14 jours, puis resignalera le devis s'il reste sans réponse.
    data.prochaineRelance = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  }
  if (s === "ACCEPTE") {
    data.dateAcceptation = now;
    data.prochaineRelance = null;
  }
  if (s === "REFUSE") {
    data.dateRefus = now;
    data.motifRefus = (motifRefus ?? "").slice(0, 300) || null;
    data.prochaineRelance = null;
  }
  if (s === "EXPIRE") data.prochaineRelance = null;
  await db.devis.update({ where: { id }, data });
  if (s === "RELANCE") {
    // Réarme le cycle de surveillance : l'idempotence de RelanceLog
    // (@@unique objetType/objetId/palier) bloquerait sinon toute nouvelle
    // notification au prochain passage dû (P2002 compté « déjà traité »).
    // Le devis n'ayant qu'un seul palier, on purge sa ligne de journal.
    await db.relanceLog.deleteMany({
      where: { objetType: "DEVIS", objetId: id, palier: "DEVIS_SANS_REPONSE" },
    });
  }
  revalFinance(dv.chantierId);
}

export async function supprimerDevis(id: string) {
  const me = await requireAuth();
  const dv = await db.devis.findUnique({
    where: { id },
    select: { chantierId: true, espaceId: true },
  });
  if (!dv) return;
  await gardeObjetFinancier(me, dv.chantierId, dv.espaceId);
  await db.devis.delete({ where: { id } });
  revalFinance(dv.chantierId);
}

// =====================================================
// FACTURE (suivi)
// =====================================================

const factureSchema = z.object({
  chantierId: z.string().min(1),
  type: z
    .enum(["ACOMPTE", "SITUATION", "SOLDE", "HONORAIRES", "AVOIR"])
    .default("SITUATION"),
  objet: z.string().max(200).optional().or(z.literal("")),
  source: z.enum(["ODOO", "CONSTRUCTOR", "MANUEL", "AUTRE"]).default("MANUEL"),
  referenceExterne: z.string().max(120).optional().or(z.literal("")),
  lienExterne: z.string().url("Lien invalide").max(500).optional().or(z.literal("")),
  clientUserId: z.string().optional().or(z.literal("")),
  montantHT: z.coerce.number().default(0),
  montantTTC: z.coerce.number().default(0),
  autoliquidation: z.coerce.boolean().optional(),
  dateEmission: dateOpt.optional(),
});

export async function creerFacture(formData: FormData) {
  const me = await requireAuth();
  const d = factureSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    type: formData.get("type") || "SITUATION",
    objet: formData.get("objet") ?? "",
    source: formData.get("source") || "MANUEL",
    referenceExterne: formData.get("referenceExterne") ?? "",
    lienExterne: formData.get("lienExterne") ?? "",
    clientUserId: formData.get("clientUserId") ?? "",
    montantHT: formData.get("montantHT") || 0,
    montantTTC: formData.get("montantTTC") || 0,
    autoliquidation: formData.get("autoliquidation") === "on",
    dateEmission: formData.get("dateEmission") ?? "",
  });
  const { espaceId } = await chantierGere(me, d.chantierId);
  const marche = await db.marche.findFirst({
    where: { chantierId: d.chantierId },
    orderBy: { createdAt: "asc" },
    select: { id: true, delaiPaiementJours: true, modeCalculEcheance: true },
  });
  const clientUserId = await clientValide(d.clientUserId, { chantierId: d.chantierId });
  const montantTTC = d.montantTTC || d.montantHT;
  const emission = d.dateEmission ? jour(d.dateEmission) : null;
  const dateEcheance =
    emission && marche
      ? calculerEcheance(
          emission,
          marche.delaiPaiementJours,
          marche.modeCalculEcheance === "FIN_DE_MOIS"
        )
      : null;
  await db.facture.create({
    data: {
      espaceId,
      chantierId: d.chantierId,
      marcheId: marche?.id ?? null,
      clientUserId,
      type: d.type,
      objet: d.objet || null,
      source: d.source,
      referenceExterne: d.referenceExterne || null,
      lienExterne: d.lienExterne || null,
      montantHT: d.montantHT,
      montantTVA: Math.round((montantTTC - d.montantHT) * 100) / 100,
      montantTTC,
      autoliquidation: d.autoliquidation ?? false,
      statutEmission: emission ? "EMISE" : "BROUILLON",
      dateEmission: emission,
      dateEcheance,
      creePar: me.id,
    },
  });
  revalFinance(d.chantierId);
}

const statutEmissionSchema = z.enum(["BROUILLON", "EMISE", "ENVOYEE", "ANNULEE"]);

export async function majStatutEmissionFacture(id: string, statut: string) {
  const me = await requireAuth();
  const s = statutEmissionSchema.parse(statut);
  const f = await db.facture.findUnique({
    where: { id },
    select: { chantierId: true, espaceId: true },
  });
  if (!f) throw new Error("Facture introuvable");
  await gardeObjetFinancier(me, f.chantierId, f.espaceId);
  const data: Record<string, unknown> = { statutEmission: s };
  if (s === "ENVOYEE") data.dateEnvoi = new Date();
  await db.facture.update({ where: { id }, data });
  // Annuler l'émission ferme le règlement.
  if (s === "ANNULEE") await recomposerReglementFacture(id);
  revalFinance(f.chantierId);
}

export async function supprimerFacture(id: string) {
  const me = await requireAuth();
  const f = await db.facture.findUnique({
    where: { id },
    select: {
      chantierId: true,
      espaceId: true,
      marcheId: true,
      retenueGarantieMontant: true,
      // La situation dont CETTE facture est la facturation (relation inverse).
      situationLiee: { select: { id: true } },
    },
  });
  if (!f) return;
  await gardeObjetFinancier(me, f.chantierId, f.espaceId);

  // On ne supprime pas une facture qui porte des encaissements (l'historique
  // de règlement serait effacé par la cascade). L'UI cache déjà le bouton ;
  // l'action tient seule face à un POST forgé.
  const nbEnc = await db.encaissement.count({ where: { factureId: id } });
  if (nbEnc > 0) {
    throw new Error(
      "Cette facture a des encaissements : supprimez-les d'abord"
    );
  }

  // Contre-vérification 2026-07-08 : supprimer une facture de situation doit
  // RÉVERSER proprement, sinon la retenue reste surévaluée et la situation
  // reste FACTUREE sans facture (re-facturation bloquée à jamais). On rouvre
  // la situation (ACCEPTEE) et on décrémente la retenue du montant de cette
  // facture, en une transaction.
  const retenue = Number(f.retenueGarantieMontant);
  await db.$transaction(async (tx) => {
    if (f.situationLiee) {
      await tx.situationTravaux.update({
        where: { id: f.situationLiee.id },
        data: { statut: "ACCEPTEE", factureId: null },
      });
    }
    if (retenue > 0 && f.marcheId) {
      const rg = await tx.retenueGarantie.findUnique({
        where: { marcheId: f.marcheId },
        select: { id: true, montantRetenuCumul: true },
      });
      if (rg) {
        await tx.retenueGarantie.update({
          where: { marcheId: f.marcheId },
          data: {
            montantRetenuCumul: Math.max(
              0,
              Number(rg.montantRetenuCumul) - retenue
            ),
          },
        });
      }
    }
    await tx.facture.delete({ where: { id } });
  });
  revalFinance(f.chantierId);
}

// =====================================================
// ENCAISSEMENT
// =====================================================

const encaissementSchema = z.object({
  factureId: z.string().min(1),
  montant: z.coerce.number().positive("Montant requis"),
  dateEncaissement: dateStr,
  mode: z.enum(["ESPECES", "VIREMENT", "CHEQUE", "CB", "EFFET"]).default("VIREMENT"),
  reference: z.string().max(120).optional().or(z.literal("")),
});

export async function ajouterEncaissement(formData: FormData) {
  const me = await requireAuth();
  const d = encaissementSchema.parse({
    factureId: formData.get("factureId") ?? "",
    montant: formData.get("montant") ?? "",
    dateEncaissement: formData.get("dateEncaissement") ?? "",
    mode: formData.get("mode") || "VIREMENT",
    reference: formData.get("reference") ?? "",
  });
  const f = await db.facture.findUnique({
    where: { id: d.factureId },
    select: { chantierId: true, espaceId: true },
  });
  if (!f) throw new Error("Facture introuvable");
  await gardeObjetFinancier(me, f.chantierId, f.espaceId);
  await db.encaissement.create({
    data: {
      espaceId: f.espaceId,
      chantierId: f.chantierId,
      factureId: d.factureId,
      montant: d.montant,
      dateEncaissement: jour(d.dateEncaissement),
      mode: d.mode,
      reference: d.reference || null,
      creePar: me.id,
    },
  });
  await recomposerReglementFacture(d.factureId);
  revalFinance(f.chantierId);
}

export async function supprimerEncaissement(id: string) {
  const me = await requireAuth();
  const e = await db.encaissement.findUnique({
    where: { id },
    select: { chantierId: true, espaceId: true, factureId: true },
  });
  if (!e) return;
  await gardeObjetFinancier(me, e.chantierId, e.espaceId);
  await db.encaissement.delete({ where: { id } });
  await recomposerReglementFacture(e.factureId);
  revalFinance(e.chantierId);
}

// =====================================================
// SITUATION DE TRAVAUX
// =====================================================

const situationSchema = z.object({
  chantierId: z.string().min(1),
  base: z.enum(["BASE_TRAVAUX", "BASE_FORFAIT_PHASE"]).default("BASE_TRAVAUX"),
  phaseEtudeId: z.string().optional().or(z.literal("")),
  avancementCumulePct: z.coerce.number().min(0).max(100),
  periodeDebut: dateStr,
  periodeFin: dateStr,
  dateEtablissement: dateStr,
  tauxTVA: z.coerce.number().min(0).max(30).default(20),
  autoliquidation: z.coerce.boolean().optional(),
  imputationAcompte: z.coerce.number().min(0).default(0),
});

export async function creerSituation(formData: FormData) {
  const me = await requireAuth();
  const d = situationSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    base: formData.get("base") || "BASE_TRAVAUX",
    phaseEtudeId: formData.get("phaseEtudeId") ?? "",
    avancementCumulePct: formData.get("avancementCumulePct") ?? "",
    periodeDebut: formData.get("periodeDebut") ?? "",
    periodeFin: formData.get("periodeFin") ?? "",
    dateEtablissement: formData.get("dateEtablissement") ?? "",
    tauxTVA: formData.get("tauxTVA") || 20,
    autoliquidation: formData.get("autoliquidation") === "on",
    imputationAcompte: formData.get("imputationAcompte") || 0,
  });
  const { espaceId } = await chantierGere(me, d.chantierId);
  const marche = await db.marche.findFirst({
    where: { chantierId: d.chantierId },
    orderBy: { createdAt: "asc" },
    select: { id: true, montantCourantHT: true, tauxRetenueGarantie: true },
  });
  if (!marche) {
    throw new Error(
      "Créez d'abord un marché sur ce projet pour établir des situations"
    );
  }

  // Montant de référence : forfait de phase (BE) ou marché courant (travaux).
  let montantReferenceHT = Number(marche.montantCourantHT);
  let phaseEtudeId: string | null = null;
  if (d.base === "BASE_FORFAIT_PHASE" && d.phaseEtudeId) {
    const phase = await db.phaseEtude.findUnique({
      where: { id: d.phaseEtudeId },
      select: { chantierId: true, montantVendu: true },
    });
    if (!phase || phase.chantierId !== d.chantierId) {
      throw new Error("Phase inconnue sur ce projet");
    }
    montantReferenceHT = Number(phase.montantVendu);
    phaseEtudeId = d.phaseEtudeId;
  }

  // Cumul antérieur = somme de TOUTES les périodes déjà établies sur la même
  // base (et même phase pour un jalon BE), quel que soit leur statut : une
  // situation contestée occupe toujours son montant, l'exclure casserait le
  // télescopage du delta d'avancement (contre-vérification 2026-07-08).
  const cumulAgg = await db.situationTravaux.aggregate({
    where: {
      marcheId: marche.id,
      base: d.base,
      ...(phaseEtudeId ? { phaseEtudeId } : {}),
    },
    _sum: { montantPeriodeHT: true },
  });
  const montantCumuleAnterieurHT = Number(cumulAgg._sum.montantPeriodeHT ?? 0);
  // Le numéro d'ordre est UNIQUE à l'échelle du marché (contrainte
  // @@unique([marcheId, numeroOrdre])) : il se calcule sur TOUT le marché,
  // pas sur le sous-ensemble base/phase, sinon deux phases (ou une reprise
  // après contestation) entrent en collision (P2002).
  const ordreAgg = await db.situationTravaux.aggregate({
    where: { marcheId: marche.id },
    _max: { numeroOrdre: true },
  });
  const numeroOrdre = (ordreAgg._max.numeroOrdre ?? 0) + 1;

  const calc = calculerSituation({
    montantReferenceHT,
    avancementCumulePct: d.avancementCumulePct,
    montantCumuleAnterieurHT,
    tauxRetenueGarantie:
      d.base === "BASE_FORFAIT_PHASE" ? 0 : Number(marche.tauxRetenueGarantie),
    imputationAcompte: d.imputationAcompte,
    tauxTVA: d.tauxTVA,
    autoliquidation: d.autoliquidation,
  });

  await db.situationTravaux.create({
    data: {
      espaceId,
      chantierId: d.chantierId,
      marcheId: marche.id,
      base: d.base,
      phaseEtudeId,
      numeroOrdre,
      periodeDebut: jour(d.periodeDebut),
      periodeFin: jour(d.periodeFin),
      dateEtablissement: jour(d.dateEtablissement),
      avancementCumulePct: d.avancementCumulePct,
      montantReferenceHT,
      montantCumuleHT: calc.montantCumuleHT,
      montantCumuleAnterieurHT,
      montantPeriodeHT: calc.montantPeriodeHT,
      retenueGarantiePeriode: calc.retenueGarantiePeriode,
      imputationAcompte: calc.imputationAcompte,
      tauxTVA: d.tauxTVA,
      autoliquidation: d.autoliquidation ?? false,
      netAPayerPeriode: calc.netAPayerPeriode,
      statut: "BROUILLON",
      creePar: me.id,
    },
  });
  revalFinance(d.chantierId);
}

const statutSituationSchema = z.enum([
  "BROUILLON",
  "TRANSMISE",
  "VISEE_MOE",
  "ACCEPTEE",
  "CONTESTEE",
]);

export async function majStatutSituation(id: string, statut: string) {
  const me = await requireAuth();
  const s = statutSituationSchema.parse(statut);
  const st = await db.situationTravaux.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!st) throw new Error("Situation introuvable");
  await requireChantierManager(me, st.chantierId);
  const data: Record<string, unknown> = { statut: s };
  if (s === "VISEE_MOE") {
    data.dateVisaMOE = new Date();
    data.valideurMoeId = me.id;
  }
  await db.situationTravaux.update({ where: { id }, data });
  revalFinance(st.chantierId);
}

/**
 * Facturer une situation : crée une Facture de type SITUATION rattachée, passe
 * la situation en FACTUREE et alimente la retenue de garantie du marché. La
 * facture reste un miroir de suivi (aucun PDF) : elle porte les montants et un
 * statut d'émission BROUILLON à compléter (référence externe, échéance).
 */
export async function facturerSituation(id: string) {
  const me = await requireAuth();
  const st = await db.situationTravaux.findUnique({
    where: { id },
    include: { marche: { select: { id: true, delaiPaiementJours: true, modeCalculEcheance: true, clientUserId: true } } },
  });
  if (!st) throw new Error("Situation introuvable");
  await requireChantierManager(me, st.chantierId);
  if (st.factureId) throw new Error("Situation déjà facturée");
  if (st.statut === "BROUILLON") {
    throw new Error("Transmettez ou validez la situation avant de la facturer");
  }

  const periodeHT = Number(st.montantPeriodeHT);
  const retenue = Number(st.retenueGarantiePeriode);
  const imputation = Number(st.imputationAcompte);
  const baseTVA = Math.round((periodeHT - retenue - imputation) * 100) / 100;
  const net = Number(st.netAPayerPeriode);
  const montantTVA = Math.round((net - baseTVA) * 100) / 100;
  const emission = new Date();
  emission.setUTCHours(0, 0, 0, 0);
  const dateEcheance = calculerEcheance(
    emission,
    st.marche.delaiPaiementJours,
    st.marche.modeCalculEcheance === "FIN_DE_MOIS"
  );

  await db.$transaction(async (tx) => {
    const facture = await tx.facture.create({
      data: {
        espaceId: st.espaceId,
        chantierId: st.chantierId,
        marcheId: st.marcheId,
        clientUserId: st.marche.clientUserId,
        type: "SITUATION",
        objet: `Situation n°${st.numeroOrdre}`,
        source: "MANUEL",
        montantHT: periodeHT,
        montantTVA,
        montantTTC: net,
        autoliquidation: st.autoliquidation,
        retenueGarantieMontant: retenue,
        statutEmission: "EMISE",
        dateEmission: emission,
        dateEcheance,
        creePar: me.id,
      },
    });
    await tx.situationTravaux.update({
      where: { id },
      data: { statut: "FACTUREE", factureId: facture.id },
    });
    // Alimente la retenue de garantie du marché (créée à la volée).
    if (retenue > 0) {
      const existing = await tx.retenueGarantie.findUnique({
        where: { marcheId: st.marcheId },
        select: { id: true, montantRetenuCumul: true },
      });
      if (existing) {
        await tx.retenueGarantie.update({
          where: { marcheId: st.marcheId },
          data: {
            montantRetenuCumul:
              Number(existing.montantRetenuCumul) + retenue,
          },
        });
      } else {
        await tx.retenueGarantie.create({
          data: {
            espaceId: st.espaceId,
            chantierId: st.chantierId,
            marcheId: st.marcheId,
            montantRetenuCumul: retenue,
          },
        });
      }
    }
  });
  revalFinance(st.chantierId);
}

export async function supprimerSituation(id: string) {
  const me = await requireAuth();
  const st = await db.situationTravaux.findUnique({
    where: { id },
    select: { chantierId: true, factureId: true },
  });
  if (!st) return;
  await requireChantierManager(me, st.chantierId);
  if (st.factureId) {
    throw new Error(
      "Situation facturée : supprimez d'abord la facture rattachée"
    );
  }
  await db.situationTravaux.delete({ where: { id } });
  revalFinance(st.chantierId);
}

// =====================================================
// RETENUE DE GARANTIE
// =====================================================

const retenueSchema = z.enum([
  "RETENUE",
  "CONSIGNEE",
  "CAUTIONNEE",
  "LIBEREE",
  "OPPOSITION",
]);

export async function majStatutRetenue(
  id: string,
  statut: string,
  motifOpposition?: string
) {
  const me = await requireAuth();
  const s = retenueSchema.parse(statut);
  const r = await db.retenueGarantie.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!r) throw new Error("Retenue introuvable");
  await requireChantierManager(me, r.chantierId);
  const data: Record<string, unknown> = { statut: s };
  if (s === "LIBEREE") data.dateLiberation = new Date();
  if (s === "OPPOSITION") {
    data.motifOpposition = (motifOpposition ?? "").slice(0, 300) || null;
  }
  await db.retenueGarantie.update({ where: { id }, data });
  revalFinance(r.chantierId);
}

// =====================================================
// Garde commune des objets financiers (chantier ou espace)
// =====================================================

/**
 * Un objet financier vit sur un chantier (garde par le manager du chantier) ou,
 * pour un devis sans projet, dans un espace (garde par l'appartenance à
 * l'espace + pilotage). Ferme la frontière d'espace dans les deux cas.
 */
async function gardeObjetFinancier(
  me: CurrentUser,
  chantierId: string | null,
  espaceId: string
) {
  if (chantierId) {
    await requireChantierManager(me, chantierId);
    return;
  }
  if (!me.canPilot) {
    throw new Error("Action réservée aux administrateurs et conducteurs");
  }
  // Sans chantier : l'objet doit être dans un espace de l'appelant.
  if (me.espaceIds && !me.espaceIds.includes(espaceId)) {
    throw new Error("Cet élément n'appartient pas à votre espace");
  }
}
