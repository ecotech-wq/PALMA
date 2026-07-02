// Brique tags (générique, ignorante du métier BTP).
//
// Point d'entrée UNIQUE de la brique : tout import externe passe par ce
// fichier (`@/features/tags`), jamais par les fichiers internes. Aucune
// server action ici : le câblage (application des tags aux messages du
// journal, création des MessageTag) vient d'ailleurs.

export type { Role, TagCode, TagDefinition, ExtractedTag } from "./core/types";
export { TAG_CATALOG, getTagDefinition, listTagsForRole } from "./core/catalog";
export { extractTags, normalizeTagCode } from "./core/parser";
export { canApplyTag } from "./core/permissions";
export { TagChip } from "./components/TagChip";
export { TagPicker } from "./components/TagPicker";
