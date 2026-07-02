/**
 * Détection structurelle des erreurs Prisma, sans importer le client
 * généré (core/ reste pur et testable sans DB).
 */

/**
 * Vrai si l'erreur est une violation de contrainte unique Prisma
 * (code P2002), par exemple deux canaux de même nom sur un chantier.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}
