"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  saveUploadedPhoto,
  saveUploadedVideo,
  saveUploadedAudio,
  saveUploadedDocument,
  deleteUploadedPhoto,
} from "@/lib/upload";
import {
  formatEchecsUpload,
  parseDocumentsMessage,
  type DocumentMessage,
  type EchecUpload,
} from "@/lib/pieces-jointes";
import {
  requireAuth,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { notifyAdmins, notify } from "@/lib/notifications";

const createSchema = z.object({
  chantierId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  texte: z.string().optional().or(z.literal("")),
});

async function uploadMedia(formData: FormData): Promise<{
  photos: string[];
  videos: string[];
  audios: string[];
  documents: DocumentMessage[];
  echecs: EchecUpload[];
}> {
  const photos: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const documents: DocumentMessage[] = [];
  // Les échecs (taille, extension...) ne sont plus avalés en silence :
  // ils remontent au composer qui les affiche en toast.
  const echecs: EchecUpload[] = [];
  const files = formData.getAll("medias") as File[];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    try {
      if (f.type.startsWith("video/")) {
        // Vidéo servie telle quelle, sans transcodage (limite assumée :
        // le poids est celui du fichier d'origine, max 100 Mo).
        videos.push(await saveUploadedVideo(f, "journal"));
      } else if (f.type.startsWith("audio/")) {
        audios.push(await saveUploadedAudio(f));
      } else if (f.type.startsWith("image/")) {
        photos.push(await saveUploadedPhoto(f, "journal"));
      } else {
        // Document (trombone) : extension whitelistée et 25 Mo max
        // vérifiés côté serveur par saveUploadedDocument.
        const doc = await saveUploadedDocument(f, "docs-chantiers");
        documents.push({
          url: doc.url,
          nom: doc.originalName,
          mimeType: doc.mimeType,
          taille: doc.size,
        });
      }
    } catch (e) {
      console.error("Upload media failed:", e);
      echecs.push({
        nom: f.name,
        raison: e instanceof Error ? e.message : "Erreur inconnue",
      });
    }
  }
  return { photos, videos, audios, documents, echecs };
}

/**
 * Crée un message dans le fil du chantier+jour. Texte ou photos/vidéos
 * (au moins l'un des deux requis). Disponible pour ADMIN et CHEF.
 */
export async function createJournalMessage(formData: FormData) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Lecture seule");

  const data = createSchema.parse({
    chantierId: formData.get("chantierId"),
    date: formData.get("date"),
    texte: formData.get("texte") || "",
  });

  await requireChantierAccess(me, data.chantierId);

  const { photos, videos, audios, documents, echecs } =
    await uploadMedia(formData);

  if (
    !data.texte &&
    photos.length === 0 &&
    videos.length === 0 &&
    audios.length === 0 &&
    documents.length === 0
  ) {
    // Si le message ne tenait qu'à ses pièces jointes et qu'elles ont
    // toutes été refusées, l'erreur doit dire pourquoi (pas un générique).
    if (echecs.length > 0) {
      throw new Error(formatEchecsUpload(echecs));
    }
    throw new Error("Le message doit contenir du texte ou un fichier");
  }

  const created = await db.journalMessage.create({
    data: {
      chantierId: data.chantierId,
      authorId: me.id,
      date: new Date(data.date + "T00:00:00.000Z"),
      type: "NOTE",
      texte: data.texte || null,
      photos,
      videos,
      audios,
      documents,
    },
    include: { chantier: { select: { nom: true, chefId: true } } },
  });

  // Le message vient d'être créé avec un chantierId validé : son chantier
  // existe toujours. La relation n'est nullable dans le schéma que pour les
  // messages des canaux d'affaire (CRM).
  const chantierDuMessage = created.chantier;
  if (!chantierDuMessage) throw new Error("Chantier introuvable");

  // Aperçu pour la notification quand le message n'a pas de texte
  const apercu =
    (data.texte ?? "").slice(0, 80) ||
    (audios.length > 0
      ? "[mémo vocal]"
      : documents.length > 0
        ? "[pièce jointe]"
        : "[média]");

  // Notifier l'autre côté de la conversation
  if (me.isChef) {
    // Si un chef poste, on notifie les admins
    await notifyAdmins(
      "RAPPORT_CREE",
      `Journal : ${chantierDuMessage.nom}`,
      `${me.name} : ${apercu}`,
      `/chantiers/${data.chantierId}/journal?date=${data.date}`
    );
  } else if (me.isAdmin && chantierDuMessage.chefId && chantierDuMessage.chefId !== me.id) {
    // Si l'admin poste, on notifie le chef du chantier
    await notify(
      chantierDuMessage.chefId,
      "RAPPORT_CREE",
      `Journal : ${chantierDuMessage.nom}`,
      `${me.name} : ${apercu}`,
      `/chantiers/${data.chantierId}/journal?date=${data.date}`
    );
  }

  revalidatePath(`/chantiers/${data.chantierId}/journal`);
  revalidatePath(`/chantiers/${data.chantierId}`);

  // Les pièces jointes refusées remontent au composer (toast) : le
  // message est parti, mais l'utilisateur sait ce qui manque.
  return { messageId: created.id, echecs };
}

const updateSchema = z.object({
  texte: z.string().optional().or(z.literal("")),
});

/**
 * Modifie un message — auteur dans les 5 minutes, ou admin tout le temps.
 */
export async function updateJournalMessage(id: string, formData: FormData) {
  const me = await requireAuth();
  const existing = await db.journalMessage.findUnique({ where: { id } });
  if (!existing) throw new Error("Message introuvable");

  // Ce chemin est celui du journal de chantier : un message de fil
  // d'affaire (chantierId null) ne se modifie que via la messagerie,
  // qui applique requireMessageAccess. Et frontière d'espace comme
  // partout : un admin d'un autre espace est refusé ici.
  if (!existing.chantierId) {
    throw new Error("Message d'un fil d'affaire : passer par la messagerie");
  }
  await requireChantierAccess(me, existing.chantierId);

  if (!me.isAdmin) {
    if (existing.authorId !== me.id) {
      throw new Error("Tu ne peux modifier que tes propres messages");
    }
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      throw new Error(
        "Les messages ne sont plus modifiables après 5 minutes (contacte un admin)"
      );
    }
  }

  const data = updateSchema.parse({
    texte: formData.get("texte") || "",
  });

  await db.journalMessage.update({
    where: { id },
    data: { texte: data.texte || null },
  });

  revalidatePath(`/chantiers/${existing.chantierId}/journal`);
}

/**
 * Supprime un message — auteur dans les 5 min, admin tout le temps.
 */
export async function deleteJournalMessage(id: string) {
  const me = await requireAuth();
  const existing = await db.journalMessage.findUnique({ where: { id } });
  if (!existing) return;

  // Chemin réservé au journal de chantier. Un message de fil d'affaire
  // (chantierId null) peut porter des pièces rangées dans le dossier
  // client (AffaireDocument.messageId) : le supprimer ici effacerait du
  // disque des fichiers encore référencés par le dossier. La messagerie
  // (deleteChantierMessage) préserve ces fichiers et détache messageId ;
  // ce chemin-ci est donc refusé. Et frontière d'espace comme partout.
  if (!existing.chantierId) {
    throw new Error("Message d'un fil d'affaire : passer par la messagerie");
  }
  await requireChantierAccess(me, existing.chantierId);

  if (!me.isAdmin) {
    if (existing.authorId !== me.id) {
      throw new Error("Réservé à l'auteur ou aux admins");
    }
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      throw new Error(
        "Les messages ne sont plus supprimables après 5 minutes"
      );
    }
  }

  // Nettoyer les fichiers
  for (const url of existing.photos) await deleteUploadedPhoto(url);
  for (const url of existing.videos) await deleteUploadedPhoto(url);
  for (const url of existing.audios) await deleteUploadedPhoto(url);
  for (const doc of parseDocumentsMessage(existing.documents)) {
    await deleteUploadedPhoto(doc.url);
  }

  await db.journalMessage.delete({ where: { id } });

  revalidatePath(`/chantiers/${existing.chantierId}/journal`);
}

/**
 * Bascule le flag "caché du client" sur un message — admin uniquement.
 * Permet de filtrer les messages compromettants avant envoi du rapport
 * hebdo au client.
 */
export async function toggleHiddenFromClient(id: string) {
  const me = await requireAuth();
  if (!me.isAdmin) throw new Error("Réservé aux admins");
  const existing = await db.journalMessage.findUnique({ where: { id } });
  if (!existing) throw new Error("Message introuvable");

  await db.journalMessage.update({
    where: { id },
    data: { hiddenFromClient: !existing.hiddenFromClient },
  });

  revalidatePath(`/chantiers/${existing.chantierId}/journal`);
  revalidatePath(`/chantiers/${existing.chantierId}/rapport-hebdo`);
}

// =====================================================
// Helpers à utiliser depuis les autres actions (incident, demande,
// commande) pour insérer automatiquement un message SYSTEM dans le
// journal du chantier+jour quand un événement survient.
// =====================================================

export async function insertSystemMessage(opts: {
  chantierId: string;
  date?: Date;
  type:
    | "SYSTEM_INCIDENT"
    | "SYSTEM_INCIDENT_RESOLU"
    | "SYSTEM_DEMANDE"
    | "SYSTEM_COMMANDE"
    | "SYSTEM_COMMANDE_LIVREE"
    | "SYSTEM_RAPPORT"
    | "SYSTEM_SORTIE"
    | "SYSTEM_RETOUR"
    | "SYSTEM_LOCATION"
    | "SYSTEM_LOCATION_FIN"
    | "SYSTEM_PLAN"
    | "SYSTEM_TACHE"
    | "SYSTEM_RESERVE";
  texte: string;
  authorId?: string;
  incidentId?: string;
  demandeId?: string;
  commandeId?: string;
  rapportId?: string;
  sortieId?: string;
  // v4.2 : fiches creees par tag + canal du message systeme (defaut : Général)
  tacheId?: string;
  reserveId?: string;
  canalId?: string;
  photos?: string[];
  videos?: string[];
}) {
  try {
    const date = opts.date ?? new Date();
    const dayUtc = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    await db.journalMessage.create({
      data: {
        chantierId: opts.chantierId,
        authorId: opts.authorId ?? null,
        date: dayUtc,
        type: opts.type,
        texte: opts.texte,
        photos: opts.photos ?? [],
        videos: opts.videos ?? [],
        incidentId: opts.incidentId,
        demandeId: opts.demandeId,
        commandeId: opts.commandeId,
        rapportId: opts.rapportId,
        sortieId: opts.sortieId,
        tacheId: opts.tacheId,
        reserveId: opts.reserveId,
        canalId: opts.canalId,
      },
    });
  } catch (e) {
    console.error("insertSystemMessage failed:", e);
  }
}
