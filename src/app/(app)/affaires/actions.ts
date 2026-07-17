"use server";

// ─── Actions serveur du module Affaires (CRM) ────────────────────────────────
// Toutes les actions sont réservées aux pilotes (ADMIN + CONDUCTEUR) et
// bornées à l'espace : une affaire appartient à une entreprise, comme un
// chantier. Chaque affaire porte son propre canal de messagerie (Canal avec
// affaireId, sans chantierId) qui journalise les mouvements du pipeline.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireEspaceCourant,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";
import {
  checklistType,
  estDormante,
  etapesDe,
  libelleEtape,
  parseChecklist,
  type TypologieAffaire,
} from "@/lib/affaires";
import {
  getOrCreateGeneral,
  getOrCreateCanalAffaire,
} from "@/features/messaging";

const TYPOLOGIES = [
  "PERMIS_CONSTRUIRE",
  "ETUDE_STRUCTURE",
  "TRAVAUX",
  "LABO",
] as const;

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
  typologie: z.enum(TYPOLOGIES),
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

  const typologie = data.typologie as TypologieAffaire;
  const premiereEtape = etapesDe(typologie)[0];
  const responsableId = data.responsableId || null;
  if (responsableId) {
    await verifierPersonneInterne(espace.id, responsableId, "Responsable");
  }

  const affaire = await db.affaire.create({
    data: {
      espaceId: espace.id,
      titre: data.titre,
      typologie,
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
      checklist: checklistType(typologie).map((c) => ({ ...c })),
      creePar: me.id,
    },
  });

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
      `(${libelleEtape(typologie, premiereEtape.cle)}).`
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
 *  Pipeline (drag du kanban)
 * ----------------------------------------------------------------------- */

export async function changerEtape(affaireId: string, etapeCle: string) {
  const me = await requireAdminOrConducteur();
  const affaire = await chargerAffaire(me, affaireId);
  if (affaire.statut !== "EN_COURS") {
    throw new Error("Cette affaire est close : rouvrez-la avant de la déplacer");
  }
  const typologie = affaire.typologie as TypologieAffaire;
  if (!etapesDe(typologie).some((e) => e.cle === etapeCle)) {
    throw new Error("Étape inconnue pour cette typologie");
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
    `Étape : ${libelleEtape(typologie, affaire.etapeCle)} -> ` +
      `${libelleEtape(typologie, etapeCle)} (${me.name}).`
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
  if (nouveauResponsable) {
    await verifierPersonneInterne(
      affaire.espaceId,
      nouveauResponsable,
      "Responsable"
    );
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
  const items = parseChecklist(affaire.checklist);
  const item = items.find((i) => i.cle === cle);
  if (!item) throw new Error("Élément de checklist inconnu");
  item.fait = fait;
  await db.affaire.update({
    where: { id: affaireId },
    data: { checklist: items.map((c) => ({ ...c })) },
  });
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
