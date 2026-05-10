import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";

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

  await sharp(buffer)
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(fullPath);

  return `/uploads/${folder}/${filename}`;
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
