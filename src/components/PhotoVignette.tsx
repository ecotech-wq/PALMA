"use client";

import { useState } from "react";
import { urlMiniature } from "@/lib/photos";

/**
 * Vignette d'une photo uploadée : charge la miniature 320 px
 * (`<uuid>.thumb.webp`) au lieu de l'original 1280 px, ce qui rend les
 * grilles de photos légères sur le terrain (3G/4G). Si la miniature
 * n'existe pas (photo antérieure à la génération des miniatures), le
 * onError retombe silencieusement sur l'original : aucune migration de
 * données n'est nécessaire.
 *
 * Toujours en chargement paresseux et décodage asynchrone. Le plein
 * écran (Lightbox, impression) doit continuer d'utiliser l'URL d'origine.
 */
export function PhotoVignette({
  url,
  alt,
  className,
  draggable,
}: {
  url: string;
  alt: string;
  className?: string;
  draggable?: boolean;
}) {
  // URL dont la miniature a échoué (404) : on affiche l'original.
  // Comparée à l'URL courante pour que la vignette retente la miniature
  // si le composant est réutilisé avec une autre photo.
  const [urlEnEchec, setUrlEnEchec] = useState<string | null>(null);
  const src = urlEnEchec === url ? url : urlMiniature(url);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={draggable}
      className={className}
      onError={() => setUrlEnEchec(url)}
    />
  );
}
