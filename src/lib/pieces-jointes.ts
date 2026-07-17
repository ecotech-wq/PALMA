/**
 * Pièces jointes des messages (messagerie de chantier et journal).
 *
 * Le modèle JournalMessage porte, en plus de `photos` et `videos` :
 *   - `audios`    : tableau d'URLs de mémos vocaux (fichiers bruts,
 *                   dossier /uploads/audios) ;
 *   - `documents` : colonne JSONB, tableau d'entrées
 *                   { url, nom, mimeType, taille } écrites par
 *                   saveUploadedDocument (dossier /uploads/docs-chantiers).
 *
 * Module PUR : aucune dépendance serveur, importable côté client comme
 * côté serveur (même convention que lib/photos.ts). lib/upload.ts, qui
 * est "server-only", importe les listes d'extensions d'ici pour que la
 * whiteliste serveur et l'attribut `accept` des inputs restent une seule
 * et même source de vérité.
 */

/** Extensions acceptées pour les mémos vocaux (25 Mo max côté serveur). */
export const EXTENSIONS_AUDIO = ["webm", "m4a", "mp3", "ogg", "wav"] as const;

/** Extensions acceptées pour les documents (25 Mo max côté serveur). */
export const EXTENSIONS_DOCUMENTS = [
  "pdf", "png", "jpg", "jpeg", "webp", "heic",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
  "dwg", "dxf", "txt", "csv", "zip",
] as const;

/** Valeur `accept` pour l'input fichier du bouton trombone. */
export const ACCEPT_DOCUMENTS = EXTENSIONS_DOCUMENTS.map((e) => "." + e).join(",");

/** Une pièce jointe documentaire attachée à un message du fil. */
export type DocumentMessage = {
  url: string;
  nom: string;
  mimeType: string;
  taille: number;
};

/**
 * Relit la colonne JSONB `documents` d'un JournalMessage de façon
 * tolérante : tout ce qui n'est pas un tableau d'entrées bien formées
 * (url /uploads/..., nom non vide) est ignoré silencieusement. Les
 * champs secondaires manquants reçoivent une valeur sûre.
 */
export function parseDocumentsMessage(value: unknown): DocumentMessage[] {
  if (!Array.isArray(value)) return [];
  const out: DocumentMessage[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const url = typeof e.url === "string" ? e.url : "";
    if (!url.startsWith("/uploads/")) continue;
    const nom =
      typeof e.nom === "string" && e.nom.trim() !== ""
        ? e.nom
        : url.split("/").pop() || "document";
    const mimeType =
      typeof e.mimeType === "string" && e.mimeType !== ""
        ? e.mimeType
        : "application/octet-stream";
    const taille =
      typeof e.taille === "number" && Number.isFinite(e.taille) && e.taille >= 0
        ? e.taille
        : 0;
    out.push({ url, nom, mimeType, taille });
  }
  return out;
}

/**
 * Taille de fichier lisible en français : "512 o", "48 Ko", "1,4 Mo".
 * Renvoie une chaîne vide pour une valeur absente ou invalide (l'UI
 * n'affiche alors simplement pas la taille).
 */
export function formatTailleFichier(octets: number | null | undefined): string {
  if (octets === null || octets === undefined) return "";
  if (!Number.isFinite(octets) || octets < 0) return "";
  if (octets < 1024) return `${Math.round(octets)} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Durée en secondes affichée "m:ss" (mémos vocaux). Valeurs invalides
 * rendues "0:00" pour ne jamais casser l'UI d'enregistrement.
 */
export function formatDureeAudio(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < 0) return "0:00";
  const s = Math.floor(secondes);
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return `${min}:${String(rest).padStart(2, "0")}`;
}

/** Une pièce jointe refusée par le serveur à l'upload (taille, extension...). */
export type EchecUpload = { nom: string; raison: string };

/**
 * Phrase de toast pour des pièces jointes refusées à l'upload :
 * "1 pièce jointe refusée : rapport.pdf (Fichier trop volumineux (max 25 Mo))".
 * Tableau vide : chaîne vide (rien à afficher).
 */
export function formatEchecsUpload(echecs: EchecUpload[]): string {
  if (echecs.length === 0) return "";
  const detail = echecs.map((e) => `${e.nom} (${e.raison})`).join(", ");
  return echecs.length === 1
    ? `1 pièce jointe refusée : ${detail}`
    : `${echecs.length} pièces jointes refusées : ${detail}`;
}
