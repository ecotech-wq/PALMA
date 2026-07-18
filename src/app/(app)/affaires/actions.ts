"use server";

// ─── Actions serveur du module Affaires (CRM) ────────────────────────────────
// Toutes les actions sont réservées aux pilotes (ADMIN + CONDUCTEUR) et
// bornées à l'espace : une affaire appartient à une entreprise, comme un
// chantier. Chaque affaire porte son propre canal de messagerie (Canal avec
// affaireId, sans chantierId) qui journalise les mouvements du pipeline.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireEspaceCourant,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";
import {
  estDormante,
  parseChecklist,
  texteTraceActionConfiee,
  texteTracePiece,
  texteTraceProchaineAction,
  texteTraceResponsable,
  type TypologieAffaire,
} from "@/lib/affaires";
import {
  checklistInitiale,
  etapesParDefautDeTypologie,
  libelleEtapeDe,
  parseEtapes,
  type EtapePipeline,
} from "@/lib/pipelines";
import {
  getOrCreateGeneral,
  getOrCreateCanalAffaire,
} from "@/features/messaging";

/** Valeurs de l'enum TypologieAffaire : la colonne reste en base (compat).
 *  Une procédure personnalisée retombe sur TRAVAUX, valeur neutre jamais
 *  affichée (le pipeline porte libellé et couleur). */
const TYPOLOGIES = [
  "PERMIS_CONSTRUIRE",
  "ETUDE_STRUCTURE",
  "TRAVAUX",
  "LABO",
] as const;

function typologieDepuisCle(cle: string): TypologieAffaire {
  return (TYPOLOGIES as readonly string[]).includes(cle)
    ? (cle as TypologieAffaire)
    : "TRAVAUX";
}

/** Étapes de l'affaire : celles de SON pipeline ; repli sur le modèle par
 *  défaut de sa typologie pour une donnée antérieure au backfill. */
async function etapesDeLAffaire(affaire: {
  pipelineId: string | null;
  typologie: TypologieAffaire | string;
}): Promise<EtapePipeline[]> {
  if (affaire.pipelineId) {
    const pipeline = await db.pipelineAffaire.findUnique({
      where: { id: affaire.pipelineId },
      select: { etapes: true },
    });
    if (pipeline) return parseEtapes(pipeline.etapes);
  }
  return etapesParDefautDeTypologie(String(affaire.typologie));
}

/* -------------------------------------------------------------------------
 *  Gardes et utilitaires
 * ----------------------------------------------------------------------- */

/** Frontière d'espace sur UNE affaire : même règle que pour un chantier
 *  (verifierEspaceDuChantier), un id forgé d'un autre espace est refusé. */
async function chargerAffaire(me: CurrentUser, affaireId: string) {
  const affaire = await db.affaire.findUnique({ where: { id: affaireId } });
  if (!affaire) throw new Error("Affaire introuvable");
  if (me.espaceIds && !me.espaceIds.includes(affaire.espaceId)) {
    throw new Error("Cette affaire n'appartient pas à votre espace");
  }
  return affaire;
}

/** Réarme la relance de dormance : l'idempotence du RelanceLog
 *  (@@unique objetType/objetId/palier) vaut « une seule fois, à vie ».
 *  Dès que l'affaire bouge vraiment (changement d'étape, nouvelle
 *  échéance d'action, réouverture), on purge le log AFFAIRE_DORMANTE
 *  pour qu'une re-dormance future déclenche à nouveau une relance. */
async function rearmerRelanceDormance(affaireId: string) {
  try {
    await db.relanceLog.deleteMany({
      where: {
        objetType: "AFFAIRE",
        objetId: affaireId,
        palier: "AFFAIRE_DORMANTE",
      },
    });
  } catch (e) {
    // Le réarmement ne doit jamais bloquer l'action métier.
    console.error("rearmerRelanceDormance failed:", e);
  }
}

/** Valide côté serveur qu'une personne (responsable d'affaire, cible d'une
 *  action confiée) est bien un pilote interne ACTIF membre de l'espace de
 *  l'affaire : exactement le filtre des listes UI. Sans cette garde, un id
 *  forgé (client, salarié d'une autre entreprise) recevrait notifications
 *  et relances portant le titre de l'affaire. */
async function verifierPersonneInterne(
  espaceId: string,
  userId: string,
  contexte: string
): Promise<{ id: string; name: string }> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      status: true,
      role: true,
      espaces: { where: { espaceId }, select: { espaceId: true } },
    },
  });
  if (
    !u ||
    u.status !== "ACTIVE" ||
    (u.role !== "ADMIN" && u.role !== "CONDUCTEUR") ||
    u.espaces.length === 0
  ) {
    throw new Error(
      `${contexte} : pilote (admin ou conducteur) actif de l'espace requis`
    );
  }
  return { id: u.id, name: u.name };
}

/** Canal de l'affaire : helper partagé avec la messagerie (créé à la
 *  création de l'affaire ; recréé au besoin pour les données antérieures,
 *  même tolérance que getOrCreateGeneral). */
async function canalDeLAffaire(affaireId: string): Promise<string> {
  return (await getOrCreateCanalAffaire(affaireId)).id;
}

/** Message « système » dans le canal de l'affaire (auteur null : le fil
 *  affiche « Système »). Silencieux en cas d'échec, comme insertSystemMessage
 *  du journal : la trace ne doit jamais bloquer l'action métier. */
async function tracerDansCanal(affaireId: string, texte: string) {
  try {
    const canalId = await canalDeLAffaire(affaireId);
    const now = new Date();
    await db.journalMessage.create({
      data: {
        chantierId: null,
        canalId,
        authorId: null,
        date: new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
        ),
        type: "NOTE",
        texte,
      },
    });
  } catch (e) {
    console.error("tracerDansCanal (affaire) failed:", e);
  }
}

function revaliderAffaires(affaireId?: string) {
  revalidatePath("/affaires");
  if (affaireId) {
    revalidatePath(`/affaires/${affaireId}`);
    revalidatePath(`/affaires/${affaireId}/canal`);
    // Le fil vit désormais dans la messagerie : les traces d'étape et
    // d'issue doivent y apparaître sans attendre le polling.
    revalidatePath(`/messagerie/affaire/${affaireId}`);
  }
}

/* -------------------------------------------------------------------------
 *  Création
 * ----------------------------------------------------------------------- */

const creerSchema = z.object({
  pipelineId: z.string().min(1, "Choisissez une procédure"),
  titre: z.string().trim().min(1, "Titre requis").max(120),
  contactNom: z.string().trim().min(1, "Nom du contact requis").max(120),
  contactTel: z.string().trim().max(40).optional().or(z.literal("")),
  contactEmail: z
    .string()
    .trim()
    .email("Courriel invalide")
    .optional()
    .or(z.literal("")),
  adresse: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  valeurEstimee: z.coerce.number().nonnegative().optional(),
  responsableId: z.string().optional().or(z.literal("")),
  prochaineAction: z.string().trim().max(200).optional().or(z.literal("")),
  prochaineActionLe: z.string().optional().or(z.literal("")),
});

export async function creerAffaire(input: unknown): Promise<{ id: string }> {
  const me = await requireAdminOrConducteur();
  const espace = requireEspaceCourant(me);
  const data = creerSchema.parse(input);

  // La procédure choisie doit être une procédure ACTIVE de l'espace
  // courant : un id forgé (autre espace, procédure désactivée) est refusé.
  const pipeline = await db.pipelineAffaire.findUnique({
    where: { id: data.pipelineId },
  });
  if (!pipeline || pipeline.espaceId !== espace.id) {
    throw new Error("Procédure inconnue dans cet espace");
  }
  if (!pipeline.actif) {
    throw new Error("Cette procédure est désactivée");
  }
  const etapes = parseEtapes(pipeline.etapes);
  const premiereEtape = etapes[0];
  if (!premiereEtape) {
    throw new Error("Cette procédure n'a aucune étape : complétez-la d'abord");
  }
  const responsableId = data.responsableId || null;
  if (responsableId) {
    await verifierPersonneInterne(espace.id, responsableId, "Responsable");
  }

  const affaire = await db.affaire.create({
    data: {
      espaceId: espace.id,
      titre: data.titre,
      // Compat : la colonne typologie reste renseignée (jamais affichée).
      typologie: typologieDepuisCle(pipeline.cle),
      pipelineId: pipeline.id,
      etapeCle: premiereEtape.cle,
      etapeDepuis: new Date(),
      statut: "EN_COURS",
      contactNom: data.contactNom,
      contactTel: data.contactTel || null,
      contactEmail: data.contactEmail || null,
      adresse: data.adresse || null,
      description: data.description || null,
      valeurEstimee: data.valeurEstimee ?? null,
      prochaineAction: data.prochaineAction || null,
      prochaineActionLe: data.prochaineActionLe
        ? new Date(data.prochaineActionLe + "T00:00:00.000Z")
        : null,
      responsableId,
      // La checklist naît du MODÈLE du pipeline puis vit sa vie propre :
      // modifier le modèle ensuite ne touche pas les affaires existantes.
      checklist: checklistInitiale(pipeline),
      creePar: me.id,
    },
  });

  // Anti-course avec basculerActifPipeline : même relecture compensatoire
  // que creerAffaireRapide (une affaire EN COURS ne doit jamais naître sur
  // une procédure devenue inactive, elle serait invisible au kanban).
  const pipelineFrais = await db.pipelineAffaire.findUnique({
    where: { id: pipeline.id },
    select: { actif: true },
  });
  if (!pipelineFrais?.actif) {
    await db.affaire.delete({ where: { id: affaire.id } });
    throw new Error("Cette procédure vient d'être désactivée");
  }

  // Le canal de l'affaire naît AVEC l'affaire (fil de discussion et
  // journal des mouvements), puis reçoit son message de bienvenue.
  await db.canal.create({
    data: {
      affaireId: affaire.id,
      nom: "Général",
      visibility: "INTERNE",
      ordre: 0,
      createdById: me.id,
    },
  });
  await tracerDansCanal(
    affaire.id,
    `Affaire créée par ${me.name} : ${data.titre} ` +
      `(${pipeline.libelle} : ${premiereEtape.libelle}). ` +
      "Le dossier client est prêt : chaque pièce jointe du fil " +
      "pourra y être rangée par catégorie."
  );

  if (responsableId && responsableId !== me.id) {
    await notify(
      responsableId,
      "AUTRE",
      `Affaire : ${data.titre}`,
      `${me.name} vous a désigné responsable de cette affaire`,
      `/affaires/${affaire.id}`
    );
  }

  revaliderAffaires();
  return { id: affaire.id };
}

/* -------------------------------------------------------------------------
 *  Création rapide (bas de colonne du kanban, façon Trello)
 * ----------------------------------------------------------------------- */

const creerRapideSchema = z.object({
  pipelineId: z.string().min(1, "Procédure requise"),
  etapeCle: z.string().min(1, "Étape requise"),
  titre: z.string().trim().min(1, "Titre requis").max(120),
});

/**
 * Crée une affaire depuis le pied d'une colonne du kanban : juste un titre,
 * dans CETTE étape de CETTE procédure. Le contact reste vide (la fiche le
 * réclame ensuite) : une affaire naît d'un appel, on ne perd pas la carte
 * pour un champ. L'espace est celui DE LA PROCÉDURE (une procédure
 * appartient à une seule entreprise), borné par la frontière espaceIds :
 * pas besoin d'espace courant, la création marche aussi en mode « tous ».
 */
export async function creerAffaireRapide(
  input: unknown
): Promise<{ id: string }> {
  const me = await requireAdminOrConducteur();
  const data = creerRapideSchema.parse(input);

  const pipeline = await db.pipelineAffaire.findUnique({
    where: { id: data.pipelineId },
  });
  // Frontière d'espace : un id de procédure forgé (autre entreprise) est
  // refusé, même message que pour une procédure inexistante (pas d'oracle).
  if (
    !pipeline ||
    (me.espaceIds && !me.espaceIds.includes(pipeline.espaceId))
  ) {
    throw new Error("Procédure inconnue dans vos espaces");
  }
  if (!pipeline.actif) {
    throw new Error("Cette procédure est désactivée");
  }
  const etapes = parseEtapes(pipeline.etapes);
  const etape = etapes.find((e) => e.cle === data.etapeCle);
  if (!etape) {
    throw new Error("Étape inconnue pour cette procédure");
  }

  const affaire = await db.affaire.create({
    data: {
      espaceId: pipeline.espaceId,
      titre: data.titre,
      // Compat : la colonne typologie reste renseignée (jamais affichée).
      typologie: typologieDepuisCle(pipeline.cle),
      pipelineId: pipeline.id,
      etapeCle: etape.cle,
      etapeDepuis: new Date(),
      statut: "EN_COURS",
      // Création rapide : contact volontairement vide, la fiche le réclame.
      contactNom: "",
      checklist: checklistInitiale(pipeline),
      creePar: me.id,
    },
  });

  // Anti-course avec basculerActifPipeline : la procédure a pu être
  // désactivée entre notre lecture de `actif` et le create (son re-comptage
  // ne nous voyait pas encore). On relit : si elle est devenue inactive,
  // l'affaire naîtrait invisible au kanban ; on la retire et on refuse.
  const frais = await db.pipelineAffaire.findUnique({
    where: { id: pipeline.id },
    select: { actif: true },
  });
  if (!frais?.actif) {
    await db.affaire.delete({ where: { id: affaire.id } });
    throw new Error("Cette procédure vient d'être désactivée");
  }

  // Même naissance que creerAffaire : le canal du fil arrive AVEC l'affaire.
  await db.canal.create({
    data: {
      affaireId: affaire.id,
      nom: "Général",
      visibility: "INTERNE",
      ordre: 0,
      createdById: me.id,
    },
  });
  await tracerDansCanal(
    affaire.id,
    `Affaire créée par ${me.name} : ${data.titre} ` +
      `(${pipeline.libelle} : ${etape.libelle}). ` +
      "Complétez le contact sur la fiche."
  );

  revaliderAffaires();
  return { id: affaire.id };
}

/* -------------------------------------------------------------------------
 *  Pipeline (drag du kanban)
 * ----------------------------------------------------------------------- */

export async function changerEtape(affaireId: string, etapeCle: string) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  if (affaire.statut !== "EN_COURS") {
    throw new Error("Cette affaire est close : rouvrez-la avant de la déplacer");
  }
  // Validation contre les étapes DU pipeline de l'affaire (les procédures
  // sont désormais des données propres à chaque entreprise).
  const etapes = await etapesDeLAffaire(affaire);
  if (!etapes.some((e) => e.cle === etapeCle)) {
    throw new Error("Étape inconnue pour cette procédure");
  }
  if (affaire.etapeCle === etapeCle) return;

  await db.affaire.update({
    where: { id: affaireId },
    data: { etapeCle, etapeDepuis: new Date() },
  });
  // L'affaire avance : une prochaine dormance devra pouvoir re-relancer.
  await rearmerRelanceDormance(affaireId);
  await tracerDansCanal(
    affaireId,
    `Étape : ${libelleEtapeDe(etapes, affaire.etapeCle)} -> ` +
      `${libelleEtapeDe(etapes, etapeCle)} (${me.name}).`
  );
  revaliderAffaires(affaireId);
}

/* -------------------------------------------------------------------------
 *  Mise à jour de la fiche
 * ----------------------------------------------------------------------- */

const majSchema = z.object({
  titre: z.string().trim().min(1).max(120).optional(),
  contactNom: z.string().trim().min(1).max(120).optional(),
  contactTel: z.string().trim().max(40).nullable().optional(),
  contactEmail: z
    .string()
    .trim()
    .email("Courriel invalide")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  adresse: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  valeurEstimee: z.coerce.number().nonnegative().nullable().optional(),
  prochaineAction: z.string().trim().max(200).nullable().optional(),
  /** "AAAA-MM-JJ" ou null pour effacer l'échéance. */
  prochaineActionLe: z.string().nullable().optional(),
  responsableId: z.string().nullable().optional(),
});

export async function majAffaire(affaireId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  const data = majSchema.parse(input);

  const nouveauResponsable =
    data.responsableId !== undefined &&
    data.responsableId !== affaire.responsableId
      ? data.responsableId
      : undefined;
  // Nom du nouveau responsable : sert à la notification ET à la trace du
  // fil (le canal de l'affaire journalise chaque geste de pilotage).
  let nomNouveauResponsable: string | null = null;
  if (nouveauResponsable) {
    const resp = await verifierPersonneInterne(
      affaire.espaceId,
      nouveauResponsable,
      "Responsable"
    );
    nomNouveauResponsable = resp.name;
  }

  // Nouvelle échéance d'action : calculée UNE fois, pour l'écriture et
  // pour détecter un vrai changement (réarmement de la relance de
  // dormance). undefined = champ non envoyé, null = échéance effacée.
  const nouvelleEcheance =
    data.prochaineActionLe !== undefined
      ? data.prochaineActionLe
        ? new Date(data.prochaineActionLe + "T00:00:00.000Z")
        : null
      : undefined;
  const echeanceChangee =
    nouvelleEcheance !== undefined &&
    (nouvelleEcheance?.getTime() ?? null) !==
      (affaire.prochaineActionLe?.getTime() ?? null);

  // Libellé de la prochaine action : même logique undefined / null / texte
  // que l'échéance ("" envoyé par le formulaire vaut effacement).
  const nouveauLibelleAction =
    data.prochaineAction !== undefined
      ? data.prochaineAction || null
      : undefined;
  const libelleActionChange =
    nouveauLibelleAction !== undefined &&
    nouveauLibelleAction !== affaire.prochaineAction;

  await db.affaire.update({
    where: { id: affaireId },
    data: {
      ...(data.titre !== undefined && { titre: data.titre }),
      ...(data.contactNom !== undefined && { contactNom: data.contactNom }),
      ...(data.contactTel !== undefined && {
        contactTel: data.contactTel || null,
      }),
      ...(data.contactEmail !== undefined && {
        contactEmail: data.contactEmail || null,
      }),
      ...(data.adresse !== undefined && { adresse: data.adresse || null }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.valeurEstimee !== undefined && {
        valeurEstimee: data.valeurEstimee,
      }),
      ...(data.prochaineAction !== undefined && {
        prochaineAction: data.prochaineAction || null,
      }),
      ...(nouvelleEcheance !== undefined && {
        prochaineActionLe: nouvelleEcheance,
      }),
      ...(nouveauResponsable !== undefined && {
        responsableId: nouveauResponsable || null,
      }),
    },
  });

  // L'échéance a bougé (replanification) : la relance de dormance doit
  // pouvoir se re-déclencher si la nouvelle échéance est dépassée à son tour.
  if (echeanceChangee) {
    await rearmerRelanceDormance(affaireId);
  }

  // Journal vivant : la replanification et le changement de responsable
  // laissent leur trace dans le fil, comme un changement d'étape.
  if (libelleActionChange || echeanceChangee) {
    const libelle =
      nouveauLibelleAction !== undefined
        ? nouveauLibelleAction
        : affaire.prochaineAction;
    const echeance =
      nouvelleEcheance !== undefined
        ? nouvelleEcheance
        : affaire.prochaineActionLe;
    await tracerDansCanal(
      affaireId,
      texteTraceProchaineAction(libelle, echeance, me.name)
    );
  }
  if (nouveauResponsable !== undefined) {
    await tracerDansCanal(
      affaireId,
      texteTraceResponsable(nomNouveauResponsable, me.name)
    );
  }

  // Nouvelle assignation : la personne désignée est prévenue (motif
  // planning : on notifie qui reçoit du travail, jamais qui en perd).
  if (nouveauResponsable && nouveauResponsable !== me.id) {
    await notify(
      nouveauResponsable,
      "AUTRE",
      `Affaire : ${data.titre ?? affaire.titre}`,
      `${me.name} vous a désigné responsable de cette affaire`,
      `/affaires/${affaireId}`
    );
  }
  revaliderAffaires(affaireId);
}

export async function cocherChecklist(
  affaireId: string,
  cle: string,
  fait: boolean
) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);

  // La checklist est un JSON entier relu puis réécrit : deux écrivains
  // simultanés (fil, fiche, rangement GED) partiraient du même instantané
  // et la dernière écriture écraserait la première (une case cochée
  // disparaîtrait). Écriture conditionnelle optimiste : le where exige
  // que la base porte encore EXACTEMENT l'instantané lu (égalité
  // structurelle jsonb) ; sinon on relit et on rejoue.
  let snapshot: Prisma.InputJsonValue =
    affaire.checklist as Prisma.InputJsonValue;
  let libelle: string;
  for (let tentative = 0; ; tentative++) {
    const items = parseChecklist(snapshot);
    const item = items.find((i) => i.cle === cle);
    if (!item) throw new Error("Élément de checklist inconnu");
    // Idempotence : re-cocher une pièce déjà cochée (double tap, deux
    // onglets) ne réécrit rien et surtout ne duplique pas la trace du fil.
    if (item.fait === fait) return;
    item.fait = fait;
    const ecrit = await db.affaire.updateMany({
      where: { id: affaireId, checklist: { equals: snapshot } },
      data: { checklist: items.map((c) => ({ ...c })) },
    });
    if (ecrit.count === 1) {
      libelle = item.libelle;
      break;
    }
    if (tentative >= 4) {
      throw new Error("La checklist vient d'être modifiée, réessayez");
    }
    const frais = await db.affaire.findUnique({
      where: { id: affaireId },
      select: { checklist: true },
    });
    if (!frais) throw new Error("Affaire introuvable");
    snapshot = frais.checklist as Prisma.InputJsonValue;
  }
  await tracerDansCanal(affaireId, texteTracePiece(libelle, fait, me.name));
  revaliderAffaires(affaireId);
}

/* -------------------------------------------------------------------------
 *  Actions déléguées (tâches perso reliées à l'affaire)
 * ----------------------------------------------------------------------- */

const assignerSchema = z.object({
  cibleId: z.string().min(1, "Destinataire requis"),
  nom: z.string().trim().min(1, "Intitulé requis").max(200),
  dateDebut: z.coerce.date(),
  dateFin: z.coerce.date(),
});

/**
 * Confie une action de l'affaire à quelqu'un : tâche PERSO du destinataire
 * (proprietaireId = cible, motif creerTachePerso du planning), reliée à
 * l'affaire par affaireId, plus une notification. Invariant du planning
 * préservé : SOIT chantierId, SOIT proprietaireId.
 */
export async function assignerAction(affaireId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  const data = assignerSchema.parse(input);

  // Même filtre que la liste UI des cibles : pilote interne actif ET
  // membre de l'espace de l'affaire (un id forgé d'un salarié d'une
  // autre entreprise, d'un client ou d'un chef est refusé ici).
  const cible = await verifierPersonneInterne(
    affaire.espaceId,
    data.cibleId,
    "Destinataire"
  );

  const debut = new Date(data.dateDebut);
  const fin = new Date(data.dateFin);
  debut.setHours(0, 0, 0, 0);
  fin.setHours(0, 0, 0, 0);
  if (fin < debut) {
    throw new Error("La date de fin doit être après la date de début");
  }

  const t = await db.tache.create({
    data: {
      chantierId: null,
      proprietaireId: cible.id,
      affaireId,
      nom: data.nom.trim(),
      dateDebut: debut,
      dateFin: fin,
      priorite: 4,
      statut: "A_FAIRE",
    },
  });

  if (cible.id !== me.id) {
    await notify(
      cible.id,
      "AUTRE",
      `Affaire : ${affaire.titre}`,
      `${me.name} vous confie : ${data.nom.trim()}`,
      `/affaires/${affaireId}`
    );
  }
  // Trace du fil : l'échéance affichée vient de l'entrée BRUTE
  // ("AAAA-MM-JJ" coercée à minuit UTC), pas de `fin` normalisée à minuit
  // LOCAL, pour que le JJ/MM reste juste quel que soit le fuseau du serveur.
  await tracerDansCanal(
    affaireId,
    texteTraceActionConfiee(
      cible.name,
      data.nom.trim(),
      new Date(data.dateFin),
      me.name
    )
  );
  revalidatePath("/planning");
  revaliderAffaires(affaireId);
  return { id: t.id };
}

/* -------------------------------------------------------------------------
 *  Issues : gagner, perdre, convertir
 * ----------------------------------------------------------------------- */

export async function gagnerAffaire(affaireId: string) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  if (affaire.statut === "GAGNEE") return;
  await db.affaire.update({
    where: { id: affaireId },
    data: { statut: "GAGNEE", motifPerte: null },
  });
  await tracerDansCanal(affaireId, `Affaire gagnée (${me.name}).`);
  revaliderAffaires(affaireId);
}

export async function perdreAffaire(affaireId: string, motif: string) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  const motifNet = z
    .string()
    .trim()
    .min(1, "Indiquez le motif de la perte")
    .max(300)
    .parse(motif);
  if (affaire.statut === "PERDUE") return;
  await db.affaire.update({
    where: { id: affaireId },
    data: { statut: "PERDUE", motifPerte: motifNet },
  });
  await tracerDansCanal(affaireId, `Affaire perdue : ${motifNet} (${me.name}).`);
  revaliderAffaires(affaireId);
}

/** Rouvre une affaire close (mauvaise manipulation, client qui revient). */
export async function rouvrirAffaire(affaireId: string) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  if (affaire.statut === "EN_COURS") return;
  await db.affaire.update({
    where: { id: affaireId },
    data: { statut: "EN_COURS", motifPerte: null, etapeDepuis: new Date() },
  });
  // Réouverture = nouveau cycle de vie : la relance de dormance repart de zéro.
  await rearmerRelanceDormance(affaireId);
  await tracerDansCanal(affaireId, `Affaire rouverte (${me.name}).`);
  revaliderAffaires(affaireId);
}

/**
 * Convertit une affaire GAGNEE en chantier : même naissance qu'un chantier
 * créé à la main (createChantier de chantiers/actions.ts) : l'espace de
 * l'affaire, statut PLANIFIE, et le canal « Général » ensemencé par
 * getOrCreateGeneral (les chantiers de type CHANTIER n'ont pas d'autre
 * canal de gabarit). L'affaire garde le lien chantierId et son canal reçoit
 * la trace finale.
 */
export async function convertirEnChantier(
  affaireId: string
): Promise<{ chantierId: string }> {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  if (affaire.statut !== "GAGNEE") {
    throw new Error("Seule une affaire gagnée se convertit en chantier");
  }
  if (affaire.chantierId) {
    return { chantierId: affaire.chantierId };
  }

  // Même verrou de module qu'à la création manuelle : un chantier ne naît
  // que dans un espace dont le module « chantier » est actif.
  const espace = await db.espace.findUnique({
    where: { id: affaire.espaceId },
    select: { nom: true, modules: true },
  });
  if (!espace) throw new Error("Espace de l'affaire introuvable");
  if (!espace.modules.includes("chantier")) {
    throw new Error(
      `Le module « chantier » n'est pas actif dans l'espace ${espace.nom}`
    );
  }

  // Transaction anti-course : deux pilotes (ou deux onglets) qui cliquent
  // « Convertir » quasi simultanément liraient tous deux chantierId null,
  // et le perdant laisserait un chantier orphelin. L'écriture est donc
  // CONDITIONNELLE (updateMany where chantierId null) : si un concurrent a
  // gagné entre notre lecture et ici, on jette le chantier fraîchement créé
  // (cascade sur ses membres) et on renvoie celui déjà lié.
  const resultat = await db.$transaction(async (tx) => {
    const chantier = await tx.chantier.create({
      data: {
        nom: affaire.titre,
        type: "CHANTIER",
        espaceId: affaire.espaceId,
        statut: "PLANIFIE",
        adresse: affaire.adresse,
        description: affaire.description,
      },
    });
    // Le convertisseur devient membre du chantier : la conversion est
    // ouverte aux conducteurs (contrairement à createChantier, réservé à
    // l'admin) et requireChantierAccess exige l'adhésion pour les
    // non-admins ; sans cette ligne, un CONDUCTEUR créerait un chantier
    // qu'il ne pourrait pas ouvrir.
    await tx.chantierMembre.create({
      data: { chantierId: chantier.id, userId: me.id, addedById: me.id },
    });
    const maj = await tx.affaire.updateMany({
      where: { id: affaireId, chantierId: null },
      data: { chantierId: chantier.id },
    });
    if (maj.count === 0) {
      await tx.chantier.delete({ where: { id: chantier.id } });
      const deja = await tx.affaire.findUnique({
        where: { id: affaireId },
        select: { chantierId: true },
      });
      if (!deja?.chantierId) {
        throw new Error("Conversion concurrente : réessayez");
      }
      return { chantierId: deja.chantierId, cree: false };
    }
    return { chantierId: chantier.id, cree: true };
  });

  if (resultat.cree) {
    // Canal par défaut du chantier : le « Général », comme le flux de
    // création existant (créé à la volée par la messagerie, on l'ancre
    // ici, HORS transaction : sa propre tolérance aux courses suffit).
    await getOrCreateGeneral(resultat.chantierId);
    await tracerDansCanal(
      affaireId,
      `Convertie en chantier : ${affaire.titre} (${me.name}). ` +
        "Le suivi continue dans le module Chantiers."
    );
  }

  revalidatePath("/chantiers");
  revaliderAffaires(affaireId);
  return { chantierId: resultat.chantierId };
}

// Fil de l'affaire (canal) : les messages humains passent désormais par
// postChantierMessage (messagerie/actions.ts) avec une cible affaireId,
// qui apporte les médias (photos, vidéos, mémos vocaux, documents). Ce
// fichier ne garde que les traces système (tracerDansCanal).

/* -------------------------------------------------------------------------
 *  Aide au tri (utilisée par la page serveur, pas une action à proprement
 *  parler mais gardée ici pour rester près du module)
 * ----------------------------------------------------------------------- */

export async function compterDormantes(): Promise<number> {
  const me = await requireAdminOrConducteur();
  const affaires = await db.affaire.findMany({
    where: {
      statut: "EN_COURS",
      ...(me.espaceIds ? { espaceId: { in: me.espaceIds } } : {}),
    },
    select: { statut: true, prochaineActionLe: true, etapeDepuis: true },
  });
  const now = new Date();
  return affaires.filter((a) => estDormante(a, now) !== null).length;
}
