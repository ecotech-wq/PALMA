/**
 * Convention miniatures de photos uploadées.
 *
 * À côté de chaque photo `<uuid>.webp` (générée par saveUploadedPhoto),
 * une miniature `<uuid>.thumb.webp` (320 px, qualité 70) est écrite dans
 * le même dossier. Les grilles et vignettes chargent la miniature ; le
 * plein écran (Lightbox, impression) garde l'original 1280 px.
 *
 * Module PUR : aucune dépendance serveur, importable côté client comme
 * côté serveur (contrairement à lib/upload.ts qui est "server-only").
 */

export const SUFFIXE_MINIATURE = ".thumb.webp";

/**
 * URL de la miniature d'une photo uploadée.
 *
 * - `/uploads/journal/abc.webp` devient `/uploads/journal/abc.thumb.webp`
 * - une URL déjà en `.thumb.webp` est renvoyée telle quelle (idempotent)
 * - tout ce qui n'est pas un `.webp` (vidéo, PDF, data URL, blob, chaîne
 *   vide) est renvoyé inchangé : l'appelant peut passer n'importe quelle
 *   URL de média sans précaution.
 *
 * Les anciennes photos sans miniature sont couvertes côté client par le
 * fallback onError de <PhotoVignette> : aucune migration de données.
 */
export function urlMiniature(url: string): string {
  if (typeof url !== "string" || url.length === 0) return url;
  if (url.endsWith(SUFFIXE_MINIATURE)) return url;
  if (!url.endsWith(".webp")) return url;
  return url.slice(0, -".webp".length) + SUFFIXE_MINIATURE;
}
