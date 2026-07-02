"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Mode discret (v4.3) : masque tous les montants de l'application
 * (composant Montant) tant que l'utilisateur ne les révèle pas.
 * Pensé pour l'écran partagé en visio, la projection en réunion de
 * planning et les regards par-dessus l'épaule sur le terrain.
 *
 * L'état vit dans un cookie (`discret`) lu côté serveur au premier
 * rendu : pas d'éclair de montants visibles avant hydratation. Par
 * défaut (cookie absent) les montants sont MASQUÉS : c'est le réglage
 * sûr. Bascule : l'œil dans l'en-tête ou la touche M (hors saisie).
 */

const DiscretContext = createContext<{
  masque: boolean;
  toggle: () => void;
}>({ masque: true, toggle: () => {} });

export function useDiscret() {
  return useContext(DiscretContext);
}

export function DiscretProvider({
  initial,
  children,
}: {
  /** État lu du cookie côté serveur ("1" masqué, "0" visible, absent = masqué). */
  initial: boolean;
  children: React.ReactNode;
}) {
  const [masque, setMasque] = useState(initial);

  const toggle = useCallback(() => {
    setMasque((v) => {
      const next = !v;
      document.cookie = `discret=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Touche M : bascule rapide pendant une visio, sauf en cours de saisie
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "m" && e.key !== "M") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      toggle();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [toggle]);

  return (
    <DiscretContext.Provider value={{ masque, toggle }}>
      {children}
    </DiscretContext.Provider>
  );
}
