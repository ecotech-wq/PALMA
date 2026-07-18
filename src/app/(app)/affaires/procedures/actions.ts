"use server";

// ─── Actions serveur des PROCÉDURES d'affaires (pipelines éditables) ─────────
// Façon Pipedrive : l'utilisateur crée, renomme, colore, réordonne, active
// ou supprime les procédures de SON entreprise, et modifie leurs étapes et
// leur modèle de checklist. Gardes identiques au reste du module affaires :
// pilotes uniquement (ADMIN + CONDUCTEUR) et frontière d'espace stricte.
//
// Les étapes et le modèle de checklist sont des Json entiers relus puis
// réécrits : deux pilotes qui éditent en même temps partiraient du même
// instantané et la dernière écriture écraserait la première. Chaque
// mutation passe donc par une ÉCRITURE CONDITIONNELLE OPTIMISTE (le where
// exige l'instantané lu, sinon on relit et on rejoue), le même motif que
// cocherChecklist. NE PAS CASSER.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  requireAdminOrConducteur,
  requireEspaceCourant,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { isUniqueViolation } from "@/features/messaging/core/db-errors";
import {
  COULEURS_PIPELINE,
  LIBELLE_ETAPE_MAX,
  LIBELLE_PIPELINE_MAX,
  cleDepuisLibelle,
  cleEtapeUnique,
  modeleParDefaut,
  parseChecklistModele,
  parseEtapes,
  validerChecklistModele,
  validerEtapes,
  type EtapePipeline,
  type PieceModele,
} from "@/lib/pipelines";

/* -------------------------------------------------------------------------
 *  Gardes et utilitaires
 * ----------------------------------------------------------------------- */

/** Frontière d'espace sur UNE procédure : un id forgé d'un autre espace
 *  est refusé, même règle que chargerAffaire. */
async function chargerPipeline(me: CurrentUser, pipelineId: string) {
  const pipeline = await db.pipelineAffaire.findUnique({
    where: { id: pipelineId },
  });
  if (!pipeline) throw new Error("Procédure introuvable");
  if (me.espaceIds && !me.espaceIds.includes(pipeline.espaceId)) {
    throw new Error("Cette procédure n'appartient pas à votre espace");
  }
  return pipeline;
}

function revaliderProcedures(pipelineId?: string) {
  revalidatePath("/affaires/procedures");
  if (pipelineId) revalidatePath(`/affaires/procedures/${pipelineId}`);
  // Les onglets, colonnes et selects d'étape dépendent des procédures.
  revalidatePath("/affaires");
  revalidatePath("/messagerie");
}

const libellePipelineSchema = z
  .string()
  .trim()
  .min(1, "Donnez un nom à la procédure")
  .max(LIBELLE_PIPELINE_MAX, "Nom de procédure trop long");
const libelleEtapeSchema = z
  .string()
  .trim()
  .min(1, "Donnez un libellé")
  .max(LIBELLE_ETAPE_MAX, "Libellé trop long");
const couleurSchema = z.enum(COULEURS_PIPELINE);

/**
 * Écriture conditionnelle optimiste d'un champ Json de la procédure
 * (etapes ou checklistModele) : relit, transforme, écrit SI la base porte
 * encore l'instantané lu, sinon rejoue (5 tentatives). `transformer` lève
 * une Error affichable pour refuser la mutation (élément disparu...).
 */
async function ecrireJsonAvecRejeu(
  pipelineId: string,
  champ: "etapes" | "checklistModele",
  transformer: (courant: unknown) => Prisma.InputJsonValue
): Promise<void> {
  for (let tentative = 0; ; tentative++) {
    const frais = await db.pipelineAffaire.findUnique({
      where: { id: pipelineId },
      select: { etapes: true, checklistModele: true },
    });
    if (!frais) throw new Error("Procédure introuvable");
    const snapshot = frais[champ] as Prisma.InputJsonValue;
    const suivant = transformer(snapshot);
    const ecrit = await db.pipelineAffaire.updateMany({
      where: { id: pipelineId, [champ]: { equals: snapshot } },
      data: { [champ]: suivant },
    });
    if (ecrit.count === 1) return;
    if (tentative >= 4) {
      throw new Error("La procédure vient d'être modifiée, réessayez");
    }
  }
}

/* -------------------------------------------------------------------------
 *  Procédures : créer, renommer, colorer, réordonner, (dés)activer, supprimer
 * ----------------------------------------------------------------------- */

const creerSchema = z.object({
  libelle: libellePipelineSchema,
  couleur: couleurSchema,
  /** Clé d'un modèle par défaut à copier (étapes + pièces types), ou
   *  absent : la nouvelle procédure part d'un tronc minimal. */
  modeleCle: z.string().optional(),
});

/** Tronc minimal d'une procédure vierge : peu d'étapes par défaut
 *  (doctrine produit), l'utilisateur ajoute les siennes ensuite. */
const ETAPES_VIERGES: EtapePipeline[] = [
  { cle: "contact", libelle: "Prise de contact" },
  { cle: "devis", libelle: "Devis envoyé" },
  { cle: "signe", libelle: "Accord signé" },
];

export async function creerPipeline(
  input: unknown
): Promise<{ id: string }> {
  const me = await requireAdminOrConducteur();
  const espace = requireEspaceCourant(me);
  const data = creerSchema.parse(input);

  const modele = data.modeleCle ? modeleParDefaut(data.modeleCle) : null;
  const etapes = (modele?.etapes ?? ETAPES_VIERGES).map((e) => ({ ...e }));
  const pieces = (modele?.checklistModele ?? []).map((p) => ({ ...p }));
  const erreur = validerEtapes(etapes) ?? validerChecklistModele(pieces);
  if (erreur) throw new Error(erreur);

  const dernier = await db.pipelineAffaire.aggregate({
    where: { espaceId: espace.id },
    _max: { ordre: true },
  });
  const ordre = (dernier._max.ordre ?? -1) + 1;

  // Clé slug unique dans l'espace : en cas de collision (procédure
  // homonyme, ou course entre deux pilotes), on suffixe et on réessaie ;
  // l'unique [espaceId, cle] de la base tranche.
  const base = cleDepuisLibelle(data.libelle) || "procedure";
  for (let i = 0; ; i++) {
    const cle = i === 0 ? base : `${base}-${i + 1}`;
    try {
      const cree = await db.pipelineAffaire.create({
        data: {
          espaceId: espace.id,
          cle,
          libelle: data.libelle,
          couleur: data.couleur,
          ordre,
          etapes: etapes.map((e) => ({ ...e })),
          checklistModele: pieces.map((p) => ({ ...p })),
          actif: true,
        },
      });
      revaliderProcedures(cree.id);
      return { id: cree.id };
    } catch (e) {
      if (isUniqueViolation(e) && i < 20) continue;
      throw e;
    }
  }
}

const majSchema = z.object({
  libelle: libellePipelineSchema.optional(),
  couleur: couleurSchema.optional(),
});

/** Renommer une procédure ou changer son accent (la clé reste stable). */
export async function majPipeline(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = majSchema.parse(input);
  await db.pipelineAffaire.update({
    where: { id: pipeline.id },
    data: {
      ...(data.libelle !== undefined && { libelle: data.libelle }),
      ...(data.couleur !== undefined && { couleur: data.couleur }),
    },
  });
  revaliderProcedures(pipeline.id);
}

/**
 * Activer / désactiver. Une procédure inactive disparaît des onglets et de
 * la création ; on refuse donc de désactiver tant qu'il reste des affaires
 * EN COURS (elles deviendraient invisibles au kanban).
 */
export async function basculerActifPipeline(
  pipelineId: string,
  actif: boolean
) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  if (!actif) {
    // Écriture PUIS comptage dans la MÊME transaction (anti-course avec
    // creerAffaireRapide) : une affaire née entre les deux fait échouer la
    // désactivation (rollback), au lieu de finir invisible au kanban.
    await db.$transaction(async (tx) => {
      await tx.pipelineAffaire.update({
        where: { id: pipeline.id },
        data: { actif },
      });
      const enCours = await tx.affaire.count({
        where: { pipelineId: pipeline.id, statut: "EN_COURS" },
      });
      if (enCours > 0) {
        throw new Error(
          `${enCours} affaire${enCours > 1 ? "s" : ""} en cours sur cette ` +
            "procédure : terminez-les ou déplacez-les avant de la désactiver"
        );
      }
    });
  } else {
    await db.pipelineAffaire.update({
      where: { id: pipeline.id },
      data: { actif },
    });
  }
  revaliderProcedures(pipeline.id);
}

/**
 * Monter / descendre une procédure dans la liste de l'entreprise. La
 * transaction réécrit TOUS les ordres (0..n-1) : les doublons d'ordre
 * hérités d'une course se résorbent d'eux-mêmes.
 */
export async function reordonnerPipeline(
  pipelineId: string,
  sens: "monter" | "descendre"
) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);

  await db.$transaction(async (tx) => {
    const liste = await tx.pipelineAffaire.findMany({
      where: { espaceId: pipeline.espaceId },
      orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const i = liste.findIndex((p) => p.id === pipeline.id);
    if (i < 0) throw new Error("Procédure introuvable");
    const j = sens === "monter" ? i - 1 : i + 1;
    if (j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    for (let k = 0; k < liste.length; k++) {
      await tx.pipelineAffaire.update({
        where: { id: liste[k].id },
        data: { ordre: k },
      });
    }
  });
  revaliderProcedures(pipeline.id);
}

/** Supprimer une procédure : refusé s'il reste la moindre affaire (même
 *  close, l'historique pointe dessus) ; le FK RESTRICT double la garde.
 *  Refusé aussi pour la DERNIÈRE procédure de l'entreprise (miroir de
 *  « au moins une étape ») : un espace vidé ferait renaître les 4 modèles
 *  par défaut au seed paresseux de la lecture suivante. */
export async function supprimerPipeline(pipelineId: string) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const nbAffaires = await db.affaire.count({
    where: { pipelineId: pipeline.id },
  });
  if (nbAffaires > 0) {
    throw new Error(
      `${nbAffaires} affaire${nbAffaires > 1 ? "s" : ""} (en cours ou ` +
        "terminée) sur cette procédure : elle ne peut pas être supprimée. " +
        "Désactivez-la plutôt : l'historique est préservé"
    );
  }
  // Suppression PUIS re-comptage dans la MÊME transaction : deux pilotes
  // qui suppriment en parallèle les deux dernières procédures ne peuvent
  // pas vider l'espace (le perdant est annulé par rollback).
  await db.$transaction(async (tx) => {
    await tx.pipelineAffaire.delete({ where: { id: pipeline.id } });
    const restantes = await tx.pipelineAffaire.count({
      where: { espaceId: pipeline.espaceId },
    });
    if (restantes === 0) {
      throw new Error(
        "Une entreprise garde toujours au moins une procédure : " +
          "créez-en une autre avant de supprimer celle-ci"
      );
    }
  });
  revaliderProcedures();
}

/* -------------------------------------------------------------------------
 *  Étapes : ajouter, renommer, réordonner, supprimer
 * ----------------------------------------------------------------------- */

const ajouterEtapeSchema = z.object({
  libelle: libelleEtapeSchema,
  /** Clé de l'étape AVANT laquelle insérer ; absent = à la fin. */
  avantCle: z.string().optional(),
});

export async function ajouterEtape(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = ajouterEtapeSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "etapes", (courant) => {
    const etapes = parseEtapes(courant);
    const nouvelle: EtapePipeline = {
      cle: cleEtapeUnique(data.libelle, etapes),
      libelle: data.libelle,
    };
    const i = data.avantCle
      ? etapes.findIndex((e) => e.cle === data.avantCle)
      : -1;
    if (i >= 0) etapes.splice(i, 0, nouvelle);
    else etapes.push(nouvelle);
    const erreur = validerEtapes(etapes);
    if (erreur) throw new Error(erreur);
    return etapes.map((e) => ({ ...e }));
  });
  revaliderProcedures(pipeline.id);
}

const renommerEtapeSchema = z.object({
  cle: z.string().min(1),
  libelle: libelleEtapeSchema,
});

/** Renomme le libellé d'une étape : la clé (stockée dans Affaire.etapeCle)
 *  reste STABLE, les affaires en place ne bougent pas. */
export async function renommerEtape(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = renommerEtapeSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "etapes", (courant) => {
    const etapes = parseEtapes(courant);
    const etape = etapes.find((e) => e.cle === data.cle);
    if (!etape) throw new Error("Étape introuvable");
    etape.libelle = data.libelle;
    const erreur = validerEtapes(etapes);
    if (erreur) throw new Error(erreur);
    return etapes.map((e) => ({ ...e }));
  });
  revaliderProcedures(pipeline.id);
}

const deplacerSchema = z.object({
  cle: z.string().min(1),
  sens: z.enum(["monter", "descendre"]),
});

export async function deplacerEtape(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = deplacerSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "etapes", (courant) => {
    const etapes = parseEtapes(courant);
    const i = etapes.findIndex((e) => e.cle === data.cle);
    if (i < 0) throw new Error("Étape introuvable");
    const j = data.sens === "monter" ? i - 1 : i + 1;
    if (j < 0 || j >= etapes.length) return etapes.map((e) => ({ ...e }));
    [etapes[i], etapes[j]] = [etapes[j], etapes[i]];
    return etapes.map((e) => ({ ...e }));
  });
  revaliderProcedures(pipeline.id);
}

const supprimerEtapeSchema = z.object({
  cle: z.string().min(1),
  /** Étape de DESTINATION des affaires encore posées sur l'étape
   *  supprimée. Exigée dès qu'il en reste une (choix imposé à l'UI). */
  destinationCle: z.string().optional(),
});

/**
 * Supprime une étape. Si des affaires (en cours ou closes) y sont encore,
 * la destination est OBLIGATOIRE et le déplacement se fait dans la MÊME
 * transaction que la réécriture des étapes : jamais d'affaire orpheline
 * sur une étape disparue. Les affaires en cours repartent avec un
 * etapeDepuis frais (elles changent réellement de colonne).
 */
export async function supprimerEtape(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = supprimerEtapeSchema.parse(input);

  // Rejeu manuel : l'écriture conditionnelle vit ICI dans la transaction
  // avec le déplacement des affaires (tout ou rien).
  for (let tentative = 0; ; tentative++) {
    const frais = await db.pipelineAffaire.findUnique({
      where: { id: pipeline.id },
      select: { etapes: true },
    });
    if (!frais) throw new Error("Procédure introuvable");
    const snapshot = frais.etapes as Prisma.InputJsonValue;
    const etapes = parseEtapes(snapshot);
    const i = etapes.findIndex((e) => e.cle === data.cle);
    if (i < 0) throw new Error("Étape introuvable");
    if (etapes.length <= 1) {
      throw new Error("Une procédure doit garder au moins une étape");
    }

    const nbSurEtape = await db.affaire.count({
      where: { pipelineId: pipeline.id, etapeCle: data.cle },
    });
    let destination: EtapePipeline | null = null;
    if (nbSurEtape > 0) {
      destination =
        etapes.find(
          (e) => e.cle === data.destinationCle && e.cle !== data.cle
        ) ?? null;
      if (!destination) {
        throw new Error(
          `${nbSurEtape} affaire${nbSurEtape > 1 ? "s" : ""} sur cette ` +
            "étape : choisissez l'étape qui les accueillera"
        );
      }
    }

    const suivantes = etapes.filter((e) => e.cle !== data.cle);
    const ecrit = await db.$transaction(async (tx) => {
      const maj = await tx.pipelineAffaire.updateMany({
        where: { id: pipeline.id, etapes: { equals: snapshot } },
        data: { etapes: suivantes.map((e) => ({ ...e })) },
      });
      if (maj.count === 0) return false;
      // Déplace les affaires encore posées sur l'étape supprimée. Les
      // affaires EN COURS changent vraiment de colonne : leur ancienneté
      // d'étape repart d'ici (dormance honnête). Les closes suivent sans
      // toucher leur ancienneté (donnée historique).
      async function deplacerVers(cible: EtapePipeline) {
        await tx.affaire.updateMany({
          where: {
            pipelineId: pipeline.id,
            etapeCle: data.cle,
            statut: "EN_COURS",
          },
          data: { etapeCle: cible.cle, etapeDepuis: new Date() },
        });
        await tx.affaire.updateMany({
          where: {
            pipelineId: pipeline.id,
            etapeCle: data.cle,
            statut: { not: "EN_COURS" },
          },
          data: { etapeCle: cible.cle },
        });
      }
      if (destination) await deplacerVers(destination);
      // Anti-course avec changerEtape (drag du kanban) : une affaire a pu
      // arriver sur l'étape APRES le comptage fait HORS transaction. On
      // re-compte ICI : les retardataires suivent la destination s'il y en
      // a une, sinon on annule tout (rollback) plutôt que de laisser une
      // affaire orpheline sur une étape disparue.
      let retard = await tx.affaire.count({
        where: { pipelineId: pipeline.id, etapeCle: data.cle },
      });
      if (retard > 0 && destination) {
        await deplacerVers(destination);
        retard = await tx.affaire.count({
          where: { pipelineId: pipeline.id, etapeCle: data.cle },
        });
      }
      if (retard > 0) {
        throw new Error(
          "Des affaires viennent d'arriver sur cette étape : réessayez " +
            "en choisissant l'étape qui les accueillera"
        );
      }
      return true;
    });
    if (ecrit) break;
    if (tentative >= 4) {
      throw new Error("La procédure vient d'être modifiée, réessayez");
    }
  }
  revaliderProcedures(pipeline.id);
}

/* -------------------------------------------------------------------------
 *  Modèle de checklist (pièces types des FUTURES affaires ; les affaires
 *  existantes gardent leur checklist propre)
 * ----------------------------------------------------------------------- */

const ajouterPieceSchema = z.object({ libelle: libelleEtapeSchema });

export async function ajouterPieceModele(pipelineId: string, input: unknown) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = ajouterPieceSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "checklistModele", (courant) => {
    const pieces = parseChecklistModele(courant);
    pieces.push({
      cle: cleEtapeUnique(data.libelle, pieces),
      libelle: data.libelle,
    });
    const erreur = validerChecklistModele(pieces);
    if (erreur) throw new Error(erreur);
    return pieces.map((p) => ({ ...p }));
  });
  revaliderProcedures(pipeline.id);
}

export async function renommerPieceModele(
  pipelineId: string,
  input: unknown
) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = renommerEtapeSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "checklistModele", (courant) => {
    const pieces = parseChecklistModele(courant);
    const piece = pieces.find((p) => p.cle === data.cle);
    if (!piece) throw new Error("Pièce introuvable");
    piece.libelle = data.libelle;
    const erreur = validerChecklistModele(pieces);
    if (erreur) throw new Error(erreur);
    return pieces.map((p: PieceModele) => ({ ...p }));
  });
  revaliderProcedures(pipeline.id);
}

export async function deplacerPieceModele(
  pipelineId: string,
  input: unknown
) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = deplacerSchema.parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "checklistModele", (courant) => {
    const pieces = parseChecklistModele(courant);
    const i = pieces.findIndex((p) => p.cle === data.cle);
    if (i < 0) throw new Error("Pièce introuvable");
    const j = data.sens === "monter" ? i - 1 : i + 1;
    if (j < 0 || j >= pieces.length) return pieces.map((p) => ({ ...p }));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    return pieces.map((p) => ({ ...p }));
  });
  revaliderProcedures(pipeline.id);
}

export async function supprimerPieceModele(
  pipelineId: string,
  input: unknown
) {
  const me = await requireAdminOrConducteur();
  const pipeline = await chargerPipeline(me, pipelineId);
  const data = z.object({ cle: z.string().min(1) }).parse(input);

  await ecrireJsonAvecRejeu(pipeline.id, "checklistModele", (courant) => {
    const pieces = parseChecklistModele(courant);
    if (!pieces.some((p) => p.cle === data.cle)) {
      throw new Error("Pièce introuvable");
    }
    return pieces.filter((p) => p.cle !== data.cle).map((p) => ({ ...p }));
  });
  revaliderProcedures(pipeline.id);
}
