/**
 * Pagination du fil de messagerie d'un chantier.
 *
 * Première charge : les TAILLE_PAGE_MESSAGES messages les plus récents du
 * canal actif (page serveur). Le bouton « Messages précédents » en haut du
 * fil charge une page de plus vers le passé via
 * GET /api/messagerie/[chantierId]/history (curseur createdAt).
 *
 * Module PUR (pas de "server-only") : importé par la page serveur, la
 * route d'API et le client ChantierFeed.
 */
export const TAILLE_PAGE_MESSAGES = 30;
