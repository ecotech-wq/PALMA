/*
 * Source unique de la marque (marque blanche).
 *
 * Ce fichier porte l'identité TEXTUELLE et les assets de l'application :
 * il sera surchargé par la configuration d'espace (multi-entreprises),
 * puis par le renommage LYNX. Les couleurs CSS restent définies dans
 * globals.css (tokens Tailwind) : `colors` ci-dessous n'existe que comme
 * donnée de référence (emails, manifest, exports), jamais pour styler l'UI.
 *
 * Règle absolue : plus AUCUNE chaîne de marque en dur dans le code
 * applicatif. Tout consommateur importe BRAND via `@/lib/theme`.
 */
export const BRAND = {
  appName: "Autonhome",
  shortName: "Autonhome",
  tagline: "Gestion de chantier",
  colors: { primary: "#135858", accent: "#b5733b" },
  logo: "/brand/logo.webp",
  logoIcon: "/brand/logo-icon.webp",
  emailFromName: "Autonhome",
  totpIssuer: "Autonhome",
  pushSubjectFallback: "mailto:admin@autonhome.local",
  domain: "autonhome.alphatek.fr",
} as const;

/** Forme du référentiel de marque (utile pour la future config d'espace). */
export type Brand = typeof BRAND;
