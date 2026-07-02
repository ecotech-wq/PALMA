// Types de la brique tags (générique, indépendante du métier BTP).
// L'import du rôle est type-only : le coeur reste pur, testable sous vitest
// (environnement node) sans charger le client Prisma généré.
import type { Role } from "@/generated/prisma/enums";

export type { Role };

/**
 * Code technique d'un tag, toujours en minuscules et sans accents
 * (la normalisation est assurée par `normalizeTagCode` dans parser.ts).
 * Le catalogue v4.2 est fermé, d'où l'union fermée ci-dessous. Lors du
 * passage futur à un catalogue par espace (multi-entreprises), ce type
 * s'élargira en `string` et la validation se fera contre le catalogue
 * chargé pour l'espace courant.
 */
export type TagCode = "tache" | "incident" | "reserve";

/** Définition complète d'un tag du catalogue. */
export type TagDefinition = {
  /** Code stable stocké en base (MessageTag.tagCode). */
  code: TagCode;
  /** Libellé affiché à l'utilisateur (français accentué). */
  label: string;
  /** Phrase courte expliquant l'effet du tag (affichée dans le picker et en infobulle). */
  description: string;
  /** Module applicatif vers lequel le tag route l'élément créé (ex. "planning"). */
  moduleCible: string;
  /** Rôles autorisés à appliquer ce tag sur un message. */
  rolesAutorises: Role[];
};

/** Résultat brut du parseur : code normalisé et position du "#" dans le texte d'origine. */
export type ExtractedTag = {
  code: string;
  index: number;
};
