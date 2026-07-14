"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  verifierEspaceDuChantier,
  type CurrentUser,
} from "@/lib/auth-helpers";
import { parseQuickAdd, fuzzyMatch } from "@/lib/quick-add-parser";
import {
  parseTache,
  extractDependances,
  extractLabelIds,
} from "./parse-tache";

export async function createTache(formData: FormData) {
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  const labelIds = extractLabelIds(formData);
  // Le formulaire complet crée toujours une tâche DE CHANTIER (les
  // tâches perso passent par creerTachePerso / quickCreateAt).
  if (!data.chantierId) throw new Error("Chantier requis");
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }
  await db.tache.create({
    data: {
      ...data,
      chantierId: data.chantierId,
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
  const me = await requireEditionPlanning();
  const data = parseTache(formData);
  const dependances = extractDependances(formData);
  const labelIds = extractLabelIds(formData);
  if (data.dateFin < data.dateDebut) {
    throw new Error("La date de fin doit être après la date de début");
  }

  const existing = await db.tache.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existing);

  // Tâche PERSO : périmètre réduit. Pas de chantier, d'équipe, de
  // section ni d'ouvriers (la modale n'envoie pas ces champs ; on les
  // force à null ici pour préserver l'invariant « SOIT chantierId, SOIT
  // proprietaireId » même face à un client bricolé). Le parent et les
  // dépendances ne sont volontairement PAS touchés : les liens
  // perso-perso créés depuis le Gantt (ajouterDependance) et les
  // sous-tâches perso (ajouterSousTache) doivent survivre à une édition
  // par la modale, qui ne rend pas ces champs ; une valeur forgée par un
  // client bricolé est simplement ignorée.
  if (existing.proprietaireId) {
    await db.tache.update({
      where: { id },
      data: {
        nom: data.nom,
        description: data.description,
        dateDebut: data.dateDebut,
        dateFin: data.dateFin,
        avancement: data.avancement,
        statut: data.statut,
        priorite: data.priorite,
        recurrence: data.recurrence,
        chantierId: null,
        equipeId: null,
        sectionId: null,
        labels: {
          deleteMany: {},
          create: labelIds.map((labelId) => ({ labelId })),
        },
      },
    });
    revalidatePath("/planning");
    return;
  }

  // Tâche de chantier : le chantier reste obligatoire (pas de bascule
  // chantier -> perso par édition).
  if (!data.chantierId) throw new Error("Chantier requis");
  await verifierEspaceDuChantier(me, data.chantierId);
  const filteredDeps = [...new Set(dependances)].filter(
    (depId) => depId !== id
  );
  // Empêche de mettre la tâche comme parent d'elle-même
  const safeParentId = data.parentId === id ? null : data.parentId;

  // Mêmes gardes qu'ajouterDependance, sinon un client forgé les
  // contournait toutes en passant par la modale : dépendances et tâche
  // parente doivent être des tâches vivantes du MÊME chantier que la
  // tâche éditée (jamais une tâche perso ni un autre chantier), et le
  // nouvel ensemble de dépendances ne doit fermer aucun cycle.
  const refIds = [
    ...new Set([...filteredDeps, ...(safeParentId ? [safeParentId] : [])]),
  ];
  if (refIds.length > 0) {
    const refs = await db.tache.findMany({
      where: { id: { in: refIds } },
      select: { id: true, chantierId: true, deletedAt: true },
    });
    const refParId = new Map(refs.map((r) => [r.id, r]));
    for (const refId of refIds) {
      const ref = refParId.get(refId);
      if (!ref || ref.deletedAt || ref.chantierId !== data.chantierId) {
        throw new Error(
          "Dépendances et tâche parente doivent appartenir au même chantier que la tâche"
        );
      }
    }
  }
  if (filteredDeps.length > 0) {
    await verifierAbsenceCycle(id, filteredDeps);
  }

  await db.tache.update({
    where: { id },
    data: {
      ...data,
      chantierId: data.chantierId,
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
  if (existing.chantierId && existing.chantierId !== data.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

export async function deleteTache(id: string) {
  const me = await requireEditionPlanning();
  const existing = await db.tache.findUnique({ where: { id } });
  if (!existing) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existing);
  // Soft-delete : marqué supprimé, conservé 30 jours dans la corbeille
  await db.tache.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/planning");
  if (existing.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

export async function setAvancement(id: string, avancement: number) {
  const me = await requireEditionPlanning();
  const existing = await db.tache.findUnique({
    where: { id },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!existing) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existing);
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
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
}

/** Toggle complete : passe à 100% (terminée) si pas, sinon 0%.
 *  Si la tâche est récurrente, créer la prochaine occurrence à la
 *  prochaine date prévue par la règle RRule.
 */
export async function toggleComplete(id: string) {
  const me = await requireEditionPlanning();
  const t = await db.tache.findUnique({
    where: { id },
    include: { labels: true, ouvriers: true },
  });
  if (!t) return;
  await verifierAccesTache(me, t);
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
            // Invariant perso/chantier : la prochaine occurrence garde
            // exactement le rattachement de la tâche source.
            chantierId: t.chantierId,
            proprietaireId: t.proprietaireId,
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
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
}

/** Met à jour la priorité (1..4) sans toucher au reste. */
export async function setPriorite(id: string, priorite: 1 | 2 | 3 | 4) {
  const me = await requireEditionPlanning();
  const existing = await db.tache.findUnique({
    where: { id },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!existing) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existing);
  const t = await db.tache.update({
    where: { id },
    data: { priorite },
  });
  revalidatePath("/planning");
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
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
  // Frontière : espace du chantier pour une tâche de chantier,
  // propriétaire pour une tâche perso.
  const existante = await db.tache.findUnique({
    where: { id },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!existante) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existante);
  const t = await db.tache.update({
    where: { id },
    data: { dateDebut: dStart, dateFin: dEnd },
  });
  revalidatePath("/planning");
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
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
 * Création rapide à une date donnée (clic sur case vide du Gantt,
 * cliquer-glisser sur le calendrier). Retourne l'ID pour ouvrir
 * directement la modale d'édition.
 * `chantierId` null = tâche PERSO : sans chantier, rattachée à son
 * propriétaire (proprietaireId = utilisateur courant), visible de lui
 * seul. Invariant : SOIT chantierId, SOIT proprietaireId.
 * `dateFin` optionnelle : absente, la tâche dure 3 jours (comportement
 * historique du Gantt) ; fournie, la tâche couvre exactement la plage.
 */
export async function quickCreateAt({
  chantierId,
  date,
  dateFin,
  nom = "Nouvelle tâche",
}: {
  chantierId: string | null;
  date: Date | string;
  dateFin?: Date | string;
  nom?: string;
}): Promise<{ id: string }> {
  const me = await requireEditionPlanning();
  // Frontière d'espace : le chantier cible doit appartenir à un espace
  // de l'utilisateur (un chantierId arbitraire est refusé). Une tâche
  // perso n'a pas de chantier : rien à vérifier, elle n'appartient
  // qu'à son créateur.
  if (chantierId) await verifierEspaceDuChantier(me, chantierId);
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
      proprietaireId: chantierId ? null : me.id,
      nom,
      dateDebut: d,
      dateFin: fin,
      priorite: 4,
      statut: "A_FAIRE",
    },
  });
  revalidatePath("/planning");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
  return { id: t.id };
}

const tachePersoSchema = z.object({
  nom: z.string().min(1),
  dateDebut: z.coerce.date(),
  dateFin: z.coerce.date(),
  description: z.string().optional(),
});

/**
 * Crée une TÂCHE PERSO depuis le calendrier : sans chantier, rattachée
 * à son propriétaire (proprietaireId) et visible de lui seul, même par
 * un admin d'espace. Ouverte à TOUT utilisateur non client (un chef ou
 * un ouvrier a aussi ses rappels personnels) : même règle d'accès que
 * le reste de l'édition du planning. Invariant applicatif : une tâche
 * a SOIT un chantierId, SOIT un proprietaireId, jamais les deux ni
 * aucun des deux.
 */
export async function creerTachePerso(input: {
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  description?: string;
}): Promise<{ id: string }> {
  const me = await requireEditionPlanning();
  const data = tachePersoSchema.parse(input);
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
      proprietaireId: me.id,
      nom: data.nom.trim(),
      description: data.description?.trim() || null,
      dateDebut: debut,
      dateFin: fin,
      priorite: 4,
      statut: "A_FAIRE",
    },
  });
  revalidatePath("/planning");
  return { id: t.id };
}

/** Création rapide d'une sous-tâche d'une tâche parente (UI Todoist). */
export async function ajouterSousTache(
  parentId: string,
  nom: string,
  priorite: 1 | 2 | 3 | 4 = 4
) {
  if (!nom.trim()) throw new Error("Nom requis");
  const me = await requireEditionPlanning();
  const parent = await db.tache.findUnique({
    where: { id: parentId },
    select: {
      chantierId: true,
      proprietaireId: true,
      equipeId: true,
      dateDebut: true,
      dateFin: true,
    },
  });
  if (!parent) throw new Error("Tâche parente introuvable");
  await verifierAccesTache(me, parent);

  await db.tache.create({
    data: {
      // La sous-tâche hérite du rattachement du parent : chantier pour
      // une tâche de chantier, propriétaire pour une tâche perso
      // (invariant SOIT chantierId, SOIT proprietaireId préservé).
      chantierId: parent.chantierId,
      proprietaireId: parent.proprietaireId,
      equipeId: parent.equipeId,
      nom: nom.trim(),
      priorite,
      parentId,
      dateDebut: parent.dateDebut,
      dateFin: parent.dateFin,
    },
  });
  revalidatePath("/planning");
  if (parent.chantierId) revalidatePath(`/chantiers/${parent.chantierId}`);
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
  const me = await requireEditionPlanning();
  const existing = await db.tache.findUnique({
    where: { id: tacheId },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!existing) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, existing);
  // Les sections appartiennent à un chantier : une tâche perso n'en a pas.
  if (existing.proprietaireId && sectionId) {
    throw new Error("Une tâche perso n'a pas de section");
  }
  const t = await db.tache.update({
    where: { id: tacheId },
    data: { sectionId },
  });
  revalidatePath("/planning");
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
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
  const me = await requireEditionPlanning();
  // Vérifie l'existence + accès (chantier ou propriétaire)
  const t = await db.tache.findUnique({
    where: { id: tacheId },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!t) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, t);
  // Une tâche perso n'a pas d'ouvriers affectés (outil de chantier).
  if (t.proprietaireId && ouvrierIds.length > 0) {
    throw new Error("Une tâche perso n'a pas d'ouvriers affectés");
  }
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
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
}

/**
 * Réordonne un lot de tâches en assignant `ordre` selon la position
 * dans le tableau reçu. Permet le drag-and-drop dans la liste.
 * Gardes : édition du planning requise (jamais un compte client), lot
 * homogène (un seul rattachement : un chantier OU un propriétaire de
 * tâches perso, jamais mélangés), et frontière d'accès vérifiée comme
 * pour toute mutation (espace du chantier commun, ou propriétaire /
 * admin global pour un lot perso).
 */
export async function reordonnerTaches(orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
  const me = await requireEditionPlanning();
  const uniques = [...new Set(orderedIds)];
  const taches = await db.tache.findMany({
    where: { id: { in: uniques } },
    select: { id: true, chantierId: true, proprietaireId: true },
  });
  // Tout id inconnu fait échouer l'appel : sans cela, un id hors lot
  // vérifié recevrait un `ordre` sans passer par les gardes.
  if (taches.length !== uniques.length) {
    throw new Error("Tâche introuvable dans le lot à réordonner");
  }
  // Les tâches perso (chantierId null) forment leur propre groupe : on
  // peut les réordonner entre elles, jamais mélangées à un chantier.
  const chantierIds = new Set(taches.map((t) => t.chantierId));
  if (chantierIds.size !== 1) {
    throw new Error(
      "Toutes les tâches doivent appartenir au même chantier"
    );
  }
  const chantierId = [...chantierIds][0];
  if (chantierId) {
    // Chantier commun : une seule vérification d'espace suffit.
    await verifierAccesTache(me, { chantierId, proprietaireId: null });
  } else {
    // Lot perso : un seul propriétaire (les perso de TOUS les
    // utilisateurs partagent chantierId null, la taille du Set ne les
    // distingue pas), puis même règle d'accès que toute tâche perso.
    const proprietaires = new Set(taches.map((t) => t.proprietaireId));
    if (proprietaires.size !== 1) {
      throw new Error(
        "Toutes les tâches perso doivent appartenir au même propriétaire"
      );
    }
    await verifierAccesTache(me, {
      chantierId: null,
      proprietaireId: [...proprietaires][0],
    });
  }
  await db.$transaction(
    orderedIds.map((id, ordre) =>
      db.tache.update({ where: { id }, data: { ordre } })
    )
  );
  revalidatePath("/planning");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
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
  const me = await requireEditionPlanning();
  const existing = await db.tache.findUnique({ where: { id } });
  if (!existing) return;
  await verifierAccesTache(me, existing);

  let avancement = existing.avancement;
  if (statut === "TERMINEE") avancement = 100;
  else if (existing.statut === "TERMINEE") avancement = 0;
  else if (statut === "A_FAIRE") avancement = 0;

  const t = await db.tache.update({
    where: { id },
    data: { statut, avancement },
  });
  revalidatePath("/planning");
  if (t.chantierId) revalidatePath(`/chantiers/${t.chantierId}`);
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

/**
 * Garde d'accès à UNE tâche pour les mutations. Invariant applicatif :
 * une tâche a SOIT un chantierId, SOIT un proprietaireId (tâche perso),
 * jamais les deux ni aucun des deux.
 * - Tâche de chantier : frontière d'espace du chantier
 *   (verifierEspaceDuChantier), comme partout ailleurs.
 * - Tâche PERSO : seul son propriétaire, ou un admin global, peut la
 *   modifier. Un admin d'espace n'y a aucun droit.
 */
async function verifierAccesTache(
  me: CurrentUser,
  tache: { chantierId: string | null; proprietaireId: string | null }
): Promise<void> {
  if (tache.chantierId) {
    await verifierEspaceDuChantier(me, tache.chantierId);
    return;
  }
  if (tache.proprietaireId) {
    if (tache.proprietaireId !== me.id && !me.isGlobalAdmin) {
      throw new Error("Cette tâche personnelle ne vous appartient pas");
    }
    return;
  }
  // Ni chantier ni propriétaire : invariant brisé, on refuse d'y toucher.
  throw new Error("Tâche invalide : ni chantier ni propriétaire");
}

const dependanceSchema = z.object({
  tacheId: z.string().min(1),
  depId: z.string().min(1),
});

/** Profondeur maximale des parcours de graphe (anti-emballement). */
const PROFONDEUR_MAX_DEPS = 100;

/**
 * Vérifie qu'ajouter les arêtes « tacheId dépend de chacune de depIds »
 * ne fermerait aucun cycle : parcours en largeur des prédécesseurs de
 * depIds (une requête par niveau, ensemble visité en garde anti-boucle,
 * profondeur bornée). Partagée entre ajouterDependance (une arête) et
 * updateTache (qui remplace l'ensemble des dépendances d'un coup).
 */
async function verifierAbsenceCycle(
  tacheId: string,
  depIds: string[],
  messageCycle?: string
): Promise<void> {
  let frontiere = depIds.filter((d) => d !== tacheId);
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
      if (r.id === tacheId) {
        throw new Error(
          messageCycle ??
            "Impossible : cette dépendance créerait un cycle"
        );
      }
      if (!visites.has(r.id)) {
        visites.add(r.id);
        suivante.push(r.id);
      }
    }
    frontiere = suivante;
  }
}

/**
 * Crée une dépendance : `tacheId` dépendra de `depId` (depId devient un
 * prédécesseur). Refuse l'auto-dépendance, le cross-chantier et tout
 * cycle : on remonte les prédécesseurs de depId en largeur (une requête
 * par niveau, ensemble visité en garde anti-boucle) ; si tacheId est
 * atteint, la liaison fermerait un cycle.
 */
export async function ajouterDependance(tacheId: string, depId: string) {
  const me = await requireEditionPlanning();
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
        proprietaireId: true,
        deletedAt: true,
        dependances: { where: { id: ids.depId }, select: { id: true } },
      },
    }),
    db.tache.findUnique({
      where: { id: ids.depId },
      select: {
        id: true,
        nom: true,
        chantierId: true,
        proprietaireId: true,
        deletedAt: true,
      },
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
  // Deux tâches perso ont le même chantierId (null) : la garde ci-dessous
  // impose en plus qu'elles appartiennent à l'utilisateur (pas de lien
  // vers la tâche perso d'un autre), et borne l'espace côté chantier.
  await verifierAccesTache(me, tache);
  await verifierAccesTache(me, dep);
  // Idempotent : la dépendance existe déjà, rien à faire.
  if (tache.dependances.length > 0) return;

  // Détection de cycle : parcours des prédécesseurs de depId.
  await verifierAbsenceCycle(
    ids.tacheId,
    [ids.depId],
    `Impossible : « ${dep.nom} » dépend déjà, directement ou non, de « ${tache.nom} » (cela créerait un cycle)`
  );

  await db.tache.update({
    where: { id: ids.tacheId },
    data: { dependances: { connect: { id: ids.depId } } },
  });
  revalidatePath("/planning");
  if (tache.chantierId) revalidatePath(`/chantiers/${tache.chantierId}`);
}

/* -------------------- Positions PERT (noeuds déplaçables) -------------------- */

const positionPertSchema = z.object({
  tacheId: z.string().min(1),
  // Bornes larges mais finies : un monde PERT n'a aucune raison de
  // dépasser quelques milliers d'unités, +-100000 absorbe tout usage réel
  // et bloque NaN/Infinity et les valeurs aberrantes.
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});

/**
 * Pose un noeud PERT à une position choisie à la main (drag façon drawio).
 * La position est PARTAGÉE : stockée en base (Tache.pertX/pertY), elle
 * s'applique pour toute l'équipe. NULL = disposition automatique.
 */
export async function majPositionPert(tacheId: string, x: number, y: number) {
  const me = await requireEditionPlanning();
  const data = positionPertSchema.parse({ tacheId, x, y });
  // Frontière d'espace : bornée par le chantier de la tâche. Les tâches
  // perso sont EXCLUES du PERT (outil de projet) : jamais de position.
  const t = await db.tache.findUnique({
    where: { id: data.tacheId },
    select: { chantierId: true, deletedAt: true },
  });
  if (!t || t.deletedAt) throw new Error("Tâche introuvable");
  if (!t.chantierId) {
    throw new Error("Les tâches perso ne participent pas au PERT");
  }
  await verifierEspaceDuChantier(me, t.chantierId);
  await db.tache.update({
    where: { id: data.tacheId },
    data: { pertX: data.x, pertY: data.y },
  });
  revalidatePath("/planning");
  revalidatePath(`/chantiers/${t.chantierId}`);
}

/**
 * Bouton « Réorganiser » : efface les positions manuelles (pertX/pertY à
 * NULL) pour revenir à la disposition automatique par niveaux. Portée
 * EXPLICITE : la liste des chantiers réellement affichés dans la vue,
 * chacun revalidé contre l'espace de l'utilisateur. Jamais de remise à
 * zéro « tout le périmètre accessible » : sans borne, un admin en régime
 * hérité effacerait les positions de toute la base.
 */
export async function reinitialiserPositionsPert(chantierIds: string[]) {
  const me = await requireEditionPlanning();
  const data = z
    .object({
      // Une vue planning n'affiche qu'une poignée de chantiers : 200 est
      // une borne large qui bloque les listes aberrantes.
      chantierIds: z.array(z.string().min(1)).min(1).max(200),
    })
    .parse({ chantierIds });
  const ids = [...new Set(data.chantierIds)];
  // Frontière d'espace : CHAQUE chantier visé est vérifié ; un seul
  // chantier hors espace fait échouer toute l'opération (rien n'est écrit).
  for (const id of ids) {
    await verifierEspaceDuChantier(me, id);
  }
  await db.tache.updateMany({
    where: { chantierId: { in: ids } },
    data: { pertX: null, pertY: null },
  });
  for (const id of ids) {
    revalidatePath(`/chantiers/${id}`);
  }
  revalidatePath("/planning");
}

/** Retire la dépendance « tacheId dépend de depId » (flèche du Gantt). */
export async function retirerDependance(tacheId: string, depId: string) {
  const me = await requireEditionPlanning();
  const ids = dependanceSchema.parse({ tacheId, depId });
  const tache = await db.tache.findUnique({
    where: { id: ids.tacheId },
    select: { chantierId: true, proprietaireId: true },
  });
  if (!tache) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, tache);
  await db.tache.update({
    where: { id: ids.tacheId },
    data: { dependances: { disconnect: { id: ids.depId } } },
  });
  revalidatePath("/planning");
  if (tache.chantierId) revalidatePath(`/chantiers/${tache.chantierId}`);
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
  const me = await requireEditionPlanning();
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
    select: {
      id: true,
      chantierId: true,
      proprietaireId: true,
      dateDebut: true,
      deletedAt: true,
    },
  });
  if (!tache || tache.deletedAt) throw new Error("Tâche introuvable");
  await verifierAccesTache(me, tache);

  const UN_JOUR = 24 * 60 * 60 * 1000;
  // Arrondi : absorbe l'écart fuseau local / minuit UTC des colonnes Date.
  const deltaJours = Math.round(
    (dStart.getTime() - new Date(tache.dateDebut).getTime()) / UN_JOUR
  );

  // Chantiers dont la page détail doit être revalidée (les tâches perso,
  // sans chantier, n'y contribuent pas).
  const chantiersTouches = new Set<string>();
  if (tache.chantierId) chantiersTouches.add(tache.chantierId);
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
      chantierId: string | null;
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
      if (s.chantierId) chantiersTouches.add(s.chantierId);
    }
  }

  await db.$transaction(updates);
  revalidatePath("/planning");
  for (const chantierId of chantiersTouches) {
    revalidatePath(`/chantiers/${chantierId}`);
  }
}
