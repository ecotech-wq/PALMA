import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

// Le serveur standalone de Next (image Docker de prod) ne sert que les
// fichiers public/ connus AU BUILD : tout ce que l'app écrit à l'exécution
// dans public/uploads/ (photos des messages, plans, vidéos, PV...) répondait
// 404 en production alors que les fichiers étaient bien sur le volume
// (constat prouvé le 2026-07-07 : /file.svg du build -> 200, photo du jour
// -> 404). Cette route sert donc /uploads/* en diffusant depuis le disque,
// aux mêmes URL que celles stockées en base : aucun changement de données.
// Elle reste HORS du garde d'authentification (le matcher de src/proxy.ts
// exclut déjà "uploads"), à parité avec l'ancien service statique : les noms
// de fichiers UUID ne sont pas devinables.

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".ogv": "video/ogg",
  ".dwg": "application/acad",
  ".dxf": "image/vnd.dxf",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const target = path.resolve(UPLOADS_ROOT, ...segments);
  // Anti-traversée : le chemin résolu doit rester sous public/uploads.
  if (!target.startsWith(UPLOADS_ROOT + path.sep)) {
    return new Response("Chemin invalide", { status: 400 });
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
  if (!info.isFile()) {
    return new Response("Introuvable", { status: 404 });
  }

  const contentType =
    CONTENT_TYPES[path.extname(target).toLowerCase()] ??
    "application/octet-stream";
  // Les noms sont des UUID : un fichier ne change jamais sous la même URL,
  // le cache long est donc sans risque.
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // Requêtes partielles (Range) : Safari iOS refuse de lire une vidéo sans
  // réponse 206. On gère la forme courante "bytes=a-b" (une seule plage).
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] !== "" || m[2] !== "")) {
      const start = m[1] === "" ? Math.max(0, info.size - Number(m[2])) : Number(m[1]);
      const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      }
      const flux = Readable.toWeb(
        createReadStream(target, { start, end })
      ) as ReadableStream;
      return new Response(flux, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  const flux = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new Response(flux, {
    headers: { ...baseHeaders, "Content-Length": String(info.size) },
  });
}
