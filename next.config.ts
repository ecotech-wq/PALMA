import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sortie standalone : tout le runtime nécessaire est copié dans .next/standalone
  // → image Docker minimale, pas besoin de tout node_modules en prod.
  output: "standalone",

  // Le dossier public/uploads est servi par Next.js (chemin relatif).
  // Sharp est utilisé côté serveur pour redimensionner les uploads.
  experimental: {
    // Permet aux Server Actions de recevoir des fichiers volumineux (photos)
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },

  // Désactive l'optimisation Next/Image en mode WebP/AVIF si on veut servir
  // les uploads tels quels (déjà compressés en WebP par Sharp à l'upload).
  images: {
    formats: ["image/webp"],
  },
};

export default nextConfig;
