"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  saveUploadedPhoto,
  saveUploadedVideo,
  deleteUploadedPhoto,
} from "@/lib/upload";
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
}> {
  const photos: string[] = [];
  const videos: string[] = [];
  const files = formData.getAll("medias") as File[];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    try {
      if (f.type.startsWith("video/")) {
        videos.push(await saveUploadedVideo(f, "journal"));
      } else if (f.type.startsWith("image/")) {
        photos.push(await saveUploadedPhoto(f, "journal"));
      }
    } catch (e) {
      console.error("Upload media failed:", e);
    }
  }
  return { photos, videos };
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

  const { photos, videos } = await uploadMedia(formData);

  if (!data.texte && photos.length === 0 && videos.length === 0) {
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
    },
    include: { chantier: { select: { nom: true, chefId: true } } },
  });

  // Notifier l'autre côté de la conversation
  if (me.isChef) {
    // Si un chef poste, on notifie les admins
    await notifyAdmins(
      "RAPPORT_CREE",
      `Journal — ${created.chantier.nom}`,
      `${me.name} : ${(data.texte ?? "").slice(0, 80) || "[média]"}`,
      `/chantiers/${data.chantierId}/journal?date=${data.date}`
    );
  } else if (me.isAdmin && created.chantier.chefId && created.chantier.chefId !== me.id) {
    // Si l'admin poste, on notifie le chef du chantier
    await notify(
      created.chantier.chefId,
      "RAPPORT_CREE",
      `Journal — ${created.chantier.nom}`,
      `${me.name} : ${(data.texte ?? "").slice(0, 80) || "[média]"}`,
      `/chantiers/${data.chantierId}/journal?date=${data.date}`
    );
  }

  revalidatePath(`/chantiers/${data.chantierId}/journal`);
  revalidatePath(`/chantiers/${data.chantierId}`);
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
  type: "SYSTEM_INCIDENT" | "SYSTEM_DEMANDE" | "SYSTEM_COMMANDE" | "SYSTEM_RAPPORT";
  texte: string;
  authorId?: string;
  incidentId?: string;
  demandeId?: string;
  commandeId?: string;
  rapportId?: string;
  photos?: string[];
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
        incidentId: opts.incidentId,
        demandeId: opts.demandeId,
        commandeId: opts.commandeId,
        rapportId: opts.rapportId,
      },
    });
  } catch (e) {
    console.error("insertSystemMessage failed:", e);
  }
}
