"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseQuickAdd, fuzzyMatch } from "@/lib/quick-add-parser";

const tacheSchema = z.object({
  chantierId: z.string().min(1),
  nom: z.string().min(1),
  description: z.string().optional().or(z.literal("")),
  equipeId: z.string().optional().or(z.literal("")),
  dateDebut: z.string().min(1),
  dateFin: z.string().min(1),
  avancement: z.coerce.number().int().min(0).max(100).default(0),
  statut: z.enum(["A_FAIRE", "EN_COURS", "TERMINEE", "BLOQUEE"]),
  priorite: z.coerce.number().int().min(1).max(4).default(4),
  parentId: z.string().optional().or(z.literal("")),
  sectionId: z.string().optional().or(z.literal("")),
});

function parseTache(formData: FormData) {
  const data = tacheSchema.parse({
    chantierId: formData.get("chantierId"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    equipeId: formData.get("equipeId"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    avancement: formData.get("avancement") || 0,
    statut: formData.get("statut") || "A_FAIRE",
    priorite: formData.get("priorite") || 4,
    parentId: formData.get("parentId") || "",
    sectionId: formData.get("sectionId") || "",
  });

  return {
    chantierId: data.chantierId,
    nom: data.nom,
    description: data.description || null,
    equipeId: data.equipeId || null,
    dateDebut: new Date(data.dateDebut),
    dateFin: new Date(data.dateFin),
    avancement: data.avancement,
    statut: data.statut,
    priorite: data.priorite,
    parentId: data.parentId || null,
    sectionId: data.sectionId || null,
  };
}

function extractDependances(formData: FormData): string[] {
  const ids = formData.getAll("dependances");
  return ids.map(String).filter(Boolean);
}

function extractLabelIds(formData: FormData): string[] {
  return formData
    .getAll("labelIds")
    .map(String)
    .filter(Boolean);
}

export async function createTache(formData: FormData) {
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  const labelIds = extractLabelIds(formData);
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }
  await db.tache.create({
    data: {
      ...data,
      ...(dependances.length > 0 && {
        dependances: { connect: dependances.map((id) => ({ id })) },
      }),
      ...(labelIds.length > 0 && {
        labels: {
          create: labelIds.map((labelId) => ({ labelId })),
        },
      }),
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${data.chantierId}`);
}

export async function updateTache(id: string, formData: FormData) {
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  const labelIds = extractLabelIds(formData);
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }
  const filteredDeps = dependances.filter((depId) => depId !== id);
  // Empêche de mettre la tâche comme parent d'elle-même
  const safeParentId = data.parentId === id ? null : data.parentId;

  const existing = await db.tache.findUnique({ where: { id } });
  await db.tache.update({
    where: { id },
    data: {
      ...data,
      parentId: safeParentId,
      dependances: {
        set: filteredDeps.map((depId) => ({ id: depId })),
      },
      labels: {
        deleteMany: {},
        create: labelIds.map((labelId) => ({ labelId })),
      },
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${data.chantierId}`);
  if (existing && existing.chantierId !== data.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

export async function deleteTache(id: string) {
  const existing = await db.tache.findUnique({ where: { id } });
  await db.tache.delete({ where: { id } });
  revalidatePath("/planning");
  if (existing) revalidatePath(`/chantiers/${existing.chantierId}`);
}

export async function setAvancement(id: string, avancement: number) {
  const t = await db.tache.update({
    where: { id },
    data: {
      avancement,
      statut:
        avancement === 100
          ? "TERMINEE"
          : avancement > 0
          ? "EN_COURS"
          : "A_FAIRE",
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/** Toggle complete : passe à 100% (terminée) si pas, sinon 0%. */
export async function toggleComplete(id: string) {
  const t = await db.tache.findUnique({ where: { id } });
  if (!t) return;
  const isDone = t.statut === "TERMINEE" || t.avancement === 100;
  await db.tache.update({
    where: { id },
    data: {
      avancement: isDone ? 0 : 100,
      statut: isDone ? "A_FAIRE" : "TERMINEE",
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/** Met à jour la priorité (1..4) sans toucher au reste. */
export async function setPriorite(id: string, priorite: 1 | 2 | 3 | 4) {
  const t = await db.tache.update({
    where: { id },
    data: { priorite },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/**
 * Drag-to-reschedule pour les événements du Gantt :
 *   - "COMMANDE" : déplace `dateLivraisonPrevue` de la Commande
 *   - "LOCATION" : déplace `dateFinPrevue` de la LocationPret
 *
 * `id` peut être l'ID brut (cuid) OU l'ID préfixé "cmd-XXX" / "loc-XXX"
 * (forme utilisée comme key React dans le Gantt) — on strip le prefixe
 * pour être robuste aux deux appels.
 */
export async function deplacerEvenement(
  type: "COMMANDE" | "LOCATION",
  id: string,
  newDate: Date | string
) {
  if (!id) throw new Error("ID manquant");
  // Robustesse : accepte aussi bien "cmd-XYZ" / "loc-XYZ" que "XYZ"
  const cleanId = id.replace(/^(cmd-|loc-)/, "");
  if (!cleanId) throw new Error("ID invalide");

  const date = new Date(newDate);
  date.setHours(0, 0, 0, 0);
  if (type === "COMMANDE") {
    const c = await db.commande.update({
      where: { id: cleanId },
      data: { dateLivraisonPrevue: date },
    });
    revalidatePath("/planning");
    revalidatePath(`/chantiers/${c.chantierId}`);
  } else {
    const l = await db.locationPret.update({
      where: { id: cleanId },
      data: { dateFinPrevue: date },
    });
    revalidatePath("/planning");
    if (l.chantierId) revalidatePath(`/chantiers/${l.chantierId}`);
  }
}

/**
 * Drag-to-reschedule (Monday Gantt). On donne juste les nouvelles dates
 * de début et de fin. Vérifie que dateFin >= dateDebut. Pas de touche
 * statut/avancement.
 */
export async function deplacerTache(
  id: string,
  dateDebut: Date | string,
  dateFin: Date | string
) {
  const dStart = new Date(dateDebut);
  const dEnd = new Date(dateFin);
  dStart.setHours(0, 0, 0, 0);
  dEnd.setHours(0, 0, 0, 0);
  if (dEnd < dStart) {
    throw new Error("Date de fin avant date de début");
  }
  const t = await db.tache.update({
    where: { id },
    data: { dateDebut: dStart, dateFin: dEnd },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/**
 * Création rapide à la Todoist : parse une phrase libre.
 * Si pas de chantier reconnu, utilise `defaultChantierId`.
 * Retourne la tâche créée.
 */
export async function quickAddTache(input: string, defaultChantierId?: string) {
  const tokens = parseQuickAdd(input);
  if (!tokens.nom) {
    throw new Error("Tâche vide");
  }

  // Résolution chantier
  const chantiers = await db.chantier.findMany({
    where: { archivedAt: null },
    select: { id: true, nom: true },
  });
  let chantierId: string | null = null;
  if (tokens.chantierMatch) {
    const m = fuzzyMatch(chantiers, tokens.chantierMatch);
    if (m) chantierId = m.id;
  }
  if (!chantierId && defaultChantierId) {
    chantierId = defaultChantierId;
  }
  if (!chantierId) {
    throw new Error(
      "Aucun chantier trouvé. Précisez avec #nom-du-chantier ou choisissez-en un par défaut."
    );
  }

  // Résolution équipe (au sein du chantier seulement)
  let equipeId: string | null = null;
  if (tokens.equipeMatch) {
    const equipes = await db.equipe.findMany({
      where: { chantierId },
      select: { id: true, nom: true },
    });
    const m = fuzzyMatch(equipes, tokens.equipeMatch);
    if (m) equipeId = m.id;
  }

  // Résolution section (créée à la volée si inconnue, dans le chantier)
  let sectionId: string | null = null;
  if (tokens.sectionMatch) {
    const cleaned = tokens.sectionMatch.replace(/[-_]/g, " ").trim();
    if (cleaned) {
      const sections = await db.section.findMany({
        where: { chantierId },
        select: { id: true, nom: true },
      });
      const m = fuzzyMatch(sections, cleaned);
      if (m) {
        sectionId = m.id;
      } else {
        const last = await db.section.aggregate({
          where: { chantierId },
          _max: { ordre: true },
        });
        const created = await db.section.create({
          data: {
            chantierId,
            nom: cleaned,
            ordre: (last._max.ordre ?? -1) + 1,
          },
        });
        sectionId = created.id;
      }
    }
  }

  // Résolution labels (créés à la volée s'ils n'existent pas)
  const labelIds: string[] = [];
  for (const labelName of tokens.labels) {
    const cleaned = labelName.replace(/[-_]/g, " ").trim();
    if (!cleaned) continue;
    let lab = await db.label.findFirst({
      where: {
        nom: { equals: cleaned, mode: "insensitive" },
        OR: [{ chantierId: null }, { chantierId }],
      },
    });
    if (!lab) {
      lab = await db.label.create({
        data: { nom: cleaned, chantierId },
      });
    }
    labelIds.push(lab.id);
  }

  // Dates par défaut : aujourd'hui + 1 jour de durée si non précisé
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateDebut = tokens.dateDebut ?? today;
  const dateFin = tokens.dateFin ?? dateDebut;

  const created = await db.tache.create({
    data: {
      chantierId,
      nom: tokens.nom,
      equipeId,
      sectionId,
      priorite: tokens.priorite,
      dateDebut,
      dateFin,
      ...(labelIds.length > 0 && {
        labels: {
          create: labelIds.map((labelId) => ({ labelId })),
        },
      }),
    },
  });

  revalidatePath("/planning");
  revalidatePath(`/chantiers/${chantierId}`);
  return created;
}

/**
 * Création rapide à une date donnée et pour un chantier donné (clic
 * sur case vide du Gantt). Retourne l'ID pour ouvrir directement la
 * modale d'édition.
 */
export async function quickCreateAt({
  chantierId,
  date,
  nom = "Nouvelle tâche",
}: {
  chantierId: string;
  date: Date | string;
  nom?: string;
}): Promise<{ id: string }> {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const fin = new Date(d);
  fin.setDate(fin.getDate() + 2); // 3 jours par défaut

  const t = await db.tache.create({
    data: {
      chantierId,
      nom,
      dateDebut: d,
      dateFin: fin,
      priorite: 4,
      statut: "A_FAIRE",
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${chantierId}`);
  return { id: t.id };
}

/** Création rapide d'une sous-tâche d'une tâche parente (UI Todoist). */
export async function ajouterSousTache(
  parentId: string,
  nom: string,
  priorite: 1 | 2 | 3 | 4 = 4
) {
  if (!nom.trim()) throw new Error("Nom requis");
  const parent = await db.tache.findUnique({
    where: { id: parentId },
    select: {
      chantierId: true,
      equipeId: true,
      dateDebut: true,
      dateFin: true,
    },
  });
  if (!parent) throw new Error("Tâche parente introuvable");

  await db.tache.create({
    data: {
      chantierId: parent.chantierId,
      equipeId: parent.equipeId,
      nom: nom.trim(),
      priorite,
      parentId,
      dateDebut: parent.dateDebut,
      dateFin: parent.dateFin,
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${parent.chantierId}`);
}

/* -------------------- Sections (Todoist-like) -------------------- */

export async function createSection(input: {
  chantierId: string;
  nom: string;
  couleur?: string | null;
}) {
  if (!input.nom.trim()) throw new Error("Nom requis");
  // Place la nouvelle section à la fin
  const last = await db.section.aggregate({
    where: { chantierId: input.chantierId },
    _max: { ordre: true },
  });
  await db.section.create({
    data: {
      chantierId: input.chantierId,
      nom: input.nom.trim(),
      couleur: input.couleur || null,
      ordre: (last._max.ordre ?? -1) + 1,
    },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${input.chantierId}`);
}

export async function renameSection(sectionId: string, nom: string) {
  if (!nom.trim()) throw new Error("Nom requis");
  const s = await db.section.update({
    where: { id: sectionId },
    data: { nom: nom.trim() },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${s.chantierId}`);
}

export async function deleteSection(sectionId: string) {
  // Les tâches sont mises à sectionId=null via onDelete: SetNull
  const s = await db.section.findUnique({ where: { id: sectionId } });
  if (!s) return;
  await db.section.delete({ where: { id: sectionId } });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${s.chantierId}`);
}

/** Déplace une tâche vers une section (ou la sort de toute section). */
export async function deplacerVersSection(
  tacheId: string,
  sectionId: string | null
) {
  const t = await db.tache.update({
    where: { id: tacheId },
    data: { sectionId },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/** Réordonne les sections d'un chantier (drag-and-drop futur). */
export async function reordonnerSections(
  chantierId: string,
  orderedIds: string[]
) {
  await db.$transaction(
    orderedIds.map((id, ordre) =>
      db.section.update({
        where: { id },
        data: { ordre },
      })
    )
  );
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${chantierId}`);
}

/* -------------------- Statut (drag Kanban) -------------------- */

const STATUTS = ["A_FAIRE", "EN_COURS", "TERMINEE", "BLOQUEE"] as const;
type StatutTache = (typeof STATUTS)[number];

/**
 * Change le statut d'une tâche (drop entre colonnes Kanban).
 * Si on passe en TERMINEE on monte à 100%, si on quitte TERMINEE on
 * remet à 0% (sauf si avancement déjà entre 1 et 99 et statut EN_COURS).
 */
export async function setStatut(id: string, statut: StatutTache) {
  if (!STATUTS.includes(statut)) throw new Error("Statut invalide");
  const existing = await db.tache.findUnique({ where: { id } });
  if (!existing) return;

  let avancement = existing.avancement;
  if (statut === "TERMINEE") avancement = 100;
  else if (existing.statut === "TERMINEE") avancement = 0;
  else if (statut === "A_FAIRE") avancement = 0;

  const t = await db.tache.update({
    where: { id },
    data: { statut, avancement },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/* -------------------- Labels (CRUD) -------------------- */

export async function createLabel(input: {
  nom: string;
  couleur?: string;
  chantierId?: string | null;
}) {
  if (!input.nom.trim()) throw new Error("Nom requis");
  await db.label.create({
    data: {
      nom: input.nom.trim(),
      couleur: input.couleur || "#3b82f6",
      chantierId: input.chantierId || null,
    },
  });
  revalidatePath("/planning");
}

export async function deleteLabel(labelId: string) {
  await db.label.delete({ where: { id: labelId } });
  revalidatePath("/planning");
}
