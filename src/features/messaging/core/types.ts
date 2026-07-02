/**
 * Types purs de la brique messagerie (canaux).
 *
 * La brique est générique : elle parle de `projectId` (dans LYNX, un
 * projet = un chantier). Les valeurs de visibilité sont alignées sur
 * l'enum Prisma `CanalVisibility` mais redéclarées ici en union de
 * littéraux pour garder core/ 100 % pur (aucun import Prisma).
 */

/** Qui peut voir un canal (aligné sur l'enum Prisma CanalVisibility). */
export type ChannelVisibility = "INTERNE" | "CLIENT" | "SOUS_TRAITANT";

/**
 * Rôles connus de la politique de visibilité. OUVRIER (v4.3) ne voit
 * aucun canal pour l'instant : son interface est réduite au pointage.
 */
export type ChannelRole =
  | "ADMIN"
  | "CONDUCTEUR"
  | "CHEF"
  | "CLIENT"
  | "SOUS_TRAITANT"
  | "OUVRIER";

/** Référence légère d'un canal, suffisante pour la politique et l'UI. */
export type ChannelRef = {
  id: string;
  nom: string;
  visibility: ChannelVisibility;
  ordre: number;
  /** null = canal actif ; une date = canal archivé (jamais supprimé). */
  archivedAt: Date | null;
};
