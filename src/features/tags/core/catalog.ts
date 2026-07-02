// Catalogue des tags applicables aux messages du journal.
//
// CATALOGUE FERMÉ v4.2 (décision utilisateur) : trois tags fixes, identiques
// pour tous les chantiers. Évolution prévue : passer à un catalogue par espace
// (multi-entreprises), chargé depuis la base et administrable par chaque
// entreprise ; ce tableau deviendra alors le jeu de valeurs par défaut d'un
// nouvel espace, et `getTagDefinition` / `listTagsForRole` garderont la même
// signature en prenant le catalogue de l'espace courant en paramètre.
import type { Role, TagDefinition } from "./types";
import { normalizeTagCode } from "./parser";

export const TAG_CATALOG: readonly TagDefinition[] = [
  {
    code: "tache",
    label: "Tâche",
    description: "Transforme le message en tâche à suivre dans le planning du chantier.",
    moduleCible: "planning",
    rolesAutorises: ["ADMIN", "CONDUCTEUR", "CHEF"],
  },
  {
    code: "incident",
    label: "Incident",
    description: "Signale un incident à instruire dans le module incidents.",
    moduleCible: "incidents",
    rolesAutorises: ["ADMIN", "CONDUCTEUR", "CHEF"],
  },
  {
    code: "reserve",
    label: "Réserve",
    description: "Consigne une réserve rattachée au PV de réception.",
    moduleCible: "pv-reception",
    rolesAutorises: ["ADMIN", "CONDUCTEUR", "CLIENT"],
  },
];

/**
 * Retourne la définition d'un tag à partir de son code, ou undefined si le
 * code n'existe pas dans le catalogue. La recherche est tolérante : le code
 * est normalisé (casse et accents), donc "Tâche" retrouve bien "tache".
 */
export function getTagDefinition(code: string): TagDefinition | undefined {
  const codeNormalise = normalizeTagCode(code);
  return TAG_CATALOG.find((definition) => definition.code === codeNormalise);
}

/**
 * Liste les tags qu'un rôle donné est autorisé à appliquer,
 * dans l'ordre du catalogue.
 */
export function listTagsForRole(role: Role): TagDefinition[] {
  return TAG_CATALOG.filter((definition) => definition.rolesAutorises.includes(role));
}
