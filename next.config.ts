import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sortie standalone : tout le runtime nécessaire est copié dans .next/standalone
  // → image Docker minimale, pas besoin de tout node_modules en prod.
  output: "standalone",

  // Empêche Next.js de bundler ces packages dans les chunks ;
  // ils sont gardés dans .next/standalone/node_modules/ pour qu'ils soient
  // accessibles via `require()` depuis nos scripts d'admin (seed-admin.cjs)
  // et la CLI Prisma utilisée par l'entrypoint.
  serverExternalPackages: [
    "bcryptjs",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-types",
    "pg-protocol",
    "prisma",
  ],

  experimental: {
    // Permet aux Server Actions de recevoir des fichiers volumineux (photos)
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },

  images: {
    formats: ["image/webp"],
  },
};

export default nextConfig;
