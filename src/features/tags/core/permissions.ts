// Règles d'autorisation d'application des tags, dérivées du catalogue.
import type { Role } from "./types";
import { getTagDefinition } from "./catalog";

/**
 * Indique si un rôle est autorisé à appliquer un tag donné.
 * Un code inconnu du catalogue est toujours refusé, quel que soit le rôle.
 * Le code est normalisé par `getTagDefinition` (casse et accents ignorés).
 */
export function canApplyTag(role: Role, tagCode: string): boolean {
  const definition = getTagDefinition(tagCode);
  if (!definition) return false;
  return definition.rolesAutorises.includes(role);
}
