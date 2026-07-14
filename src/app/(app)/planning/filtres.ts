import type { Prisma } from "@/generated/prisma/client";

/**
 * Composition côté serveur des filtres du planning (query params GET).
 * Fonctions pures : la page valide les ids puis compose le `where` de
 * db.tache.findMany ici, ce qui rend la logique testable sans base.
 */

/**
 * Ne retient le chantier demandé que s'il est accessible à l'utilisateur.
 * `accessibleIds === null` = régime hérité, pas de bornage. Un id hors
 * périmètre est ignoré (on retombe sur « tous les chantiers » bornés)
 * plutôt que de laisser un paramètre d'URL contourner la frontière
 * d'espace.
 */
export function validerChantier(
  chantier: string | undefined,
  accessibleIds: string[] | null
): string | undefined {
  if (!chantier) return undefined;
  if (accessibleIds !== null && !accessibleIds.includes(chantier)) {
    return undefined;
  }
  return chantier;
}

export type FiltresTaches = {
  /** Bornage espace : ids de chantiers accessibles, null = pas de bornage. */
  accessibleIds: string[] | null;
  /** Chantier sélectionné, DÉJÀ validé par validerChantier. */
  chantierId?: string;
  /** Ouvrier affecté (relation TacheOuvrier). */
  ouvrierId?: string;
  /** Équipe assignée à la tâche. */
  equipeId?: string;
  /** Entreprise (espace), DÉJÀ validée par la page : admin global en
   *  mode « toutes les entreprises » uniquement. */
  espaceId?: string;
  /** Utilisateur courant : ses tâches PERSO (proprietaireId) s'ajoutent
   *  au périmètre chantier. Elles ne sont JAMAIS montrées à quelqu'un
   *  d'autre (même admin d'espace), et seulement quand AUCUN filtre
   *  chantier/équipe/ouvrier/entreprise n'est actif (choix simple et
   *  prévisible : un filtre = vue projet pure). */
  persoUserId?: string;
};

/**
 * Construit le `where` des tâches du planning. Le bornage espace et le
 * filtre chantier sont combinés en AND (et non écrasés l'un par l'autre :
 * l'ancien spread `{ chantierId: chantier, ...borne }` faisait gagner le
 * bornage et le filtre chantier était perdu).
 *
 * Depuis les tâches perso (2026-07-14), le périmètre chantier exclut
 * explicitement chantierId null : sans cette clause, le régime hérité
 * (accessibleIds null, aucun filtre) montrerait les tâches perso de
 * TOUS les utilisateurs. Les tâches perso de l'utilisateur reviennent
 * par la branche OR dédiée, hors filtre uniquement.
 */
export function construireWhereTaches(
  f: FiltresTaches
): Prisma.TacheWhereInput {
  const et: Prisma.TacheWhereInput[] = [];
  if (f.accessibleIds !== null) {
    et.push({ chantierId: { in: f.accessibleIds } });
  }
  if (f.chantierId) et.push({ chantierId: f.chantierId });
  if (f.ouvrierId) et.push({ ouvriers: { some: { ouvrierId: f.ouvrierId } } });
  if (f.equipeId) et.push({ equipeId: f.equipeId });
  if (f.espaceId) et.push({ chantier: { espaceId: f.espaceId } });

  const perimetre: Prisma.TacheWhereInput =
    et.length > 0
      ? { chantierId: { not: null }, AND: et }
      : { chantierId: { not: null } };

  const filtreActif = Boolean(
    f.chantierId || f.ouvrierId || f.equipeId || f.espaceId
  );
  if (f.persoUserId && !filtreActif) {
    return {
      deletedAt: null,
      OR: [perimetre, { proprietaireId: f.persoUserId }],
    };
  }
  return { deletedAt: null, ...perimetre };
}
