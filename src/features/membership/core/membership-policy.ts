import type { Role } from "@/generated/prisma/enums";
import type { CanalVisibility } from "@/generated/prisma/enums";

/**
 * Politique des membres (v4.3). Fonctions PURES : testables sans DB.
 *
 * Décisions (VISION-LYNX-V4.md section 8) :
 *  - l'admin gère tout ; un conducteur gère les membres des chantiers
 *    dont il est lui-même membre ;
 *  - BORNE DURE : un externe n'est invitable que sur un canal de sa
 *    classe (CLIENT -> canal CLIENT, SOUS_TRAITANT -> canal
 *    SOUS_TRAITANT), jamais sur un canal INTERNE ;
 *  - OUVRIER : interface réduite au pointage, pas de messagerie au
 *    lancement, donc invitable sur aucun canal pour l'instant.
 */

/** Qui peut gérer (inviter, retirer) les membres d'un chantier ou de ses canaux ? */
export function canManageMembers(
  user: { isAdmin: boolean; isConducteur: boolean },
  isMembreDuChantier: boolean
): boolean {
  if (user.isAdmin) return true;
  return user.isConducteur && isMembreDuChantier;
}

/**
 * Un utilisateur de ce rôle peut-il être membre d'un canal de cette
 * visibilité ? C'est la borne dure : elle est appliquée côté action et
 * ne souffre aucune exception, même venant d'un admin.
 */
export function canJoinCanal(role: Role, visibility: CanalVisibility): boolean {
  switch (role) {
    case "ADMIN":
    case "CONDUCTEUR":
    case "CHEF":
      return true;
    case "CLIENT":
      return visibility === "CLIENT";
    case "SOUS_TRAITANT":
      return visibility === "SOUS_TRAITANT";
    case "OUVRIER":
      return false;
    default:
      return false;
  }
}

/** Rôles internes à l'entreprise (membres de droit du canal Général). */
export function isInternalRole(role: Role): boolean {
  return role === "ADMIN" || role === "CONDUCTEUR" || role === "CHEF";
}
