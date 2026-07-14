import { z } from "zod";

/**
 * Parsing du formulaire tâche (modale d'édition et formulaire complet).
 * Module pur, séparé des server actions pour être testable sans base.
 *
 * Contrat FormData : la modale d'une tâche PERSO ne rend NI le select
 * `chantierId` (remplacé par le pavé « Rattachement » statique) NI le
 * select `equipeId`. Ces clés sont donc ABSENTES du FormData et
 * `formData.get()` renvoie null, que le schéma Zod rejette (il n'accepte
 * que chaîne ou undefined). Chaque champ optionnel est donc normalisé en
 * chaîne vide AVANT le parse ; sans cela, l'enregistrement d'une tâche
 * perso échouait systématiquement en ZodError (bug 2026-07-14).
 */
const tacheSchema = z.object({
  // Absent ou vide pour une tâche PERSO (le serveur force alors le
  // périmètre perso) ; requis pour une tâche de chantier.
  chantierId: z.string().optional().or(z.literal("")),
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

export function parseTache(formData: FormData) {
  const data = tacheSchema.parse({
    chantierId: formData.get("chantierId") ?? "",
    nom: formData.get("nom"),
    description: formData.get("description") ?? "",
    equipeId: formData.get("equipeId") ?? "",
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    avancement: formData.get("avancement") || 0,
    statut: formData.get("statut") || "A_FAIRE",
    priorite: formData.get("priorite") || 4,
    parentId: formData.get("parentId") ?? "",
    sectionId: formData.get("sectionId") ?? "",
    recurrence: formData.get("recurrence") ?? "",
  });

  return {
    chantierId: data.chantierId || null,
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

export function extractDependances(formData: FormData): string[] {
  const ids = formData.getAll("dependances");
  return ids.map(String).filter(Boolean);
}

export function extractLabelIds(formData: FormData): string[] {
  return formData
    .getAll("labelIds")
    .map(String)
    .filter(Boolean);
}
