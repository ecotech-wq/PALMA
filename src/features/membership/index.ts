/**
 * Brique membres (v4.3) : point d'entrée public unique.
 * À importer depuis des SERVER components / actions uniquement.
 */

export {
  canManageMembers,
  canJoinCanal,
  isInternalRole,
} from "./core/membership-policy";

export {
  addChantierMembre,
  removeChantierMembre,
  addCanalMembre,
  removeCanalMembre,
} from "./server/membre-actions";

export {
  listChantierMembres,
  listCanalMembres,
  listUtilisateursInvitables,
  isChantierMembre,
  type MembreChantier,
} from "./server/membre-queries";
