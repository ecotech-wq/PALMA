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

/**
 * Plafond CLIENT d'un envoi de la messagerie : 45 Mo par fichier ET par
 * envoi complet. La requête server action est plafonnée à 50 Mo côté
 * serveur (next.config.ts) ; sans ce contrôle, un envoi multiple dont
 * chaque pièce passe séparément échouerait en bloc avec une erreur
 * illisible une fois la limite de la requête dépassée.
 */
export const TAILLE_MAX_ENVOI_OCTETS = 45 * 1024 * 1024;

/** Nombre maximal de pièces jointes d'un même message. Miroir CLIENT du
 *  plafond serveur des plans de rangement (planRangementSchema et
 *  rangerSchema, .max(30)) : au-delà, le plan entier serait rejeté par
 *  zod après l'envoi et aucune pièce ne serait rangée. */
export const MAX_PIECES_PAR_ENVOI = 30;

/** Plafonds CLIENT par type, miroirs des limites serveur de lib/upload.ts
 *  pour le pipeline de la messagerie (uploadMedia) : refuser à la
 *  sélection ce que le serveur refusera de toute façon après un upload
 *  complet. */
export const TAILLE_MAX_IMAGE_OCTETS = 10 * 1024 * 1024; // saveUploadedPhoto
export const TAILLE_MAX_AUDIO_OCTETS = 25 * 1024 * 1024; // saveUploadedAudio
export const TAILLE_MAX_DOCUMENT_OCTETS = 25 * 1024 * 1024; // saveUploadedDocument

/**
 * Plafond par fichier selon son type MIME, aligné sur l'aiguillage
 * serveur d'uploadMedia : image -> photo (10 Mo), audio -> mémo (25 Mo),
 * vidéo -> seule l'enveloppe de la requête la borne (45 Mo, le serveur
 * accepte jusqu'à 100 Mo), tout le reste -> document (25 Mo).
 */
export function plafondEnvoiPourType(mimeType: string): number {
  if (mimeType.startsWith("video/")) return TAILLE_MAX_ENVOI_OCTETS;
  if (mimeType.startsWith("image/")) return TAILLE_MAX_IMAGE_OCTETS;
  if (mimeType.startsWith("audio/")) return TAILLE_MAX_AUDIO_OCTETS;
  return TAILLE_MAX_DOCUMENT_OCTETS;
}

/**
 * Contrôle des tailles AVANT envoi : renvoie les indices des nouveaux
 * fichiers acceptés et un message en français par refus (fichier trop
 * lourd pour son type ou pour l'enveloppe, plus de 30 pièces, ou total
 * de l'envoi qui dépasserait le plafond en le comptant avec les pièces
 * déjà jointes et les nouveaux déjà acceptés). Le `type` MIME est
 * optionnel : sans lui, seule l'enveloppe globale s'applique.
 */
export function controlerTaillesEnvoi(
  taillesDejaJointes: number[],
  nouveaux: { nom: string; taille: number; type?: string }[],
  maxOctets: number = TAILLE_MAX_ENVOI_OCTETS
): { indicesAcceptes: number[]; refus: string[] } {
  const maxMo = Math.round(maxOctets / (1024 * 1024));
  let total = taillesDejaJointes.reduce((s, t) => s + t, 0);
  let nombre = taillesDejaJointes.length;
  const indicesAcceptes: number[] = [];
  const refus: string[] = [];
  nouveaux.forEach((f, i) => {
    const plafondFichier =
      f.type === undefined
        ? maxOctets
        : Math.min(maxOctets, plafondEnvoiPourType(f.type));
    if (f.taille > plafondFichier) {
      const plafondMo = Math.round(plafondFichier / (1024 * 1024));
      refus.push(
        `Ce fichier dépasse ${plafondMo} Mo : ${f.nom} (${formatTailleFichier(f.taille)}). Réduisez-le ou envoyez-le autrement.`
      );
      return;
    }
    if (nombre >= MAX_PIECES_PAR_ENVOI) {
      refus.push(
        `Un message est limité à ${MAX_PIECES_PAR_ENVOI} pièces jointes : ${f.nom} n'a pas été ajouté. Envoyez-le dans un second message.`
      );
      return;
    }
    if (total + f.taille > maxOctets) {
      refus.push(
        `L'envoi dépasserait ${maxMo} Mo au total : ${f.nom} n'a pas été ajouté. Envoyez-le dans un second message.`
      );
      return;
    }
    total += f.taille;
    nombre += 1;
    indicesAcceptes.push(i);
  });
  return { indicesAcceptes, refus };
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
