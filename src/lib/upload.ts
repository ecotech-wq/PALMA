import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

export async function saveUploadedPhoto(
  file: File,
  folder: "materiel" | "ouvriers" | "pointages" | "rapports"
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
