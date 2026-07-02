// Parseur pur des #tags contenus dans un message.
// Aucune dépendance (ni Prisma, ni catalogue) : ce module extrait TOUS les
// #tags présents dans un texte, c'est à l'appelant de filtrer contre le
// catalogue (via getTagDefinition / canApplyTag). Cela garde le parseur
// générique et prêt pour le futur catalogue par espace (multi-entreprises).
import type { ExtractedTag } from "./types";

/**
 * Normalise un code de tag : minuscules et suppression des accents.
 * Exemple : "Tâche" -> "tache", "RÉSERVE" -> "reserve".
 */
export function normalizeTagCode(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Un tag est un "#" suivi de lettres (accentuées ou non), chiffres ou "_".
 * Le lookbehind interdit un "#" collé à la fin d'un mot ("prix#incident"
 * n'est pas un tag) : le "#" doit être en début de texte, après un espace
 * ou après une ponctuation.
 */
const TAG_REGEX = /(?<![\p{L}\p{N}#])#([\p{L}\p{N}_]+)/gu;

/**
 * Extrait les #tags d'un texte, en corps ou en fin de message.
 * Fonction PURE : mêmes entrées, mêmes sorties, aucun effet de bord.
 *
 * - insensible à la casse et aux accents : "#Tâche", "#TACHE" et "#tache"
 *   renvoient tous le code "tache" ;
 * - `index` est la position du caractère "#" dans le texte d'origine ;
 * - les occurrences multiples (y compris les doublons) sont toutes renvoyées,
 *   dans l'ordre du texte ; la déduplication est du ressort de l'appelant ;
 * - les codes inconnus du catalogue sont renvoyés tels quels (le parseur
 *   ignore volontairement le catalogue).
 */
export function extractTags(texte: string): ExtractedTag[] {
  const resultats: ExtractedTag[] = [];
  for (const correspondance of texte.matchAll(TAG_REGEX)) {
    resultats.push({
      code: normalizeTagCode(correspondance[1]),
      index: correspondance.index,
    });
  }
  return resultats;
}
