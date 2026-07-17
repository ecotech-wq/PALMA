/**
 * Aides PURES pour le lot sécurité visibilité (audit 2026-07-17).
 * Aucune dépendance serveur : testable en isolation (vitest).
 *
 * Deux familles :
 * 1. Bornage d'espace des ressources matérielles (commandes, locations,
 *    sorties) qui n'ont pas d'espaceId propre : la frontière passe par le
 *    chantier (ou l'équipe) rattaché. espaceIds null = régime hérité
 *    (aucune adhésion connue), pas de bornage, comme espaceFilter().
 * 2. Champs protégés des formulaires (budgets chantier, tarif ouvrier) :
 *    quand le champ est ABSENT du FormData (plus aucun hidden input pour
 *    les rôles non autorisés) ou que l'appelant n'est pas autorisé, on
 *    renvoie undefined et Prisma IGNORE le champ : la valeur existante
 *    en base est conservée sans lecture supplémentaire.
 */

/** Commandes : chantier obligatoire, la frontière est celle du chantier. */
export function borneCommandesParEspace(espaceIds: string[] | null) {
  if (!espaceIds) return {};
  return { chantier: { espaceId: { in: espaceIds } } };
}

/**
 * Locations / prêts : chantier optionnel. Une location sans chantier n'est
 * attribuable à aucune entreprise : elle reste visible des pilotes (sinon
 * elle deviendrait ingérable, impossible à clôturer), mais ne porte aucune
 * information de chantier d'un autre espace.
 */
export function borneLocationsParEspace(espaceIds: string[] | null) {
  if (!espaceIds) return {};
  return {
    OR: [
      { chantierId: null },
      { chantier: { espaceId: { in: espaceIds } } },
    ],
  };
}

/**
 * Sorties matériel : rattachées à une équipe et/ou un chantier, tous deux
 * optionnels. Une sortie est dans l'espace si SON chantier ou SON équipe
 * y est ; une sortie sans aucun rattachement reste visible (même logique
 * que les locations orphelines).
 */
export function borneSortiesParEspace(espaceIds: string[] | null) {
  if (!espaceIds) return {};
  return {
    OR: [
      { chantier: { espaceId: { in: espaceIds } } },
      { equipe: { espaceId: { in: espaceIds } } },
      { AND: [{ chantierId: null }, { equipeId: null }] },
    ],
  };
}

/**
 * Valeur d'un champ monétaire protégé (budget, tarif) à écrire en base.
 * - autorise=false : undefined, le payload est ignoré même s'il est forgé ;
 * - champ absent du FormData (null) ou vide : undefined, valeur conservée ;
 * - sinon le nombre soumis, validé fini et positif ou nul.
 * Prisma ignore les clés à undefined dans update() : la colonne n'est pas
 * touchée, sans lecture préalable de la valeur existante.
 */
export function nombreProtege(
  autorise: boolean,
  brut: unknown
): number | undefined {
  if (!autorise) return undefined;
  if (brut === null || brut === undefined || brut === "") return undefined;
  const n = Number(brut);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Montant invalide");
  }
  return n;
}
