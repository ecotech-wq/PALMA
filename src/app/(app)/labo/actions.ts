"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireChantierManager,
  requireEspaceCourant,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";
import { isUniqueViolation } from "@/features/messaging/core/db-errors";
import {
  seuilDepuisClasse,
  verdictConformite,
  codeEprouvette,
  MAX_EPROUVETTES_PRELEVEMENT,
  ECHEANCE_INFO_BETON_JOURS,
  ECHEANCE_NORMATIVE_BETON_JOURS,
} from "@/lib/labo-calc";

// ─── Module labo : server actions ────────────────────────────────────────────
// Convention du dépôt (cf. finance/actions.ts) : garde requireAdminOrConducteur
// (le labo est un module de pilotage, ni CHEF ni CLIENT n'y écrivent),
// validation zod avec repli null -> "" (FormData.get renvoie null), puis
// revalidatePath des vues touchées. Toute mutation tient seule face à un POST
// forgé : on ne fait JAMAIS confiance aux ids reçus.
// espaceId n'est jamais lu depuis le client : flux CHANTIER, il est DÉRIVÉ du
// chantier ; flux R&D et référentiels (formulations, équipements), il vient de
// l'espace courant sélectionné. Même doctrine que gardeObjetFinancier côté
// finance : un objet rattaché à un chantier exige requireChantierManager
// (ADMIN, ou CONDUCTEUR membre de CE chantier) ; un objet sans chantier est
// regardé à travers me.espaceIds (null = régime hérité sans bornage).
// Les règles pures (seuil depuis la classe, verdict, codes d'éprouvettes)
// vivent dans src/lib/labo-calc.ts, testées par labo-calc.test.ts.

const JOUR_MS = 24 * 3600 * 1000;

// ── Dates : repli/validation communes (mêmes gabarits que finance) ──────────
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide");
const dateOpt = z.union([dateStr, z.literal("")]);
function jour(v: string): Date {
  return new Date(v + "T00:00:00.000Z");
}

function revalLabo(prelevementId?: string | null, chantierId?: string | null) {
  revalidatePath("/labo");
  if (prelevementId) revalidatePath(`/labo/${prelevementId}`);
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
}

/** « 22,5 » : nombre au format français, sans zéros parasites. */
function fmtNombre(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/**
 * Frontière d'espace pour un objet labo EXISTANT sans chantier : l'objet doit
 * vivre dans un espace de l'appelant. espaceIds null = régime hérité, pas de
 * bornage (même convention que gardeObjetFinancier côté finance).
 */
function verifierEspaceObjet(me: CurrentUser, espaceId: string): void {
  if (me.espaceIds && !me.espaceIds.includes(espaceId)) {
    throw new Error("Cet élément n'appartient pas à votre espace");
  }
}

/**
 * Garde d'un objet labo existant, même doctrine que gardeObjetFinancier :
 * rattaché à un chantier, il exige le gestionnaire du chantier (ADMIN, ou
 * CONDUCTEUR membre de CE chantier, frontière d'espace comprise) ; sans
 * chantier (flux R&D), l'appartenance à l'espace suffit.
 */
async function gardeObjetLabo(
  me: CurrentUser,
  chantierId: string | null,
  espaceId: string
): Promise<void> {
  if (chantierId) {
    await requireChantierManager(me, chantierId);
    return;
  }
  verifierEspaceObjet(me, espaceId);
}

/** Charge un prélèvement et applique gardeObjetLabo. Lève sinon. */
async function prelevementGarde(me: CurrentUser, prelevementId: string) {
  const p = await db.prelevementLabo.findUnique({
    where: { id: prelevementId },
    select: {
      id: true,
      espaceId: true,
      chantierId: true,
      reference: true,
      classePrescrite: true,
    },
  });
  if (!p) throw new Error("Prélèvement introuvable");
  await gardeObjetLabo(me, p.chantierId, p.espaceId);
  return p;
}

// =====================================================
// PRÉLÈVEMENT BÉTON (flux chantier)
// =====================================================

const prelevementBetonSchema = z.object({
  chantierId: z.string().min(1),
  reference: z.string().trim().min(1, "Référence requise").max(60),
  datePrelevement: dateStr,
  classePrescrite: z.string().trim().min(1, "Classe requise").max(20),
  nbEprouvettes: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_EPROUVETTES_PRELEVEMENT)
    .default(3),
  geometrie: z.string().trim().max(80).optional().or(z.literal("")),
  conditionsCure: z.string().trim().max(160).optional().or(z.literal("")),
  preleveur: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Prélèvement béton sur un chantier : crée le prélèvement, ses éprouvettes
 * (codes REF-A, REF-B...) et, AUTOMATIQUEMENT, les deux essais de compression
 * NF EN 12390-3 du contrôle courant : écrasement d'information à J+7 (une
 * éprouvette) et écrasement normatif à J+28 (le reste), statut PLANIFIE,
 * seuil dérivé de la classe prescrite ET de la géométrie (C25/30 -> 25 MPa
 * sur cylindre, 30 MPa sur cube). Le moteur de relances (lib/relances)
 * surveillera ensuite les échéances.
 */
export async function creerPrelevementBeton(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = prelevementBetonSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    reference: formData.get("reference") ?? "",
    datePrelevement: formData.get("datePrelevement") ?? "",
    classePrescrite: formData.get("classePrescrite") ?? "",
    nbEprouvettes: formData.get("nbEprouvettes") || 3,
    geometrie: formData.get("geometrie") ?? "",
    conditionsCure: formData.get("conditionsCure") ?? "",
    preleveur: formData.get("preleveur") ?? "",
  });
  // Garde AVANT tout, même doctrine que la finance : ADMIN, ou CONDUCTEUR
  // membre de CE chantier (frontière d'espace comprise) ; l'espace du
  // prélèvement est ensuite DÉRIVÉ du chantier.
  await requireChantierManager(me, d.chantierId);
  const chantier = await db.chantier.findUnique({
    where: { id: d.chantierId },
    select: { espaceId: true },
  });
  if (!chantier) throw new Error("Projet introuvable");

  const date = jour(d.datePrelevement);
  // Propositions par défaut du contrôle courant en France : cylindre 16x32
  // et cure normalisée en eau ou chambre humide (EN 12390-2).
  const geometrie = d.geometrie || "Cylindre 16x32 cm";
  const conditionsCure = d.conditionsCure || "Cure normalisée EN 12390-2";
  // Le flux béton chantier n'a de sens qu'avec un seuil : sans lui, le
  // verdict resterait neutre et l'alerte de non-conformité (la raison d'être
  // du module) ne partirait jamais, silencieusement. On refuse donc une
  // classe illisible plutôt que de l'accepter sans seuil.
  const seuil = seuilDepuisClasse(d.classePrescrite, geometrie);
  if (seuil === null) {
    throw new Error(
      `Classe prescrite « ${d.classePrescrite} » illisible : attendu le ` +
        "format C25/30 (avec la valeur cube, C../XX, si les éprouvettes " +
        "sont cubiques)"
    );
  }

  let prelevementId: string;
  try {
    prelevementId = await db.$transaction(async (tx) => {
      const p = await tx.prelevementLabo.create({
        data: {
          espaceId: chantier.espaceId,
          chantierId: d.chantierId,
          reference: d.reference,
          materiau: "Béton",
          datePrelevement: date,
          classePrescrite: d.classePrescrite,
          preleveur: d.preleveur || null,
          creePar: me.id,
        },
      });

      const eprouvettes: { id: string; code: string }[] = [];
      for (let i = 0; i < d.nbEprouvettes; i++) {
        const ep = await tx.eprouvetteLabo.create({
          data: {
            prelevementId: p.id,
            code: codeEprouvette(d.reference, i),
            geometrie,
            dateFabrication: date,
            conditionsCure,
          },
          select: { id: true, code: true },
        });
        eprouvettes.push(ep);
      }

      // Essais automatiques du flux béton. Une seule éprouvette : on ne peut
      // pas l'écraser deux fois, seul l'écrasement NORMATIF à J+28 est créé.
      const commun = {
        prelevementId: p.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        statut: "PLANIFIE" as const,
        seuil,
        creePar: me.id,
      };
      if (d.nbEprouvettes >= 2) {
        await tx.essaiLabo.create({
          data: {
            ...commun,
            eprouvetteId: eprouvettes[0].id,
            echeance: new Date(
              date.getTime() + ECHEANCE_INFO_BETON_JOURS * JOUR_MS
            ),
            note: "Écrasement d'information à 7 jours.",
          },
        });
      }
      const reste = eprouvettes.slice(d.nbEprouvettes >= 2 ? 1 : 0);
      await tx.essaiLabo.create({
        data: {
          ...commun,
          eprouvetteId: reste.length === 1 ? reste[0].id : null,
          echeance: new Date(
            date.getTime() + ECHEANCE_NORMATIVE_BETON_JOURS * JOUR_MS
          ),
          note:
            reste.length > 1
              ? `Écrasement normatif à 28 jours sur les ${reste.length} éprouvettes ` +
                `restantes (${reste.map((e) => e.code).join(", ")}) : saisir la moyenne.`
              : "Écrasement normatif à 28 jours.",
        },
      });
      return p.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Les codes d'éprouvettes (REF-A...) sont uniques au niveau global.
      throw new Error(
        `Référence « ${d.reference} » déjà utilisée par un autre prélèvement : choisissez-en une autre`
      );
    }
    throw e;
  }
  revalLabo(prelevementId, d.chantierId);
}

// =====================================================
// PRÉLÈVEMENT R&D (flux formulation / campagne)
// =====================================================

const prelevementRDSchema = z.object({
  formulationId: z.string().optional().or(z.literal("")),
  nouvelleFormulationNom: z.string().trim().max(120).optional().or(z.literal("")),
  nouvelleFormulationCampagne: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("")),
  materiau: z.string().trim().min(1, "Matériau requis").max(80),
  reference: z.string().trim().min(1, "Référence requise").max(60),
  datePrelevement: dateStr,
  origine: z.string().trim().max(160).optional().or(z.literal("")),
  preleveur: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Prélèvement R&D interne (terre crue, fibres, biosourcés) : rattaché à une
 * formulation existante ou créée à la volée (nom + campagne), SANS essais
 * automatiques : la série d'essais s'enchaîne à la main via ajouterEssai
 * (granulométrie, VBS, teneur en eau, compression, retrait, conductivité...).
 */
export async function creerPrelevementRD(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = prelevementRDSchema.parse({
    formulationId: formData.get("formulationId") ?? "",
    nouvelleFormulationNom: formData.get("nouvelleFormulationNom") ?? "",
    nouvelleFormulationCampagne:
      formData.get("nouvelleFormulationCampagne") ?? "",
    materiau: formData.get("materiau") ?? "",
    reference: formData.get("reference") ?? "",
    datePrelevement: formData.get("datePrelevement") ?? "",
    origine: formData.get("origine") ?? "",
    preleveur: formData.get("preleveur") ?? "",
    note: formData.get("note") ?? "",
  });
  // Le flux R&D vit dans l'espace COURANT (sélectionné) : en mode « tous »,
  // on ne saurait pas dans quelle entreprise ranger la campagne.
  const espace = requireEspaceCourant(me);

  let formulationId: string;
  if (d.formulationId) {
    const f = await db.formulationLabo.findUnique({
      where: { id: d.formulationId },
      select: { id: true, espaceId: true },
    });
    // Égalité STRICTE avec l'espace courant : le prélèvement y est créé, sa
    // formulation doit vivre dans le même espace.
    if (!f || f.espaceId !== espace.id) {
      throw new Error("Formulation inconnue dans cet espace");
    }
    formulationId = f.id;
  } else if (d.nouvelleFormulationNom) {
    const f = await db.formulationLabo.create({
      data: {
        espaceId: espace.id,
        nom: d.nouvelleFormulationNom,
        campagne: d.nouvelleFormulationCampagne || null,
        creePar: me.id,
      },
      select: { id: true },
    });
    formulationId = f.id;
  } else {
    throw new Error(
      "Choisissez une formulation existante ou nommez-en une nouvelle"
    );
  }

  const p = await db.prelevementLabo.create({
    data: {
      espaceId: espace.id,
      formulationId,
      reference: d.reference,
      materiau: d.materiau,
      datePrelevement: jour(d.datePrelevement),
      origine: d.origine || null,
      preleveur: d.preleveur || null,
      note: d.note || null,
      creePar: me.id,
    },
    select: { id: true },
  });
  revalLabo(p.id);
}

export async function supprimerPrelevement(id: string) {
  const me = await requireAdminOrConducteur();
  const p = await db.prelevementLabo.findUnique({
    where: { id },
    select: { id: true, espaceId: true, chantierId: true },
  });
  if (!p) return;
  await gardeObjetLabo(me, p.chantierId, p.espaceId);
  // Confirmation côté interface ; la cascade Prisma emporte éprouvettes et
  // essais du prélèvement.
  await db.prelevementLabo.delete({ where: { id } });
  revalLabo(null, p.chantierId);
}

// =====================================================
// FORMULATION (référentiel R&D)
// =====================================================

const formulationSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(120),
  campagne: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  composition: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function creerFormulation(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = formulationSchema.parse({
    nom: formData.get("nom") ?? "",
    campagne: formData.get("campagne") ?? "",
    description: formData.get("description") ?? "",
    composition: formData.get("composition") ?? "",
  });
  const espace = requireEspaceCourant(me);
  await db.formulationLabo.create({
    data: {
      espaceId: espace.id,
      nom: d.nom,
      campagne: d.campagne || null,
      description: d.description || null,
      composition: d.composition || null,
      creePar: me.id,
    },
  });
  revalLabo();
}

export async function majFormulation(id: string, formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = formulationSchema.parse({
    nom: formData.get("nom") ?? "",
    campagne: formData.get("campagne") ?? "",
    description: formData.get("description") ?? "",
    composition: formData.get("composition") ?? "",
  });
  const f = await db.formulationLabo.findUnique({
    where: { id },
    select: { espaceId: true },
  });
  if (!f) throw new Error("Formulation introuvable");
  verifierEspaceObjet(me, f.espaceId);
  await db.formulationLabo.update({
    where: { id },
    data: {
      nom: d.nom,
      campagne: d.campagne || null,
      description: d.description || null,
      composition: d.composition || null,
    },
  });
  revalLabo();
}

// =====================================================
// ÉQUIPEMENT (traçabilité métrologique minimale)
// =====================================================

const equipementSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(120),
  dateEtalonnage: dateOpt.optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function creerEquipement(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = equipementSchema.parse({
    nom: formData.get("nom") ?? "",
    dateEtalonnage: formData.get("dateEtalonnage") ?? "",
    note: formData.get("note") ?? "",
  });
  const espace = requireEspaceCourant(me);
  await db.equipementLabo.create({
    data: {
      espaceId: espace.id,
      nom: d.nom,
      dateEtalonnage: d.dateEtalonnage ? jour(d.dateEtalonnage) : null,
      note: d.note || null,
    },
  });
  revalLabo();
}

export async function majEquipement(id: string, formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = equipementSchema.parse({
    nom: formData.get("nom") ?? "",
    dateEtalonnage: formData.get("dateEtalonnage") ?? "",
    note: formData.get("note") ?? "",
  });
  const eq = await db.equipementLabo.findUnique({
    where: { id },
    select: { espaceId: true },
  });
  if (!eq) throw new Error("Équipement introuvable");
  verifierEspaceObjet(me, eq.espaceId);
  await db.equipementLabo.update({
    where: { id },
    data: {
      nom: d.nom,
      dateEtalonnage: d.dateEtalonnage ? jour(d.dateEtalonnage) : null,
      note: d.note || null,
    },
  });
  revalLabo();
}

// =====================================================
// ESSAI : ajout, résultat, annulation
// =====================================================

const essaiSchema = z.object({
  prelevementId: z.string().min(1),
  eprouvetteId: z.string().optional().or(z.literal("")),
  type: z.string().trim().min(1, "Type d'essai requis").max(80),
  norme: z.string().trim().max(80).optional().or(z.literal("")),
  protocole: z.string().trim().max(2000).optional().or(z.literal("")),
  echeance: dateOpt.optional(),
  equipementId: z.string().optional().or(z.literal("")),
});

/**
 * Ajoute un essai à un prélèvement : norme OU protocole libre (indispensable
 * pour la terre crue et les biosourcés, sans protocole consensuel). Pour un
 * essai de compression sur un prélèvement chantier, le seuil est dérivé
 * d'office de la classe prescrite.
 */
export async function ajouterEssai(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = essaiSchema.parse({
    prelevementId: formData.get("prelevementId") ?? "",
    eprouvetteId: formData.get("eprouvetteId") ?? "",
    type: formData.get("type") ?? "",
    norme: formData.get("norme") ?? "",
    protocole: formData.get("protocole") ?? "",
    echeance: formData.get("echeance") ?? "",
    equipementId: formData.get("equipementId") ?? "",
  });
  const p = await prelevementGarde(me, d.prelevementId);

  // L'éprouvette, si citée, doit appartenir à CE prélèvement. Sa géométrie
  // sert au seuil de compression (référence cube ou cylindre).
  let eprouvetteId: string | null = null;
  let geometrieEprouvette: string | null = null;
  if (d.eprouvetteId) {
    const ep = await db.eprouvetteLabo.findUnique({
      where: { id: d.eprouvetteId },
      select: { id: true, prelevementId: true, geometrie: true },
    });
    if (!ep || ep.prelevementId !== p.id) {
      throw new Error("Éprouvette inconnue sur ce prélèvement");
    }
    eprouvetteId = ep.id;
    geometrieEprouvette = ep.geometrie;
  }

  // L'équipement, si cité, doit appartenir au même espace.
  let equipementId: string | null = null;
  if (d.equipementId) {
    const eq = await db.equipementLabo.findUnique({
      where: { id: d.equipementId },
      select: { id: true, espaceId: true },
    });
    if (!eq || eq.espaceId !== p.espaceId) {
      throw new Error("Équipement inconnu dans cet espace");
    }
    equipementId = eq.id;
  }

  // Compression sur un prélèvement à classe prescrite : seuil automatique,
  // référence cube ou cylindre selon la géométrie de l'éprouvette citée
  // (sans éprouvette, référence cylindre, la convention du contrôle courant).
  const seuil = /compression/i.test(d.type)
    ? seuilDepuisClasse(p.classePrescrite, geometrieEprouvette)
    : null;

  await db.essaiLabo.create({
    data: {
      prelevementId: p.id,
      eprouvetteId,
      equipementId,
      type: d.type,
      norme: d.norme || null,
      protocole: d.protocole || null,
      echeance: d.echeance ? jour(d.echeance) : null,
      seuil,
      creePar: me.id,
    },
  });
  revalLabo(p.id, p.chantierId);
}

const resultatSchema = z.object({
  essaiId: z.string().min(1),
  valeur: z.coerce.number().finite("Valeur invalide"),
  unite: z.string().trim().min(1, "Unité requise").max(20),
  incertitude: z.string().trim().max(40).optional().or(z.literal("")),
  dateRealisation: dateStr,
  operateur: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Saisit LE résultat d'un essai (V1 : un résultat par essai) : calcule la
 * conformité contre le seuil (valeur >= seuil), passe l'essai en VALIDE et,
 * en cas de NON-CONFORMITÉ sur un prélèvement de chantier, alerte les
 * pilotes de l'espace (ADMIN + CONDUCTEUR) et les chefs membres du chantier.
 */
export async function saisirResultat(formData: FormData) {
  const me = await requireAdminOrConducteur();
  const d = resultatSchema.parse({
    essaiId: formData.get("essaiId") ?? "",
    valeur: formData.get("valeur") ?? "",
    unite: formData.get("unite") ?? "",
    incertitude: formData.get("incertitude") ?? "",
    dateRealisation: formData.get("dateRealisation") ?? "",
    operateur: formData.get("operateur") ?? "",
  });
  const essai = await db.essaiLabo.findUnique({
    where: { id: d.essaiId },
    select: {
      id: true,
      statut: true,
      type: true,
      seuil: true,
      prelevement: {
        select: {
          id: true,
          espaceId: true,
          chantierId: true,
          reference: true,
          chantier: { select: { nom: true } },
        },
      },
      eprouvette: { select: { code: true } },
    },
  });
  if (!essai) throw new Error("Essai introuvable");
  await gardeObjetLabo(
    me,
    essai.prelevement.chantierId,
    essai.prelevement.espaceId
  );
  if (essai.statut === "ANNULE") {
    throw new Error("Cet essai est annulé : créez un nouvel essai");
  }

  const seuil = essai.seuil == null ? null : Number(essai.seuil);
  const conforme = verdictConformite(d.valeur, seuil);

  await db.essaiLabo.update({
    where: { id: essai.id },
    data: {
      valeur: d.valeur,
      unite: d.unite,
      incertitude: d.incertitude || null,
      dateRealisation: jour(d.dateRealisation),
      operateur: d.operateur || null,
      statut: "VALIDE",
      conforme,
    },
  });

  // Alerte de non-conformité, UNIQUEMENT pour le flux chantier : les pilotes
  // de l'espace (même ciblage que le moteur de relances) plus les chefs
  // membres du chantier (même mécanique que la GED chantier). Les notify()
  // sont silencieux en échec : l'écriture du résultat ne se rejoue pas.
  if (conforme === false && essai.prelevement.chantierId) {
    // Deux liens : /labo est réservé aux pilotes (le layout redirige les
    // autres vers /dashboard), les chefs sont donc envoyés sur la page du
    // chantier, qu'ils peuvent ouvrir.
    const lienPilote = `/labo/${essai.prelevement.id}`;
    const lienChef = `/chantiers/${essai.prelevement.chantierId}`;
    const titre =
      `Essai NON CONFORME : ${essai.type.toLowerCase()} ` +
      `${essai.prelevement.reference} (${fmtNombre(d.valeur)} ${d.unite} < ` +
      `seuil ${fmtNombre(seuil as number)})`;
    const message =
      `Chantier ${essai.prelevement.chantier?.nom ?? ""}`.trimEnd() +
      `${essai.eprouvette ? `, éprouvette ${essai.eprouvette.code}` : ""}. ` +
      "Résultat sous le seuil de la classe prescrite : prévoir un " +
      "contre-essai et informer le contrôle technique.";

    const [pilotes, membres] = await Promise.all([
      db.espaceMembre.findMany({
        where: {
          espaceId: essai.prelevement.espaceId,
          role: { in: ["ADMIN", "CONDUCTEUR"] },
        },
        select: { userId: true },
      }),
      db.chantierMembre.findMany({
        where: { chantierId: essai.prelevement.chantierId },
        select: { user: { select: { id: true, role: true } } },
      }),
    ]);
    // Un pilote également membre du chantier garde le lien labo (le plus
    // précis de ceux qu'il peut ouvrir).
    const cibles = new Map<string, string>();
    for (const m of pilotes) cibles.set(m.userId, lienPilote);
    for (const m of membres) {
      if (m.user.role === "CHEF" && !cibles.has(m.user.id)) {
        cibles.set(m.user.id, lienChef);
      }
    }
    for (const [userId, lien] of cibles) {
      await notify(userId, "AUTRE", titre, message, lien);
    }
  }

  revalLabo(essai.prelevement.id, essai.prelevement.chantierId);
}

export async function annulerEssai(id: string) {
  const me = await requireAdminOrConducteur();
  const essai = await db.essaiLabo.findUnique({
    where: { id },
    select: {
      id: true,
      prelevement: { select: { id: true, espaceId: true, chantierId: true } },
    },
  });
  if (!essai) return;
  await gardeObjetLabo(
    me,
    essai.prelevement.chantierId,
    essai.prelevement.espaceId
  );
  await db.essaiLabo.update({
    where: { id },
    data: { statut: "ANNULE" },
  });
  revalLabo(essai.prelevement.id, essai.prelevement.chantierId);
}
