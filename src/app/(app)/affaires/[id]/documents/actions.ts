"use server";

// ─── GED d'affaire : actions du « dossier client » ───────────────────────────
// Trois gestes : déposer une pièce directement dans une catégorie, ranger
// les pièces jointes d'un message du fil (c'est le geste central : chaque
// élément joint dans la messagerie se range dans le sous-dossier virtuel
// correspondant), et supprimer une pièce. Gardes : requireAffaireAccess
// (pilotes ADMIN + CONDUCTEUR, frontière d'espace), comme tout le module
// affaires. Quand une pièce rangée valide une pièce de la checklist
// (catégorie Pièces client), la case est cochée par l'action existante
// cocherChecklist, qui pose la trace « Pièce reçue : ... » dans le fil.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requireAffaireAccess } from "@/lib/auth-helpers";
import { saveUploadedDocument, deleteUploadedPhoto } from "@/lib/upload";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";
import { isUniqueViolation } from "@/features/messaging/core/db-errors";
import { parseChecklist } from "@/lib/affaires";
import {
  CATEGORIES_DOC_AFFAIRE,
  mimeDepuisUrl,
  nomDepuisUrl,
  parseDossiersPerso,
  preparerNouveauDossier,
  type DossierPerso,
} from "@/lib/ged-affaire";
import { cocherChecklist } from "../../actions";

/** Revalide toutes les vues qui affichent le dossier client de l'affaire. */
function revaliderDossier(affaireId: string) {
  revalidatePath(`/affaires/${affaireId}/documents`);
  revalidatePath(`/affaires/${affaireId}`);
  revalidatePath(`/messagerie/affaire/${affaireId}`);
}

/** Charge l'affaire après la garde d'accès (checklist pour la validation
 *  des clés de pièces). */
async function chargerAffaireGardee(affaireId: string) {
  const me = await requireAuth();
  await requireAffaireAccess(me, affaireId);
  const affaire = await db.affaire.findUnique({
    where: { id: affaireId },
    select: { id: true, checklist: true, dossiersPerso: true },
  });
  if (!affaire) throw new Error("Affaire introuvable");
  return { me, affaire };
}

/** Une clé de checklist n'est acceptée que si la catégorie est
 *  PIECES_CLIENT et que la clé existe dans la checklist de l'affaire. */
function validerChecklistCle(
  checklist: unknown,
  categorie: string,
  cle: string | undefined | null
): string | null {
  if (!cle) return null;
  if (categorie !== "PIECES_CLIENT") {
    throw new Error(
      "Seule une pièce rangée dans « Pièces client » valide la checklist"
    );
  }
  const items = parseChecklist(checklist);
  if (!items.some((i) => i.cle === cle)) {
    throw new Error("Pièce de checklist inconnue pour cette affaire");
  }
  return cle;
}

/** Une clé de dossier personnalisé n'est acceptée que si elle existe dans
 *  le catalogue de l'affaire, et une pièce rangée dans un dossier perso ne
 *  valide pas la checklist (réservée aux « Pièces client »). */
function validerDossierPerso(
  dossiersPerso: unknown,
  cle: string | undefined | null,
  checklistCle: string | null
): string | null {
  if (!cle) return null;
  if (checklistCle) {
    throw new Error(
      "Une pièce rangée dans un dossier personnalisé ne valide pas la checklist"
    );
  }
  if (!parseDossiersPerso(dossiersPerso).some((d) => d.cle === cle)) {
    throw new Error("Dossier personnalisé inconnu pour cette affaire");
  }
  return cle;
}

/* -------------------------------------------------------------------------
 *  Dépôt direct dans une catégorie
 * ----------------------------------------------------------------------- */

const ajoutSchema = z.object({
  nom: z.string().trim().max(200).optional().or(z.literal("")),
  categorie: z.enum(CATEGORIES_DOC_AFFAIRE),
  checklistCle: z.string().trim().max(60).optional().or(z.literal("")),
  dossierPerso: z.string().trim().max(60).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Dépose un document directement dans le dossier client (sans passer par
 *  le fil). Mêmes formats et la même limite (25 Mo) que la GED chantier. */
export async function ajouterDocumentAffaire(
  affaireId: string,
  formData: FormData
) {
  const { me, affaire } = await chargerAffaireGardee(affaireId);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu");
  const parsed = ajoutSchema.parse({
    nom: formData.get("nom") || "",
    categorie: formData.get("categorie") || "AUTRE",
    checklistCle: formData.get("checklistCle") || "",
    dossierPerso: formData.get("dossierPerso") || "",
    note: formData.get("note") || "",
  });
  const checklistCle = validerChecklistCle(
    affaire.checklist,
    parsed.categorie,
    parsed.checklistCle
  );
  const dossierPerso = validerDossierPerso(
    affaire.dossiersPerso,
    parsed.dossierPerso,
    checklistCle
  );

  const saved = await saveUploadedDocument(file, "docs-affaires");
  await db.affaireDocument.create({
    data: {
      affaireId,
      categorie: parsed.categorie,
      checklistCle,
      dossierPerso,
      nom: parsed.nom || saved.originalName,
      fichier: saved.url,
      mimeType: saved.mimeType,
      taille: saved.size,
      note: parsed.note || null,
      creePar: me.name,
    },
  });

  // La pièce déposée valide une pièce du dossier : la case se coche et la
  // trace « Pièce reçue : ... » part dans le fil (action existante,
  // idempotente si la case était déjà cochée).
  if (checklistCle) {
    await cocherChecklist(affaireId, checklistCle, true);
  }
  revaliderDossier(affaireId);
}

/* -------------------------------------------------------------------------
 *  Rangement des pièces jointes d'un message du fil
 * ----------------------------------------------------------------------- */

const rangerSchema = z.object({
  affaireId: z.string().min(1),
  messageId: z.string().min(1),
  pieces: z
    .array(
      z.object({
        /** URL de la pièce TELLE QUE STOCKÉE sur le message (vérifiée). */
        url: z.string().min(1),
        /** Nom d'affichage (le composer connaît le nom d'origine des
         *  photos, perdu au stockage) ; repli sur le nom de fichier. */
        nom: z.string().trim().max(200).optional().or(z.literal("")),
        categorie: z.enum(CATEGORIES_DOC_AFFAIRE),
        checklistCle: z.string().trim().max(60).optional().or(z.literal("")),
        /** Clé d'un dossier personnalisé de l'affaire (exclusif de
         *  checklistCle) ; vide = rangement dans la catégorie. */
        dossierPerso: z.string().trim().max(60).optional().or(z.literal("")),
      })
    )
    .min(1)
    .max(30),
});

/**
 * Range des pièces jointes d'un message du fil de l'affaire dans le
 * dossier client. Frontières : accès affaire (pilotes + espace), et le
 * message doit appartenir au canal de CETTE affaire (un messageId forgé
 * vers un autre fil est refusé). Chaque URL est vérifiée contre les
 * pièces réellement portées par le message. Idempotent : une pièce déjà
 * rangée depuis ce message n'est pas dupliquée (double tap, deux onglets).
 */
export async function rangerPiecesJointes(input: unknown) {
  const data = rangerSchema.parse(input);
  const { me, affaire } = await chargerAffaireGardee(data.affaireId);

  const message = await db.journalMessage.findUnique({
    where: { id: data.messageId },
    select: {
      id: true,
      photos: true,
      documents: true,
      canal: { select: { affaireId: true } },
    },
  });
  if (!message || message.canal?.affaireId !== data.affaireId) {
    throw new Error("Ce message n'appartient pas au fil de cette affaire");
  }

  // Pièces admissibles : les photos (URLs) et les documents du message.
  const admissibles = new Map<
    string,
    { nom: string; mimeType: string; taille: number | null }
  >();
  for (const url of message.photos) {
    admissibles.set(url, {
      nom: nomDepuisUrl(url),
      mimeType: mimeDepuisUrl(url),
      taille: null,
    });
  }
  for (const doc of parseDocumentsMessage(message.documents)) {
    admissibles.set(doc.url, {
      nom: doc.nom,
      mimeType: doc.mimeType,
      taille: doc.taille,
    });
  }

  // Déjà rangées depuis ce message : ignorées sans erreur (idempotence).
  const dejaRangees = new Set(
    (
      await db.affaireDocument.findMany({
        where: { affaireId: data.affaireId, messageId: message.id },
        select: { fichier: true },
      })
    ).map((d) => d.fichier)
  );

  // Validation de TOUTES les pièces AVANT la première création : un plan
  // mi-valide ne doit pas produire un rangement partiel silencieux (pièce
  // 1 créée puis exception sur la pièce 2, avec un toast « non rangées »
  // et la coche de checklist de la pièce 1 jamais posée).
  const preparees = data.pieces.map((piece) => {
    const meta = admissibles.get(piece.url);
    if (!meta) {
      throw new Error("Pièce inconnue sur ce message");
    }
    const checklistCle = validerChecklistCle(
      affaire.checklist,
      piece.categorie,
      piece.checklistCle
    );
    const dossierPerso = validerDossierPerso(
      affaire.dossiersPerso,
      piece.dossierPerso,
      checklistCle
    );
    return { piece, meta, checklistCle, dossierPerso };
  });

  const clesACocher: string[] = [];
  let rangees = 0;
  for (const { piece, meta, checklistCle, dossierPerso } of preparees) {
    if (dejaRangees.has(piece.url)) continue;
    try {
      await db.affaireDocument.create({
        data: {
          affaireId: data.affaireId,
          categorie: piece.categorie,
          checklistCle,
          dossierPerso,
          nom: piece.nom || meta.nom,
          fichier: piece.url,
          mimeType: meta.mimeType,
          taille: meta.taille,
          messageId: message.id,
          creePar: me.name,
        },
      });
    } catch (e) {
      // Deux soumissions qui se chevauchent (deux onglets, retry pendant
      // une requête lente) passent toutes deux le findMany ci-dessus :
      // la contrainte unique (affaireId, messageId, fichier) fait foi,
      // la seconde création est traitée comme « déjà rangée ».
      if (isUniqueViolation(e)) continue;
      throw e;
    }
    dejaRangees.add(piece.url);
    rangees += 1;
    if (checklistCle) clesACocher.push(checklistCle);
  }

  // Cocher APRÈS les créations : la trace « Pièce reçue » du fil renvoie
  // vers un document déjà visible dans le dossier (cocherChecklist est
  // idempotente : une pièce déjà cochée ne produit pas de doublon).
  for (const cle of clesACocher) {
    await cocherChecklist(data.affaireId, cle, true);
  }

  revaliderDossier(data.affaireId);
  return { rangees, cochees: clesACocher.length };
}

/* -------------------------------------------------------------------------
 *  Dossiers personnalisés
 * ----------------------------------------------------------------------- */

/**
 * Crée un dossier personnalisé dans le dossier client de l'affaire.
 * Le catalogue (Affaire.dossiersPerso) est un Json entier relu puis
 * réécrit : même écriture conditionnelle optimiste que cocherChecklist
 * (le where exige l'instantané lu, sinon relecture et rejeu) pour que
 * deux créations simultanées ne s'écrasent pas. Idempotent : recréer un
 * dossier au même nom renvoie le dossier existant.
 */
export async function creerDossierPerso(
  affaireId: string,
  libelle: string
): Promise<DossierPerso> {
  const { affaire } = await chargerAffaireGardee(affaireId);

  let snapshot: Prisma.InputJsonValue =
    affaire.dossiersPerso as Prisma.InputJsonValue;
  for (let tentative = 0; ; tentative++) {
    const existants = parseDossiersPerso(snapshot);
    const res = preparerNouveauDossier(libelle, existants);
    if (!res.ok) {
      if (res.existant) return res.existant;
      throw new Error(res.erreur);
    }
    const ecrit = await db.affaire.updateMany({
      where: { id: affaireId, dossiersPerso: { equals: snapshot } },
      data: {
        dossiersPerso: [...existants, res.dossier].map((d) => ({ ...d })),
      },
    });
    if (ecrit.count === 1) {
      revaliderDossier(affaireId);
      return res.dossier;
    }
    if (tentative >= 4) {
      throw new Error("Le dossier client vient d'être modifié, réessayez");
    }
    const frais = await db.affaire.findUnique({
      where: { id: affaireId },
      select: { dossiersPerso: true },
    });
    if (!frais) throw new Error("Affaire introuvable");
    snapshot = frais.dossiersPerso as Prisma.InputJsonValue;
  }
}

/* -------------------------------------------------------------------------
 *  Déplacement (façon Trello : changer de catégorie ou de dossier)
 * ----------------------------------------------------------------------- */

const deplacerSchema = z.object({
  documentId: z.string().min(1),
  categorie: z.enum(CATEGORIES_DOC_AFFAIRE),
  dossierPerso: z.string().trim().max(60).optional().or(z.literal("")),
  checklistCle: z.string().trim().max(60).optional().or(z.literal("")),
});

/**
 * Déplace un document du dossier client vers une autre catégorie ou un
 * dossier personnalisé. La clé de checklist suit la même règle qu'au
 * rangement : uniquement avec « Pièces client », jamais dans un dossier
 * perso ; en quittant « Pièces client », elle est effacée (le document
 * ne valide plus la pièce, la case cochée reste cochée).
 */
export async function deplacerDocumentAffaire(input: unknown) {
  const data = deplacerSchema.parse(input);
  const doc = await db.affaireDocument.findUnique({
    where: { id: data.documentId },
    select: { id: true, affaireId: true, checklistCle: true },
  });
  if (!doc) throw new Error("Document introuvable");
  const { affaire } = await chargerAffaireGardee(doc.affaireId);

  const checklistCle = validerChecklistCle(
    affaire.checklist,
    data.categorie,
    data.checklistCle
  );
  const dossierPerso = validerDossierPerso(
    affaire.dossiersPerso,
    data.dossierPerso,
    checklistCle
  );

  await db.affaireDocument.update({
    where: { id: doc.id },
    data: {
      categorie: data.categorie,
      dossierPerso,
      // Hors « Pièces client » (ou dans un dossier perso), le lien de
      // validation checklist n'a plus de sens : on l'efface. Dans
      // « Pièces client », la valeur soumise fait foi (la feuille envoie
      // la clé actuelle par défaut ; la vider est un choix explicite).
      checklistCle:
        data.categorie === "PIECES_CLIENT" && !dossierPerso
          ? checklistCle
          : null,
    },
  });

  if (checklistCle) {
    await cocherChecklist(doc.affaireId, checklistCle, true);
  }
  revaliderDossier(doc.affaireId);
}

/* -------------------------------------------------------------------------
 *  Suppression
 * ----------------------------------------------------------------------- */

/**
 * Supprime une pièce du dossier client (confirmation côté interface).
 * Le fichier sur disque n'est effacé QUE pour un dépôt direct : une pièce
 * rangée depuis le fil (messageId) partage son fichier avec le message
 * d'origine, qui doit rester lisible dans la messagerie.
 */
export async function supprimerDocumentAffaire(documentId: string) {
  const doc = await db.affaireDocument.findUnique({
    where: { id: documentId },
    select: { id: true, affaireId: true, fichier: true, messageId: true },
  });
  if (!doc) return;
  const me = await requireAuth();
  await requireAffaireAccess(me, doc.affaireId);

  if (!doc.messageId) {
    await deleteUploadedPhoto(doc.fichier);
  }
  await db.affaireDocument.delete({ where: { id: documentId } });
  revaliderDossier(doc.affaireId);
}
