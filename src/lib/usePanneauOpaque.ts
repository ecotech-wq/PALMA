"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/**
 * Fond opaque INCONDITIONNEL pour les panneaux flottants (menus,
 * feuilles, popovers). Style inline calculé côté client : il ne dépend
 * d'aucune feuille de styles, donc il survit à un CSS périmé (HMR en
 * dev) et à toute divergence de navigateur. Cause réelle : panneau
 * « Créer » rendu transparent chez l'utilisateur (Firefox) alors que
 * les styles calculés étaient sains en Chromium.
 *
 * Couleurs figées volontairement : #ffffff (thème clair) et #0f172a
 * (slate-900, thème sombre), les mêmes que les cartes de l'app.
 */
export function usePanneauOpaque(): CSSProperties {
  // Sombre par défaut : c'est le thème dominant de l'app, et un panneau
  // sombre sur page claire reste lisible (l'inverse éblouit).
  const [sombre, setSombre] = useState(true);
  useEffect(() => {
    setSombre(document.documentElement.classList.contains("dark"));
  }, []);
  return { backgroundColor: sombre ? "#0f172a" : "#ffffff" };
}
