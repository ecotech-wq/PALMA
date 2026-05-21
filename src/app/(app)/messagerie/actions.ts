"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  saveUploadedPhoto,
  saveUploadedVideo,
  deleteUploadedPhoto,
} from "@/lib/upload";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { notifyAdmins, notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";

/* -------------------------------------------------------------------------
 *  Composer chat-first : un seul point d'entrée pour TOUTES les actions
 *  postées depuis la messagerie d'un chantier.
 *
 *  Catégories supportées :
 *    NOTE     simple message (texte/photos/vidéos)
 *    INCIDENT crée un Incident + JournalMessage SYSTEM_INCIDENT
 *    DEMANDE  crée une DemandeMateriel + JournalMessage SYSTEM_DEMANDE
 *    RAPPORT  crée un RapportChantier (journalier) + SYSTEM_RAPPORT
 *    SORTIE   crée une SortieMateriel + SYSTEM_SORTIE
 *    RETOUR   met à jour une SortieMateriel + SYSTEM_RETOUR
 *
 *  Chaque catégorie peut requérir des champs supplémentaires (gravité,
 *  matériel, équipe, etc.) passés dans le même FormData.
 * ----------------------------------------------------------------------- */

const CATEGORIES = [
  "NOTE",
  "INCIDENT",
  "DEMANDE",
  "RAPPORT",
  "SORTIE",
  "RETOUR",
] as const;
type Categorie = (typeof CATEGORIES)[number];

const baseSchema = z.object({
  chantierId: z.string().min(1, "Chantier requis"),
  category: z.enum(CATEGORIES),
  texte: z.string().optional().or(z.literal("")),
  // Cachée du client (admin/conducteur uniquement)
  hiddenFromClient: z.coerce.boolean().optional(),
  // Champs conditionnels
  titre: z.string().optional().or(z.literal("")),
  gravite: z.enum(["INFO", "ATTENTION", "URGENT"]).optional(),
  categorieIncident: z
    .enum([
      "MATERIEL_MANQUANT",
      "PANNE",
      "METEO",
      "RETARD_FOURNISSEUR",
      "SECURITE",
      "ACCIDENT",
      "CONFLIT",
      "AUTRE",
    ])
    .optional(),
  quantite: z.coerce.number().nonnegative().optional(),
  unite: z.string().optional().or(z.literal("")),
  meteo: z
    .enum(["SOLEIL", "NUAGEUX", "PLUIE", "ORAGE", "NEIGE", "GEL", "VENT_FORT"])
    .optional(),
  nbOuvriers: z.coerce.number().int().nonnegative().optional(),
  materielId: z.string().optional().or(z.literal("")),
  equipeId: z.string().optional().or(z.literal("")),
  sortieId: z.string().optional().or(z.literal("")),
  etatRetour: z.enum(["BON", "USE", "CASSE", "MANQUANT"]).optional(),
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Action unique pour poster un message dans le fil. Le type d'action
 * (NOTE / INCIDENT / DEMANDE / RAPPORT / SORTIE / RETOUR) est passé via
 * le champ `category`. L'action crée l'entité métier correspondante et
 * lie le JournalMessage à cette entité.
 */
export async function postChantierMessage(formData: FormData) {
  const me = await requireAuth();
  if (me.isClient) throw new Error("Lecture seule");

  const data = baseSchema.parse({
    chantierId: formData.get("chantierId"),
    category: formData.get("category") || "NOTE",
    texte: formData.get("texte") || "",
    hiddenFromClient: formData.get("hiddenFromClient") === "1",
    titre: formData.get("titre") || "",
    gravite: formData.get("gravite") || undefined,
    categorieIncident: formData.get("categorieIncident") || undefined,
    quantite: formData.get("quantite") || undefined,
    unite: formData.get("unite") || "",
    meteo: formData.get("meteo") || undefined,
    nbOuvriers: formData.get("nbOuvriers") || undefined,
    materielId: formData.get("materielId") || "",
    equipeId: formData.get("equipeId") || "",
    sortieId: formData.get("sortieId") || "",
    etatRetour: formData.get("etatRetour") || undefined,
  });

  await requireChantierAccess(me, data.chantierId);

  // Seul un admin ou conducteur peut cacher au client
  const hiddenFromClient =
    !!data.hiddenFromClient && (me.isAdmin || me.isConducteur);

  const { photos, videos } = await uploadMedia(formData);

  if (
    data.category === "NOTE" &&
    !data.texte &&
    photos.length === 0 &&
    videos.length === 0
  ) {
    throw new Error("Le message doit contenir du texte ou un média");
  }

  const today = startOfToday();
  const chantier = await db.chantier.findUnique({
    where: { id: data.chantierId },
    select: { nom: true, chefId: true },
  });
  if (!chantier) throw new Error("Chantier introuvable");

  // ---------- NOTE simple ----------
  if (data.category === "NOTE") {
    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "NOTE",
        texte: data.texte || null,
        photos,
        videos,
        hiddenFromClient,
      },
    });
    await notifyChat(me, chantier, data.chantierId, data.texte || "[média]");
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/chantiers/${data.chantierId}`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  // ---------- INCIDENT ----------
  if (data.category === "INCIDENT") {
    const titre =
      data.titre?.trim() ||
      (data.texte?.split("\n")[0]?.slice(0, 80) ?? "Incident");
    const incident = await db.incident.create({
      data: {
        chantierId: data.chantierId,
        reporterId: me.id,
        titre,
        description: data.texte || titre,
        gravite: data.gravite || "ATTENTION",
        categorie: data.categorieIncident || "AUTRE",
        photos,
      },
    });
    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "SYSTEM_INCIDENT",
        texte: data.texte || null,
        photos,
        videos,
        incidentId: incident.id,
        hiddenFromClient,
      },
    });
    await notifyAdmins(
      "INCIDENT_OUVERT",
      `⚠️ Incident — ${chantier.nom}`,
      `${me.name} : ${titre}`,
      `/incidents/${incident.id}`
    );
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/incidents`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  // ---------- DEMANDE MATERIEL ----------
  if (data.category === "DEMANDE") {
    if (!data.texte && !data.titre) {
      throw new Error("Décrivez ce dont vous avez besoin");
    }
    const description = data.texte?.trim() || data.titre || "";
    const demande = await db.demandeMateriel.create({
      data: {
        chantierId: data.chantierId,
        requesterId: me.id,
        description,
        quantite: data.quantite ?? 1,
        unite: data.unite || null,
        urgence: data.gravite || "ATTENTION",
        // photos sont stockées sur le JournalMessage lié (la table
        // DemandeMateriel n'a pas de colonne photos en propre)
      },
    });
    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "SYSTEM_DEMANDE",
        texte: data.texte || description,
        photos,
        videos,
        demandeId: demande.id,
        hiddenFromClient,
      },
    });
    await notifyAdmins(
      "DEMANDE_CREEE",
      `📦 Demande matériel — ${chantier.nom}`,
      `${me.name} : ${description.slice(0, 80)}`,
      `/demandes/${demande.id}`
    );
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/demandes`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  // ---------- RAPPORT QUOTIDIEN ----------
  if (data.category === "RAPPORT") {
    if (!data.texte || data.texte.trim().length < 5) {
      throw new Error("Le rapport doit comporter un texte");
    }
    const rapport = await db.rapportChantier.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        texte: data.texte,
        meteo: data.meteo,
        nbOuvriers: data.nbOuvriers ?? null,
        photos,
      },
    });
    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "SYSTEM_RAPPORT",
        texte: data.texte,
        photos,
        videos,
        rapportId: rapport.id,
        hiddenFromClient,
      },
    });
    await notifyAdmins(
      "RAPPORT_CREE",
      `📝 Rapport quotidien — ${chantier.nom}`,
      `${me.name} : ${data.texte.slice(0, 80)}`,
      `/rapports`
    );
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/rapports`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  // ---------- SORTIE MATERIEL ----------
  if (data.category === "SORTIE") {
    if (!data.materielId) {
      throw new Error("Sélectionnez un matériel à sortir");
    }
    const sortie = await db.sortieMateriel.create({
      data: {
        materielId: data.materielId,
        chantierId: data.chantierId,
        equipeId: data.equipeId || null,
        note: data.texte || null,
      },
    });
    // Marque le matériel comme SORTI
    await db.materiel.update({
      where: { id: data.materielId },
      data: { statut: "SORTI" },
    });
    const materiel = await db.materiel.findUnique({
      where: { id: data.materielId },
      select: { nomCommun: true },
    });
    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "SYSTEM_SORTIE",
        texte:
          data.texte ||
          `📤 Sortie : ${materiel?.nomCommun ?? "matériel"}`,
        photos,
        videos,
        sortieId: sortie.id,
        hiddenFromClient,
      },
    });
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/sorties`);
    revalidatePath(`/materiel`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  // ---------- RETOUR MATERIEL ----------
  if (data.category === "RETOUR") {
    if (!data.sortieId) {
      throw new Error("Sélectionnez la sortie à clôturer");
    }
    const sortie = await db.sortieMateriel.findUnique({
      where: { id: data.sortieId },
      include: { materiel: { select: { id: true, nomCommun: true } } },
    });
    if (!sortie) throw new Error("Sortie introuvable");
    if (sortie.dateRetour) throw new Error("Cette sortie est déjà clôturée");

    await db.sortieMateriel.update({
      where: { id: data.sortieId },
      data: {
        dateRetour: new Date(),
        etatRetour: data.etatRetour || "BON",
      },
    });

    const nextStatut =
      data.etatRetour === "CASSE" || data.etatRetour === "MANQUANT"
        ? "HS"
        : "DISPO";
    await db.materiel.update({
      where: { id: sortie.materiel.id },
      data: { statut: nextStatut },
    });

    const msg = await db.journalMessage.create({
      data: {
        chantierId: data.chantierId,
        authorId: me.id,
        date: today,
        type: "SYSTEM_RETOUR",
        texte:
          data.texte ||
          `📥 Retour : ${sortie.materiel.nomCommun} (${data.etatRetour || "BON"})`,
        photos,
        videos,
        sortieId: sortie.id,
        hiddenFromClient,
      },
    });
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/sorties`);
    revalidatePath(`/materiel`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return msg;
  }

  throw new Error("Catégorie inconnue");
}

/** Notification générique pour les NOTE (les autres catégories
 *  notifient eux-mêmes via notifyAdmins). */
async function notifyChat(
  me: { id: string; name: string; isChef: boolean; isAdmin: boolean },
  chantier: { nom: string; chefId: string | null },
  chantierId: string,
  excerpt: string
) {
  const preview = excerpt.slice(0, 80) || "[média]";
  if (me.isChef) {
    await notifyAdmins(
      "AUTRE",
      `💬 ${chantier.nom}`,
      `${me.name} : ${preview}`,
      `/messagerie/${chantierId}`
    );
  } else if (me.isAdmin && chantier.chefId && chantier.chefId !== me.id) {
    await notify(
      chantier.chefId,
      "AUTRE",
      `💬 ${chantier.nom}`,
      `${me.name} : ${preview}`,
      `/messagerie/${chantierId}`
    );
  }
}

const EMOJI_WHITELIST = ["👍", "❤️", "🎉", "👏", "🔥", "😂", "😮", "😢", "🙏"];

/**
 * Toggle réaction emoji sur un message. Si l'utilisateur a déjà posé
 * cet emoji, on l'enlève ; sinon on l'ajoute. Renvoie le nouvel état
 * (`true` = ajoutée, `false` = retirée).
 */
export async function toggleMessageReaction(
  messageId: string,
  emoji: string
): Promise<boolean> {
  const me = await requireAuth();
  if (!EMOJI_WHITELIST.includes(emoji)) {
    throw new Error("Emoji non autorisé");
  }
  // Vérifie l'accès via le chantier du message
  const msg = await db.journalMessage.findUnique({
    where: { id: messageId },
    select: { chantierId: true },
  });
  if (!msg) throw new Error("Message introuvable");
  await requireChantierAccess(me, msg.chantierId);

  const existing = await db.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId: me.id, emoji },
    },
  });
  if (existing) {
    await db.messageReaction.delete({
      where: {
        messageId_userId_emoji: { messageId, userId: me.id, emoji },
      },
    });
    revalidatePath(`/messagerie/${msg.chantierId}`);
    return false;
  }
  await db.messageReaction.create({
    data: { messageId, userId: me.id, emoji },
  });
  revalidatePath(`/messagerie/${msg.chantierId}`);
  return true;
}

/**
 * Bascule l'épinglage d'un chantier dans le hub messagerie pour
 * l'utilisateur courant. Renvoie le nouvel état (épinglé ou non).
 */
export async function toggleChantierPin(chantierId: string): Promise<boolean> {
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);
  const existing = await db.userChantierPin.findUnique({
    where: { userId_chantierId: { userId: me.id, chantierId } },
  });
  if (existing) {
    await db.userChantierPin.delete({
      where: { userId_chantierId: { userId: me.id, chantierId } },
    });
    revalidatePath("/messagerie");
    return false;
  }
  await db.userChantierPin.create({
    data: { userId: me.id, chantierId },
  });
  revalidatePath("/messagerie");
  return true;
}

/**
 * Approbation 1 clic d'une demande matériel depuis le fil : approuve
 * la demande, crée une Commande "brouillon" (fournisseur = demandé ou
 * "À définir", prix unitaire à 0 à compléter ensuite) et publie un
 * SYSTEM_COMMANDE dans le fil. Admin ou conducteur uniquement.
 *
 * Renvoie l'ID de la commande créée.
 */
export async function quickApproveDemandeToCommande(demandeId: string) {
  const me = await requireAuth();
  if (!me.isAdmin && !me.isConducteur) {
    throw new Error("Réservé à l'admin ou au conducteur");
  }
  const demande = await db.demandeMateriel.findUnique({
    where: { id: demandeId },
    include: { chantier: { select: { id: true, nom: true } } },
  });
  if (!demande) throw new Error("Demande introuvable");
  if (demande.statut !== "DEMANDEE") {
    throw new Error("Cette demande est déjà traitée");
  }
  await requireChantierAccess(me, demande.chantierId);

  const today = startOfToday();
  const quantite = Number(demande.quantite ?? 1);

  // Création de la commande + ligne en transaction
  const commande = await db.$transaction(async (tx) => {
    const c = await tx.commande.create({
      data: {
        chantierId: demande.chantierId,
        fournisseur: demande.fournisseur?.trim() || "À définir",
        dateCommande: today,
        statut: "COMMANDEE",
        coutTotal: 0,
        lignes: {
          create: [
            {
              designation: demande.description,
              quantite,
              prixUnitaire: 0,
              total: 0,
            },
          ],
        },
      },
    });
    await tx.demandeMateriel.update({
      where: { id: demande.id },
      data: {
        statut: "COMMANDEE",
        commandeId: c.id,
        approverId: me.id,
        approuveLe: new Date(),
      },
    });
    return c;
  });

  // Message SYSTEM_COMMANDE dans le fil
  await db.journalMessage.create({
    data: {
      chantierId: demande.chantierId,
      authorId: me.id,
      date: today,
      type: "SYSTEM_COMMANDE",
      texte: `🛒 Commande créée depuis la demande : ${demande.description} (${quantite}${demande.unite ? " " + demande.unite : ""})${commande.fournisseur === "À définir" ? " — fournisseur à compléter" : ` — ${commande.fournisseur}`}`,
      commandeId: commande.id,
      demandeId: demande.id,
    },
  });

  await notify(
    demande.requesterId,
    "DEMANDE_APPROUVEE",
    `Demande approuvée — ${demande.chantier.nom}`,
    `${me.name} a approuvé et créé la commande : ${demande.description.slice(0, 80)}`,
    `/commandes/${commande.id}`
  );

  await audit(me, {
    action: "DEMANDE_APPROUVEE_COMMANDEE",
    entity: "DemandeMateriel",
    entityId: demande.id,
    summary: `Demande "${demande.description.slice(0, 80)}" approuvée → commande créée (${commande.fournisseur})`,
    metadata: { commandeId: commande.id, chantierId: demande.chantierId },
  });

  revalidatePath(`/messagerie/${demande.chantierId}`);
  revalidatePath(`/demandes`);
  revalidatePath(`/demandes/${demande.id}`);
  revalidatePath(`/commandes`);
  revalidatePath(`/chantiers/${demande.chantierId}`);
  return commande.id;
}

/**
 * Refus 1 clic d'une demande matériel depuis le fil. Une note de motif
 * est requise. Admin ou conducteur uniquement.
 */
export async function quickRefuseDemande(demandeId: string, motif: string) {
  const me = await requireAuth();
  if (!me.isAdmin && !me.isConducteur) {
    throw new Error("Réservé à l'admin ou au conducteur");
  }
  const note = motif.trim();
  if (!note) throw new Error("Motif de refus requis");

  const demande = await db.demandeMateriel.findUnique({
    where: { id: demandeId },
    include: { chantier: { select: { nom: true } } },
  });
  if (!demande) throw new Error("Demande introuvable");
  if (demande.statut !== "DEMANDEE") {
    throw new Error("Cette demande est déjà traitée");
  }
  await requireChantierAccess(me, demande.chantierId);

  await db.demandeMateriel.update({
    where: { id: demandeId },
    data: {
      statut: "REFUSEE",
      reponseNote: note,
      approverId: me.id,
      approuveLe: new Date(),
    },
  });

  // Note dans le fil expliquant le refus (interne par défaut)
  await db.journalMessage.create({
    data: {
      chantierId: demande.chantierId,
      authorId: me.id,
      date: startOfToday(),
      type: "NOTE",
      texte: `❌ Demande refusée : ${demande.description.slice(0, 80)} — Motif : ${note}`,
      demandeId: demande.id,
      hiddenFromClient: true,
    },
  });

  await notify(
    demande.requesterId,
    "DEMANDE_REFUSEE",
    `Demande refusée — ${demande.chantier.nom}`,
    `${me.name} a refusé : ${demande.description.slice(0, 80)} (${note.slice(0, 60)})`,
    `/demandes/${demande.id}`
  );

  await audit(me, {
    action: "DEMANDE_REFUSEE",
    entity: "DemandeMateriel",
    entityId: demande.id,
    summary: `Demande "${demande.description.slice(0, 80)}" refusée — motif : ${note.slice(0, 80)}`,
    metadata: { motif: note, chantierId: demande.chantierId },
  });

  revalidatePath(`/messagerie/${demande.chantierId}`);
  revalidatePath(`/demandes`);
  revalidatePath(`/demandes/${demande.id}`);
}

/**
 * Bascule rapide « visible / caché du client » sur un message — admin
 * ou conducteur uniquement. Utile pour curer le rapport client en un
 * clic depuis le fil.
 */
export async function toggleMessageClientVisibility(messageId: string) {
  const me = await requireAuth();
  if (!me.isAdmin && !me.isConducteur) {
    throw new Error("Réservé à l'admin ou au conducteur");
  }
  const existing = await db.journalMessage.findUnique({
    where: { id: messageId },
  });
  if (!existing) throw new Error("Message introuvable");
  const updated = await db.journalMessage.update({
    where: { id: messageId },
    data: { hiddenFromClient: !existing.hiddenFromClient },
  });
  revalidatePath(`/chantiers/${existing.chantierId}/journal`);
  revalidatePath(`/messagerie/${existing.chantierId}`);
  return updated.hiddenFromClient;
}

/**
 * Supprime un message du fil. Le supprimer ne supprime PAS l'entité
 * liée (incident, demande...) — il faut le faire séparément via la
 * page dédiée.
 *
 * Auteur dans les 5 min, admin/conducteur tout le temps.
 */
export async function deleteChantierMessage(messageId: string) {
  const me = await requireAuth();
  const existing = await db.journalMessage.findUnique({
    where: { id: messageId },
  });
  if (!existing) return;

  if (!me.isAdmin && !me.isConducteur) {
    if (existing.authorId !== me.id) {
      throw new Error("Réservé à l'auteur ou aux pilotes");
    }
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      throw new Error("Les messages ne sont plus supprimables après 5 minutes");
    }
  }

  for (const url of existing.photos) await deleteUploadedPhoto(url);
  for (const url of existing.videos) await deleteUploadedPhoto(url);

  await db.journalMessage.delete({ where: { id: messageId } });
  revalidatePath(`/chantiers/${existing.chantierId}/journal`);
  revalidatePath(`/messagerie/${existing.chantierId}`);
}
