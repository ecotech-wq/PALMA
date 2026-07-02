import type { ChannelRef, ChannelRole, ChannelVisibility } from "./types";

/**
 * Nom exact du canal de repli créé automatiquement sur chaque projet.
 * Les messages historiques (canalId null) y sont rattachés par la
 * migration ; il n'est ni renommable ni archivable.
 */
export const GENERAL_CHANNEL_NAME = "Général";

/**
 * Forme canonique d'un nom de canal pour la détection de doublons :
 * minuscules, accents retirés, espaces réduits. Aux yeux d'un
 * utilisateur, "Général", "general" et "  GENERAL " sont le même
 * canal ; la contrainte unique en base ne voit que l'égalité stricte,
 * cette normalisation comble l'écart côté application.
 */
export function normalizeChannelName(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Politique de visibilité des canaux. Fonctions PURES (pas de DB, pas
 * d'auth) : la décision est testable exhaustivement en vitest.
 *
 * Règles (décision v4.2) :
 *   - L'équipe interne (ADMIN, CONDUCTEUR, CHEF) voit TOUS les canaux.
 *   - Un CLIENT ne voit que les canaux ouverts au client.
 *   - Le futur rôle SOUS_TRAITANT ne verra que les canaux SOUS_TRAITANT.
 */
export function canSeeChannel(
  role: ChannelRole,
  visibility: ChannelVisibility
): boolean {
  if (role === "ADMIN" || role === "CONDUCTEUR" || role === "CHEF") {
    return true;
  }
  if (role === "CLIENT") return visibility === "CLIENT";
  if (role === "SOUS_TRAITANT") return visibility === "SOUS_TRAITANT";
  return false;
}

/**
 * Qui peut créer (et gérer : renommer, archiver) un canal ?
 * Décision : admin ou conducteur de travaux uniquement. Le chef de
 * chantier écrit dans les canaux mais n'en gère pas la structure.
 */
export function canCreateChannel(user: {
  isAdmin: boolean;
  isConducteur: boolean;
}): boolean {
  return user.isAdmin || user.isConducteur;
}

/**
 * Filtre la liste des canaux pour un rôle : applique canSeeChannel et
 * exclut les canaux archivés. L'ordre d'entrée est préservé (la requête
 * DB trie déjà par `ordre`).
 */
export function visibleChannels(
  role: ChannelRole,
  channels: ChannelRef[]
): ChannelRef[] {
  return channels.filter(
    (c) => c.archivedAt === null && canSeeChannel(role, c.visibility)
  );
}
