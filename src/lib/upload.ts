import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v", "ogv"] as const;
const PLAN_EXTS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "dwg",
  "dxf",
] as const;

export async function saveUploadedPhoto(
  file: File,
  folder:
    | "materiel"
    | "ouvriers"
    | "pointages"
    | "rapports"
    | "incidents"
    | "journal"
    | "plans"
    | "pv"
    | "logos"
): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error("Aucun fichier reçu");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux (max 10 Mo)");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier doit être une image");
  }

  const dir = path.join(UPLOADS_ROOT, folder);
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const filename = `${id}.webp`;
  const fullPath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extraction EXIF (GPS + date de prise de vue) AVANT le redimensionnement
  // Sharp qui efface les métadonnées par défaut. Best-effort : si l'image
  // n'a pas d'EXIF lisible ou pas de GPS, on n'enregistre rien.
  let exif: { gpsLat?: number; gpsLng?: number; takenAt?: Date } = {};
  try {
    const parsed = await exifr.parse(buffer, {
      gps: true,
      pick: ["latitude", "longitude", "DateTimeOriginal", "CreateDate"],
    });
    if (parsed) {
      const lat = typeof parsed.latitude === "number" ? parsed.latitude : undefined;
      const lng = typeof parsed.longitude === "number" ? parsed.longitude : undefined;
      const takenAt =
        parsed.DateTimeOriginal instanceof Date
          ? parsed.DateTimeOriginal
          : parsed.CreateDate instanceof Date
            ? parsed.CreateDate
            : undefined;
      // On garde si au moins une info utile (GPS ou date) — pas de ligne vide
      if ((lat !== undefined && lng !== undefined) || takenAt) {
        exif = { gpsLat: lat, gpsLng: lng, takenAt };
      }
    }
  } catch {
    // Ignore : pas d'EXIF, image mal formée, etc.
  }

  await sharp(buffer)
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(fullPath);

  const url = `/uploads/${folder}/${filename}`;

  // Persiste les métadonnées si on a trouvé quelque chose d'utile.
  // Best-effort : on ne bloque jamais l'upload pour un échec d'écriture.
  if (exif.gpsLat !== undefined || exif.takenAt) {
    db.photoMetadata
      .create({
        data: {
          url,
          gpsLat: exif.gpsLat ?? null,
          gpsLng: exif.gpsLng ?? null,
          takenAt: exif.takenAt ?? null,
        },
      })
      .catch((e) => {
        console.error("PhotoMetadata create failed:", e);
      });
  }

  return url;
}

/**
 * Récupère les métadonnées EXIF associées à une liste d'URLs de photos.
 * Renvoie un Record indexé par URL pour un lookup O(1) côté UI.
 */
export async function getPhotoMetadata(
  urls: string[]
): Promise<
  Record<string, { gpsLat: number | null; gpsLng: number | null; takenAt: Date | null }>
> {
  if (urls.length === 0) return {};
  const rows = await db.photoMetadata.findMany({
    where: { url: { in: urls } },
    select: { url: true, gpsLat: true, gpsLng: true, takenAt: true },
  });
  const out: Record<
    string,
    { gpsLat: number | null; gpsLng: number | null; takenAt: Date | null }
  > = {};
  for (const r of rows) {
    out[r.url] = {
      gpsLat: r.gpsLat,
      gpsLng: r.gpsLng,
      takenAt: r.takenAt,
    };
  }
  return out;
}

/**
 * Sauvegarde une image de plan (issue d'un PDF rastérisé ou d'une photo
 * d'un plan). Contrairement à `saveUploadedPhoto`, on ne redimensionne
 * pas : les plans doivent rester nets quand on zoome dessus pour placer
 * les puces. Conversion en webp quand même pour gagner en taille
 * disque, en haute qualité.
 *
 * Limite : 40 Mo (PDF haute résolution rastérisé en 300 dpi peut être
 * volumineux).
 */
export async function saveUploadedPlanImage(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error("Aucun fichier reçu");
  }
  if (file.size > 40 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux (max 40 Mo)");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier doit être une image");
  }

  const dir = path.join(UPLOADS_ROOT, "pv");
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const filename = `${id}.webp`;
  const fullPath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());

  await sharp(buffer, { limitInputPixels: 268_435_456 /* ~16k×16k */ })
    .rotate()
    .webp({ quality: 92 })
    .toFile(fullPath);

  return `/uploads/pv/${filename}`;
}

export async function deleteUploadedPhoto(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath || !relativePath.startsWith("/uploads/")) return;
  const safePath = path.join(process.cwd(), "public", relativePath);
  if (!safePath.startsWith(UPLOADS_ROOT)) return;
  try {
    await unlink(safePath);
  } catch {
    // ignore - file may already be gone
  }
}

/**
 * Sauvegarde une vidéo telle quelle (pas de transcodage). On garde
 * l'extension d'origine. Limite : 100 Mo.
 */
export async function saveUploadedVideo(
  file: File,
  folder: "journal" | "rapports" | "plans"
): Promise<string> {
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu");
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("Vidéo trop volumineuse (max 100 Mo)");
  }
  if (!file.type.startsWith("video/")) {
    throw new Error("Le fichier doit être une vidéo");
  }

  const dir = path.join(UPLOADS_ROOT, folder);
  await mkdir(dir, { recursive: true });

  const rawExt = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = (VIDEO_EXTS as readonly string[]).includes(rawExt) ? rawExt : "mp4";
  const id = randomUUID();
  const filename = `${id}.${ext}`;
  const fullPath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);
  return `/uploads/${folder}/${filename}`;
}

/**
 * Sauvegarde un fichier "plan" (PDF, image, fichier CAO...). Pas de
 * traitement, juste validation taille (50 Mo max) et extension whiteliste.
 */
export async function saveUploadedPlan(
  file: File
): Promise<{ url: string; mimeType: string; size: number; originalName: string }> {
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu");
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux (max 50 Mo)");
  }
  const rawExt = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isPlan = (PLAN_EXTS as readonly string[]).includes(rawExt);
  const isVideo = (VIDEO_EXTS as readonly string[]).includes(rawExt);
  if (!isPlan && !isVideo) {
    throw new Error(
      "Format non accepté. Plans : PDF, PNG, JPG, WEBP, DWG, DXF, ou vidéo (MP4, MOV, WEBM)."
    );
  }

  const dir = path.join(UPLOADS_ROOT, "plans");
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const filename = `${id}.${rawExt}`;
  const fullPath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);
  return {
    url: `/uploads/plans/${filename}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    originalName: file.name,
  };
}

/**
 * Sauvegarde un DOCUMENT (GED) : CV et pièces d'un ouvrier, plans, contrats,
 * devis d'un chantier... Fichier conservé tel quel (pas de transformation),
 * extension d'origine gardée pour l'ouverture native (PDF, Office, images).
 */
const DOC_EXTS = [
  "pdf", "png", "jpg", "jpeg", "webp", "heic",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
  "dwg", "dxf", "txt", "csv", "zip",
] as const;

export async function saveUploadedDocument(
  file: File,
  folder: "docs-ouvriers" | "docs-chantiers"
): Promise<{ url: string; mimeType: string; size: number; originalName: string }> {
  if (!file || file.size === 0) throw new Error("Aucun fichier reçu");
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux (max 25 Mo)");
  }
  const rawExt = (file.name.split(".").pop() ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!(DOC_EXTS as readonly string[]).includes(rawExt)) {
    throw new Error(
      "Format non accepté. Documents : PDF, images, Word, Excel, PowerPoint, DWG/DXF, TXT, CSV, ZIP."
    );
  }

  const dir = path.join(UPLOADS_ROOT, folder);
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const filename = `${id}.${rawExt}`;
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return {
    url: `/uploads/${folder}/${filename}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    originalName: file.name,
  };
}
