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

/* -------------------------------------------------------------------------
 *  Dossiers personnalisés du dossier client (Affaire.dossiersPerso, Json)
 *
 *  En plus des six catégories standard, chaque affaire peut porter ses
 *  propres dossiers (« Mairie », « Sous-traitants »...). Le catalogue vit
 *  dans Affaire.dossiersPerso (tableau de { cle, libelle }) ; un document
 *  rattaché porte AffaireDocument.dossierPerso = cle.
 * ----------------------------------------------------------------------- */

/** Un dossier personnalisé du dossier client. */
export type DossierPerso = { cle: string; libelle: string };

/** Longueur maximale du libellé d'un dossier personnalisé. */
export const LIBELLE_DOSSIER_MAX = 40;

/** Relit Affaire.dossiersPerso en tolérant les données inattendues :
 *  entrées mal formées ignorées, doublons de clé dédoublonnés (la
 *  première occurrence gagne). */
export function parseDossiersPerso(raw: unknown): DossierPerso[] {
  if (!Array.isArray(raw)) return [];
  const vus = new Set<string>();
  const out: DossierPerso[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as { cle?: unknown }).cle === "string" &&
      (it as { cle: string }).cle !== "" &&
      typeof (it as { libelle?: unknown }).libelle === "string" &&
      (it as { libelle: string }).libelle !== ""
    ) {
      const d = it as DossierPerso;
      if (vus.has(d.cle)) continue;
      vus.add(d.cle);
      out.push({ cle: d.cle, libelle: d.libelle });
    }
  }
  return out;
}

/** Clé stable tirée d'un libellé : minuscules, sans accents, les suites
 *  de caractères non alphanumériques deviennent un tiret. */
export function cleDossierDepuisLibelle(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clés réservées : les six catégories standard (clés d'enum et libellés
 *  de groupe), pour qu'un dossier « Photos » ne crée pas de doublon. */
const CLES_RESERVEES = new Set<string>([
  ...CATEGORIES_DOC_AFFAIRE.map((c) => c.toLowerCase().replace(/_/g, "-")),
  ...CATEGORIES_DOC_AFFAIRE.map((c) =>
    cleDossierDepuisLibelle(LABEL_GROUPE_AFFAIRE[c])
  ),
]);

/**
 * Prépare l'ajout d'un dossier personnalisé : valide le libellé (1 à 40
 * caractères), calcule la clé et vérifie qu'elle ne heurte ni les six
 * catégories standard ni un dossier existant. En cas de doublon exact,
 * `existant` permet à l'appelant d'être idempotent (renvoyer le dossier
 * déjà créé plutôt qu'une erreur, deux pilotes pouvant créer « Mairie »
 * en même temps).
 */
export function preparerNouveauDossier(
  libelle: string,
  existants: DossierPerso[]
):
  | { ok: true; dossier: DossierPerso }
  | { ok: false; erreur: string; existant?: DossierPerso } {
  const net = libelle.trim().replace(/\s+/g, " ");
  if (net.length === 0) {
    return { ok: false, erreur: "Donnez un nom au dossier" };
  }
  if (net.length > LIBELLE_DOSSIER_MAX) {
    return {
      ok: false,
      erreur: `Nom de dossier trop long (${LIBELLE_DOSSIER_MAX} caractères maximum)`,
    };
  }
  const cle = cleDossierDepuisLibelle(net);
  if (cle === "") {
    return { ok: false, erreur: "Nom de dossier invalide" };
  }
  if (CLES_RESERVEES.has(cle)) {
    return {
      ok: false,
      erreur: "Ce nom est déjà celui d'un sous-dossier standard",
    };
  }
  const existant = existants.find((d) => d.cle === cle);
  if (existant) {
    return { ok: false, erreur: "Ce dossier existe déjà", existant };
  }
  return { ok: true, dossier: { cle, libelle: net } };
}

/** Libellé d'un dossier personnalisé ; repli sur la clé si le catalogue
 *  ne la connaît plus (donnée historique : on affiche, on ne casse pas). */
export function libelleDossierPerso(
  cle: string,
  dossiers: DossierPerso[]
): string {
  return dossiers.find((d) => d.cle === cle)?.libelle ?? cle;
}
