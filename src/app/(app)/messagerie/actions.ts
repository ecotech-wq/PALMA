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
  requireAffaireAccess,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { notifyAdmins, notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import {
  getOrCreateGeneral,
  getOrCreateCanalAffaire,
} from "@/features/messaging";

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
  // Fil cible : un chantier OU une affaire (CRM). Exactement l'un des deux,
  // vérifié dans l'action (zod ne porte pas cet invariant croisé).
  chantierId: z.string().optional().or(z.literal("")),
  affaireId: z.string().optional().or(z.literal("")),
  category: z.enum(CATEGORIES),
  // Canal du fil où poster (v4.2) ; vide = Général
  canalId: z.string().optional().or(z.literal("")),
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

/** Aperçu de notification pour un message sans texte. */
function apercuMedia(media: {
  audios: string[];
  documents: DocumentMessage[];
}): string {
  if (media.audios.length > 0) return "[mémo vocal]";
  if (media.documents.length > 0) return "[pièce jointe]";
  return "[média]";
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
    chantierId: formData.get("chantierId") || "",
    affaireId: formData.get("affaireId") || "",
    category: formData.get("category") || "NOTE",
    canalId: formData.get("canalId") || "",
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

  // ---------- Fil d'AFFAIRE (CRM) : chantierId null, ancrage canalId ----
  // Le composer du fil d'affaire poste par la même action que les fils de
  // chantier (mêmes médias : photos, vidéos, mémos vocaux, documents),
  // mais la garde devient l'accès affaire (pilotes + frontière espace) et
  // seule la catégorie NOTE a un sens (incidents, demandes, rapports,
  // sorties sont des objets de chantier).
  if (data.affaireId) {
    if (data.chantierId) {
      throw new Error("Cible ambiguë : un message vise un chantier OU une affaire");
    }
    if (data.category !== "NOTE") {
      throw new Error("Seuls les messages simples sont possibles dans un fil d'affaire");
    }
    await requireAffaireAccess(me, data.affaireId);
    return posterDansFilAffaire(me, data.affaireId, data.canalId || "", formData, data.texte || "");
  }

  if (!data.chantierId) throw new Error("Chantier requis");
  await requireChantierAccess(me, data.chantierId);

  // Seul un admin ou conducteur peut cacher au client
  const hiddenFromClient =
    !!data.hiddenFromClient && (me.isAdmin || me.isConducteur);

  // Canal cible (v4.2) : celui fourni par le composer, sinon Général du chantier
  const canalId =
    data.canalId && data.canalId.trim() !== ""
      ? data.canalId
      : (await getOrCreateGeneral(data.chantierId)).id;

  const { photos, videos, audios, documents, echecs } =
    await uploadMedia(formData);

  if (
    data.category === "NOTE" &&
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
        audios,
        documents,
        hiddenFromClient,
        canalId,
      },
    });
    await notifyChat(
      me,
      chantier,
      data.chantierId,
      data.texte || apercuMedia({ audios, documents })
    );
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/chantiers/${data.chantierId}`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return { messageId: msg.id, echecs };
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
        audios,
        documents,
        incidentId: incident.id,
        hiddenFromClient,
        canalId,
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
    return { messageId: msg.id, echecs };
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
        audios,
        documents,
        demandeId: demande.id,
        hiddenFromClient,
        canalId,
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
    return { messageId: msg.id, echecs };
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
        audios,
        documents,
        rapportId: rapport.id,
        hiddenFromClient,
        canalId,
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
    return { messageId: msg.id, echecs };
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
        audios,
        documents,
        sortieId: sortie.id,
        hiddenFromClient,
        canalId,
      },
    });
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/sorties`);
    revalidatePath(`/materiel`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return { messageId: msg.id, echecs };
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
        audios,
        documents,
        sortieId: sortie.id,
        hiddenFromClient,
        canalId,
      },
    });
    revalidatePath(`/chantiers/${data.chantierId}/journal`);
    revalidatePath(`/sorties`);
    revalidatePath(`/materiel`);
    revalidatePath(`/messagerie/${data.chantierId}`);
    return { messageId: msg.id, echecs };
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

/**
 * Poste une NOTE dans le canal d'une affaire (CRM). Même pipeline de
 * médias que les fils de chantier ; le message est ancré par son canalId
 * seul (chantierId null). Appelée par postChantierMessage après la garde
 * requireAffaireAccess (pilotes + frontière espace).
 */
async function posterDansFilAffaire(
  me: CurrentUser,
  affaireId: string,
  canalIdVoulu: string,
  formData: FormData,
  texte: string
) {
  const affaire = await db.affaire.findUnique({
    where: { id: affaireId },
    select: { titre: true, responsableId: true },
  });
  if (!affaire) throw new Error("Affaire introuvable");

  // Canal cible : celui du composer s'il appartient bien à CETTE affaire
  // (un canalId forgé vers un autre fil est ignoré), sinon le canal
  // Général de l'affaire, recréé au besoin.
  let canalId = "";
  if (canalIdVoulu) {
    const canal = await db.canal.findFirst({
      where: { id: canalIdVoulu, affaireId },
      select: { id: true },
    });
    canalId = canal?.id ?? "";
  }
  if (!canalId) canalId = (await getOrCreateCanalAffaire(affaireId)).id;

  const { photos, videos, audios, documents, echecs } =
    await uploadMedia(formData);
  if (
    !texte &&
    photos.length === 0 &&
    videos.length === 0 &&
    audios.length === 0 &&
    documents.length === 0
  ) {
    if (echecs.length > 0) {
      throw new Error(formatEchecsUpload(echecs));
    }
    throw new Error("Le message doit contenir du texte ou un média");
  }

  // Même convention de jour que les traces du pipeline (tracerDansCanal
  // des actions d'affaires) : minuit UTC.
  const now = new Date();
  const msg = await db.journalMessage.create({
    data: {
      chantierId: null,
      canalId,
      authorId: me.id,
      date: new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
      ),
      type: "NOTE",
      texte: texte || null,
      photos,
      videos,
      audios,
      documents,
    },
  });

  // On prévient le responsable de l'affaire (celui qui pilote le dossier),
  // pas les admins en masse : le fil d'affaire est un flux de pilotage.
  const apercu = (texte || apercuMedia({ audios, documents })).slice(0, 80);
  if (affaire.responsableId && affaire.responsableId !== me.id) {
    await notify(
      affaire.responsableId,
      "AUTRE",
      `Affaire : ${affaire.titre}`,
      `${me.name} : ${apercu}`,
      `/messagerie/affaire/${affaireId}`
    );
  }

  revalidatePath(`/messagerie/affaire/${affaireId}`);
  revalidatePath(`/affaires/${affaireId}/canal`);
  revalidatePath("/messagerie");
  return { messageId: msg.id, echecs };
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
  // Les réactions vivent dans les fils de chantier ; un message de canal
  // d'affaire (chantierId null) n'en propose pas à ce stade.
  if (!msg.chantierId) {
    throw new Error("Réactions réservées aux fils de chantier");
  }
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
 * Frontière d'accès sur UN message : selon son rattachement, mêmes gardes
 * que la lecture du fil. Message de chantier : requireChantierAccess
 * (espace + adhésion). Message d'affaire (chantierId null, canal porté par
 * une affaire) : requireAffaireAccess (pilotes + espace). Sans cette garde,
 * tout ADMIN/CONDUCTEUR de n'importe quel espace pouvait supprimer ou
 * basculer n'importe quel message par id forgé, fils d'autres entreprises
 * compris.
 */
async function requireMessageAccess(
  me: CurrentUser,
  message: { chantierId: string | null; canalId: string | null }
): Promise<void> {
  if (message.chantierId) {
    await requireChantierAccess(me, message.chantierId);
    return;
  }
  if (message.canalId) {
    const canal = await db.canal.findUnique({
      where: { id: message.canalId },
      select: { chantierId: true, affaireId: true },
    });
    if (canal?.chantierId) {
      await requireChantierAccess(me, canal.chantierId);
      return;
    }
    if (canal?.affaireId) {
      await requireAffaireAccess(me, canal.affaireId);
      return;
    }
  }
  throw new Error("Message sans rattachement identifiable");
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
  await requireMessageAccess(me, existing);
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

  // Frontière AVANT le droit de suppression : le message doit appartenir
  // à un fil auquel l'appelant a réellement accès (chantier ou affaire).
  await requireMessageAccess(me, existing);

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
  for (const url of existing.audios) await deleteUploadedPhoto(url);
  for (const doc of parseDocumentsMessage(existing.documents)) {
    await deleteUploadedPhoto(doc.url);
  }

  await db.journalMessage.delete({ where: { id: messageId } });
  if (existing.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}/journal`);
    revalidatePath(`/messagerie/${existing.chantierId}`);
  } else if (existing.canalId) {
    // Message d'un fil d'affaire (chantierId null) : on rafraîchit le fil
    // de l'affaire portée par le canal.
    const canal = await db.canal.findUnique({
      where: { id: existing.canalId },
      select: { affaireId: true },
    });
    if (canal?.affaireId) {
      revalidatePath(`/messagerie/affaire/${canal.affaireId}`);
      revalidatePath(`/affaires/${canal.affaireId}/canal`);
    }
  }
}
