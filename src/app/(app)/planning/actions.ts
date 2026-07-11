"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, verifierEspaceDuChantier } from "@/lib/auth-helpers";
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
  recurrence: z.string().optional().or(z.literal("")),
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
    recurrence: formData.get("recurrence") || "",
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
    recurrence: data.recurrence ? data.recurrence : null,
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
  // Soft-delete : marqué supprimé, conservé 30 jours dans la corbeille
  await db.tache.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
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

/** Toggle complete : passe à 100% (terminée) si pas, sinon 0%.
 *  Si la tâche est récurrente, créer la prochaine occurrence à la
 *  prochaine date prévue par la règle RRule.
 */
export async function toggleComplete(id: string) {
  const t = await db.tache.findUnique({
    where: { id },
    include: { labels: true, ouvriers: true },
  });
  if (!t) return;
  const isDone = t.statut === "TERMINEE" || t.avancement === 100;
  await db.tache.update({
    where: { id },
    data: {
      avancement: isDone ? 0 : 100,
      statut: isDone ? "A_FAIRE" : "TERMINEE",
    },
  });

  // Récurrence : on ne crée la prochaine occurrence que lors du passage
  // À fait → fait (pas l'inverse), pour éviter les doublons.
  if (!isDone && t.recurrence) {
    try {
      const { RRule, rrulestr } = await import("rrule");
      // Format possible : "FREQ=WEEKLY;..." ou rrule complète avec DTSTART
      let rule;
      try {
        rule = rrulestr(
          t.recurrence.includes("FREQ")
            ? t.recurrence
            : `RRULE:${t.recurrence}`,
          { dtstart: t.dateDebut }
        );
      } catch {
        rule = null;
      }
      const next: Date | null = rule instanceof RRule
        ? rule.after(new Date(t.dateDebut), false)
        : rule && "after" in rule
          ? (rule as { after: (d: Date, inc: boolean) => Date | null }).after(
              new Date(t.dateDebut),
              false
            )
          : null;
      if (next) {
        const duration =
          new Date(t.dateFin).getTime() - new Date(t.dateDebut).getTime();
        const nextFin = new Date(next.getTime() + duration);
        const created = await db.tache.create({
          data: {
            chantierId: t.chantierId,
            equipeId: t.equipeId,
            sectionId: t.sectionId,
            parentId: t.parentId,
            nom: t.nom,
            description: t.description,
            dateDebut: next,
            dateFin: nextFin,
            avancement: 0,
            statut: "A_FAIRE",
            priorite: t.priorite,
            ordre: t.ordre,
            recurrence: t.recurrence,
            recurrenceParentId: t.recurrenceParentId ?? t.id,
          },
        });
        // Cloner les labels + ouvriers
        if (t.labels.length > 0) {
          await db.tacheLabel.createMany({
            data: t.labels.map((l) => ({
              tacheId: created.id,
              labelId: l.labelId,
            })),
            skipDuplicates: true,
          });
        }
        if (t.ouvriers.length > 0) {
          await db.tacheOuvrier.createMany({
            data: t.ouvriers.map((o) => ({
              tacheId: created.id,
              ouvrierId: o.ouvrierId,
            })),
            skipDuplicates: true,
          });
        }
      }
    } catch (e) {
      console.error("Recurrence next-occurrence failed:", e);
    }
  }

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
  const me = await requireEditionPlanning();
  if (!id) throw new Error("ID manquant");
  // Robustesse : accepte aussi bien "cmd-XYZ" / "loc-XYZ" que "XYZ"
  const cleanId = id.replace(/^(cmd-|loc-)/, "");
  if (!cleanId) throw new Error("ID invalide");

  const date = new Date(newDate);
  date.setHours(0, 0, 0, 0);
  if (type === "COMMANDE") {
    // Frontière d'espace : bornée par le chantier de la commande.
    const existante = await db.commande.findUnique({
      where: { id: cleanId },
      select: { chantierId: true },
    });
    if (!existante) throw new Error("Commande introuvable");
    await verifierEspaceDuChantier(me, existante.chantierId);
    const c = await db.commande.update({
      where: { id: cleanId },
      data: { dateLivraisonPrevue: date },
    });
    revalidatePath("/planning");
    revalidatePath(`/chantiers/${c.chantierId}`);
  } else {
    // Frontière d'espace : bornée par le chantier de la location. Une
    // location sans chantier n'est rattachable à aucun espace : refusée
    // dès que l'utilisateur est borné (deny par défaut, cohérent avec
    // le bornage de la page planning qui ne la lui montre pas).
    const existante = await db.locationPret.findUnique({
      where: { id: cleanId },
      select: { chantierId: true },
    });
    if (!existante) throw new Error("Location introuvable");
    if (existante.chantierId) {
      await verifierEspaceDuChantier(me, existante.chantierId);
    } else if (me.espaceIds) {
      throw new Error("Cette location n'appartient pas à votre espace");
    }
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
  const me = await requireEditionPlanning();
  const dStart = new Date(dateDebut);
  const dEnd = new Date(dateFin);
  dStart.setHours(0, 0, 0, 0);
  dEnd.setHours(0, 0, 0, 0);
  if (dEnd < dStart) {
    throw new Error("Date de fin avant date de début");
  }
  // Frontière d'espace : bornée par le chantier de la tâche.
  const existante = await db.tache.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!existante) throw new Error("Tâche introuvable");
  await verifierEspaceDuChantier(me, existante.chantierId);
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
 * sur case vide du Gantt, cliquer-glisser sur le calendrier). Retourne
 * l'ID pour ouvrir directement la modale d'édition.
 * `dateFin` optionnelle : absente, la tâche dure 3 jours (comportement
 * historique du Gantt) ; fournie, la tâche couvre exactement la plage.
 */
export async function quickCreateAt({
  chantierId,
  date,
  dateFin,
  nom = "Nouvelle tâche",
}: {
  chantierId: string;
  date: Date | string;
  dateFin?: Date | string;
  nom?: string;
}): Promise<{ id: string }> {
  const me = await requireEditionPlanning();
  // Frontière d'espace : le chantier cible doit appartenir à un espace
  // de l'utilisateur (un chantierId arbitraire est refusé).
  await verifierEspaceDuChantier(me, chantierId);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let fin: Date;
  if (dateFin !== undefined) {
    fin = new Date(dateFin);
    fin.setHours(0, 0, 0, 0);
  } else {
    fin = new Date(d);
    fin.setDate(fin.getDate() + 2); // 3 jours par défaut
  }
  if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) {
    throw new Error("Dates invalides");
  }
  if (fin < d) {
    throw new Error("Date de fin avant date de début");
  }

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

/**
 * Affecte un ensemble d'ouvriers à une tâche (remplace l'ensemble actuel).
 * Disponible pour admin/conducteur ; CHEF peut affecter sur ses chantiers.
 */
export async function setTacheOuvriers(
  tacheId: string,
  ouvrierIds: string[]
) {
  // Vérifie l'existence + accès chantier
  const t = await db.tache.findUnique({
    where: { id: tacheId },
    select: { chantierId: true },
  });
  if (!t) throw new Error("Tâche introuvable");
  await db.$transaction([
    db.tacheOuvrier.deleteMany({ where: { tacheId } }),
    ...(ouvrierIds.length > 0
      ? [
          db.tacheOuvrier.createMany({
            data: ouvrierIds.map((ouvrierId) => ({ tacheId, ouvrierId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/**
 * Réordonne un lot de tâches en assignant `ordre` selon la position
 * dans le tableau reçu. Permet le drag-and-drop dans la liste.
 * Toutes les tâches doivent appartenir à un même chantier (sécurité :
 * pas de réordonnancement cross-chantier en un appel).
 */
export async function reordonnerTaches(orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
  const taches = await db.tache.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true, chantierId: true },
  });
  const chantierIds = new Set(taches.map((t) => t.chantierId));
  if (chantierIds.size !== 1) {
    throw new Error(
      "Toutes les tâches doivent appartenir au même chantier"
    );
  }
  await db.$transaction(
    orderedIds.map((id, ordre) =>
      db.tache.update({ where: { id }, data: { ordre } })
    )
  );
  const chantierId = [...chantierIds][0];
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

/* -------------------- Dépendances (Gantt façon Monday) -------------------- */

/** Garde d'édition du planning : toute l'équipe sauf les comptes client
 *  (même règle que le flag canEdit calculé dans page.tsx). */
async function requireEditionPlanning() {
  const me = await requireAuth();
  if (me.isClient) {
    throw new Error("Le planning est en lecture seule pour les clients");
  }
  return me;
}

const dependanceSchema = z.object({
  tacheId: z.string().min(1),
  depId: z.string().min(1),
});

/** Profondeur maximale des parcours de graphe (anti-emballement). */
const PROFONDEUR_MAX_DEPS = 100;

/**
 * Crée une dépendance : `tacheId` dépendra de `depId` (depId devient un
 * prédécesseur). Refuse l'auto-dépendance, le cross-chantier et tout
 * cycle : on remonte les prédécesseurs de depId en largeur (une requête
 * par niveau, ensemble visité en garde anti-boucle) ; si tacheId est
 * atteint, la liaison fermerait un cycle.
 */
export async function ajouterDependance(tacheId: string, depId: string) {
  await requireEditionPlanning();
  const ids = dependanceSchema.parse({ tacheId, depId });
  if (ids.tacheId === ids.depId) {
    throw new Error("Une tâche ne peut pas dépendre d'elle-même");
  }

  const [tache, dep] = await Promise.all([
    db.tache.findUnique({
      where: { id: ids.tacheId },
      select: {
        id: true,
        nom: true,
        chantierId: true,
        deletedAt: true,
        dependances: { where: { id: ids.depId }, select: { id: true } },
      },
    }),
    db.tache.findUnique({
      where: { id: ids.depId },
      select: { id: true, nom: true, chantierId: true, deletedAt: true },
    }),
  ]);
  if (!tache || tache.deletedAt) throw new Error("Tâche introuvable");
  if (!dep || dep.deletedAt) {
    throw new Error("Tâche prédécesseur introuvable");
  }
  if (tache.chantierId !== dep.chantierId) {
    throw new Error(
      "Impossible : les deux tâches doivent appartenir au même chantier"
    );
  }
  // Idempotent : la dépendance existe déjà, rien à faire.
  if (tache.dependances.length > 0) return;

  // Détection de cycle : parcours des prédécesseurs de depId.
  let frontiere: string[] = [ids.depId];
  const visites = new Set<string>(frontiere);
  for (let prof = 0; frontiere.length > 0; prof++) {
    if (prof >= PROFONDEUR_MAX_DEPS) {
      throw new Error(
        "Chaîne de dépendances trop profonde pour vérifier l'absence de cycle (100 niveaux max)"
      );
    }
    // Prédécesseurs de la frontière : tâches dont un dépendant est dans
    // la frontière (une seule requête par niveau).
    const rows = await db.tache.findMany({
      where: { dependants: { some: { id: { in: frontiere } } } },
      select: { id: true },
    });
    const suivante: string[] = [];
    for (const r of rows) {
      if (r.id === ids.tacheId) {
        throw new Error(
          `Impossible : « ${dep.nom} » dépend déjà, directement ou non, de « ${tache.nom} » (cela créerait un cycle)`
        );
      }
      if (!visites.has(r.id)) {
        visites.add(r.id);
        suivante.push(r.id);
      }
    }
    frontiere = suivante;
  }

  await db.tache.update({
    where: { id: ids.tacheId },
    data: { dependances: { connect: { id: ids.depId } } },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${tache.chantierId}`);
}

/** Retire la dépendance « tacheId dépend de depId » (flèche du Gantt). */
export async function retirerDependance(tacheId: string, depId: string) {
  await requireEditionPlanning();
  const ids = dependanceSchema.parse({ tacheId, depId });
  const tache = await db.tache.findUnique({
    where: { id: ids.tacheId },
    select: { chantierId: true },
  });
  if (!tache) throw new Error("Tâche introuvable");
  await db.tache.update({
    where: { id: ids.tacheId },
    data: { dependances: { disconnect: { id: ids.depId } } },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${tache.chantierId}`);
}

/**
 * Déplace une tâche et, si `decalerSuccesseurs` est vrai (mode flexible
 * de Monday), décale du même nombre de jours TOUTES les tâches qui en
 * dépendent, directement ou transitivement. Parcours en largeur des
 * successeurs (une requête par niveau), ensemble visité en garde
 * anti-cycle, profondeur bornée à 100, et écriture en UNE transaction.
 */
export async function decalerTacheAvecSuccesseurs(
  id: string,
  nouvelleDateDebut: Date | string,
  nouvelleDateFin: Date | string,
  decalerSuccesseurs: boolean
) {
  await requireEditionPlanning();
  z.object({ id: z.string().min(1), decalerSuccesseurs: z.boolean() }).parse({
    id,
    decalerSuccesseurs,
  });
  const dStart = new Date(nouvelleDateDebut);
  const dEnd = new Date(nouvelleDateFin);
  if (Number.isNaN(dStart.getTime()) || Number.isNaN(dEnd.getTime())) {
    throw new Error("Dates invalides");
  }
  dStart.setHours(0, 0, 0, 0);
  dEnd.setHours(0, 0, 0, 0);
  if (dEnd < dStart) {
    throw new Error("Date de fin avant date de début");
  }

  const tache = await db.tache.findUnique({
    where: { id },
    select: { id: true, chantierId: true, dateDebut: true, deletedAt: true },
  });
  if (!tache || tache.deletedAt) throw new Error("Tâche introuvable");

  const UN_JOUR = 24 * 60 * 60 * 1000;
  // Arrondi : absorbe l'écart fuseau local / minuit UTC des colonnes Date.
  const deltaJours = Math.round(
    (dStart.getTime() - new Date(tache.dateDebut).getTime()) / UN_JOUR
  );

  const chantiersTouches = new Set<string>([tache.chantierId]);
  const updates = [
    db.tache.update({
      where: { id },
      data: { dateDebut: dStart, dateFin: dEnd },
    }),
  ];

  if (decalerSuccesseurs && deltaJours !== 0) {
    const visites = new Set<string>([id]);
    let frontiere: string[] = [id];
    const successeurs: {
      id: string;
      dateDebut: Date;
      dateFin: Date;
      chantierId: string;
    }[] = [];
    for (let prof = 0; frontiere.length > 0; prof++) {
      if (prof >= PROFONDEUR_MAX_DEPS) {
        throw new Error(
          "Chaîne de dépendances trop profonde (100 niveaux max) : décalage annulé"
        );
      }
      const rows = await db.tache.findMany({
        where: {
          deletedAt: null,
          dependances: { some: { id: { in: frontiere } } },
        },
        select: { id: true, dateDebut: true, dateFin: true, chantierId: true },
      });
      const suivante: string[] = [];
      for (const r of rows) {
        if (visites.has(r.id)) continue;
        visites.add(r.id);
        successeurs.push(r);
        suivante.push(r.id);
      }
      frontiere = suivante;
    }
    for (const s of successeurs) {
      // Arithmétique en millisecondes sur la valeur stockée (minuit UTC
      // des colonnes @db.Date) : le jour civil est décalé d'exactement
      // deltaJours, sans effet de fuseau ni d'heure d'été.
      updates.push(
        db.tache.update({
          where: { id: s.id },
          data: {
            dateDebut: new Date(
              new Date(s.dateDebut).getTime() + deltaJours * UN_JOUR
            ),
            dateFin: new Date(
              new Date(s.dateFin).getTime() + deltaJours * UN_JOUR
            ),
          },
        })
      );
      chantiersTouches.add(s.chantierId);
    }
  }

  await db.$transaction(updates);
  revalidatePath("/planning");
  for (const chantierId of chantiersTouches) {
    revalidatePath(`/chantiers/${chantierId}`);
  }
}
