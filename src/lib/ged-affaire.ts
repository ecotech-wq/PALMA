// ─── GED d'affaire : le « dossier client » d'une opportunité (CRM) ──────────
// Logique PURE (aucune dépendance serveur ni client Prisma généré, comme
// lib/affaires.ts) : testée dans ged-affaire.test.ts. L'arborescence est
// VIRTUELLE : pas de dossiers physiques, chaque AffaireDocument porte sa
// catégorie et la page /affaires/[id]/documents regroupe par catégorie.
// Les pièces arrivent de deux façons : dépôt direct dans une catégorie, ou
// rangement d'une pièce jointe du fil de l'affaire (messageId conservé).

/** Miroir de l'enum Prisma CategorieDocAffaire (import type interdit ici
 *  pour garder la lib importable par les tests sans client généré). */
export const CATEGORIES_DOC_AFFAIRE = [
  "PHOTOS",
  "PIECES_CLIENT",
  "CONCEPTION",
  "DEVIS",
  "LIVRABLES",
  "AUTRE",
] as const;

export type CategorieDocAffaire = (typeof CATEGORIES_DOC_AFFAIRE)[number];

/** Ordre d'affichage des sous-dossiers du dossier client. */
export const ORDRE_CATEGORIES_AFFAIRE: CategorieDocAffaire[] = [
  ...CATEGORIES_DOC_AFFAIRE,
];

/** Libellé singulier (lignes de document, selects). */
export const LABEL_CATEGORIE_AFFAIRE: Record<CategorieDocAffaire, string> = {
  PHOTOS: "Photo",
  PIECES_CLIENT: "Pièce client",
  CONCEPTION: "Conception",
  DEVIS: "Devis",
  LIVRABLES: "Livrable",
  AUTRE: "Autre",
};

/** Libellé du sous-dossier (titres de groupe, compteurs). */
export const LABEL_GROUPE_AFFAIRE: Record<CategorieDocAffaire, string> = {
  PHOTOS: "Photos",
  PIECES_CLIENT: "Pièces client",
  CONCEPTION: "Conception",
  DEVIS: "Devis",
  LIVRABLES: "Livrables",
  AUTRE: "Autres",
};

/** Une ligne de description par sous-dossier, pour guider le rangement. */
export const DESCRIPTION_GROUPE_AFFAIRE: Record<CategorieDocAffaire, string> = {
  PHOTOS: "Photos du site et de l'existant",
  PIECES_CLIENT: "Pièces fournies par le client (cadastre, géomètre, CU...)",
  CONCEPTION: "Esquisses, plans, notes de calcul",
  DEVIS: "Devis et propositions d'honoraires",
  LIVRABLES: "Documents remis au client",
  AUTRE: "Tout le reste du dossier",
};

/**
 * Catégorie pré-suggérée pour ranger une pièce jointe du fil : une image
 * part dans Photos, tout le reste dans Autres (l'utilisateur affine dans
 * la feuille de rangement).
 */
export function suggererCategorie(
  mimeType: string | null | undefined
): CategorieDocAffaire {
  return mimeType && mimeType.startsWith("image/") ? "PHOTOS" : "AUTRE";
}

/**
 * Type MIME déduit de l'extension d'une URL d'upload (les photos du fil
 * sont stockées sans nom d'origine ni type ; le fil les convertit en webp).
 * Repli neutre pour une extension inconnue.
 */
export function mimeDepuisUrl(url: string): string {
  const ext = (url.split(".").pop() ?? "").toLowerCase();
  const table: Record<string, string> = {
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    pdf: "application/pdf",
  };
  return table[ext] ?? "application/octet-stream";
}

/** Nom de fichier lisible tiré d'une URL d'upload (dernier segment). */
export function nomDepuisUrl(url: string): string {
  return url.split("/").pop() || "document";
}
