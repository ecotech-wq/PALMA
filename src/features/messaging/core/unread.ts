/**
 * Clés de suivi "lu / non lu" (table UserReadState) pour la messagerie.
 *
 * Convention historique (avant les canaux) : "chantier:<projectId>".
 * Avec les canaux v4.2, chaque canal a sa propre clé :
 * "chantier:<projectId>:canal:<channelId>".
 *
 * La forme sans canal est conservée telle quelle pour rester compatible
 * avec les lignes UserReadState déjà en base et avec les compteurs
 * globaux existants (cf. src/lib/read-state.ts).
 */

/**
 * Construit la clé de lecture d'un fil.
 * Sans channelId (undefined, null ou chaîne vide) : clé historique du
 * projet entier. Avec channelId : clé propre au canal.
 */
export function readResourceKey(
  projectId: string,
  channelId?: string | null
): string {
  if (!channelId) return `chantier:${projectId}`;
  return `chantier:${projectId}:canal:${channelId}`;
}
