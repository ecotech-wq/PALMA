// Constantes du socle espaces partagées client/serveur (le module
// src/lib/espaces.ts est "server-only" : les composants client importent ici).

export const COOKIE_ESPACE = "lynx-espace";
export const TOUS_ESPACES = "tous";

/** Modules (apps) disponibles sur la plateforme. */
export const MODULES = {
  chantier: "chantier",
  be: "be",
} as const;
export type ModuleCode = (typeof MODULES)[keyof typeof MODULES];
