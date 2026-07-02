"use client";

import { useEffect, useRef, useState } from "react";
import { useDiscret } from "./DiscretProvider";

/**
 * Affiche une valeur monétaire soumise au mode discret. Masquée : la
 * valeur est floutée, non sélectionnable, retirée de l'accessibilité
 * (un lecteur d'écran ne la lit pas non plus). Un appui la révèle
 * 2,5 secondes, pour vérifier un chiffre sans tout dévoiler.
 *
 * Usage : <Montant>{formatEuro(total)}</Montant>
 */
export function Montant({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { masque } = useDiscret();
  const [devoile, setDevoile] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const cache = masque && !devoile;

  function peek() {
    if (!masque) return;
    setDevoile(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDevoile(false), 2500);
  }

  return (
    <span
      onClick={peek}
      aria-hidden={cache || undefined}
      title={cache ? "Montant masqué (mode discret) : appuyer pour révéler" : undefined}
      className={`${className} ${
        cache
          ? "cursor-pointer select-none rounded blur-[7px] transition-[filter]"
          : masque
            ? "cursor-pointer transition-[filter]"
            : ""
      }`}
    >
      {children}
    </span>
  );
}
