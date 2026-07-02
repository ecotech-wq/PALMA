"use client";

import { Eye, EyeOff } from "lucide-react";
import { useDiscret } from "./DiscretProvider";

/**
 * L'œil de l'en-tête : bascule le mode discret (aussi : touche M).
 * Icône barrée = montants masqués (état sûr, par défaut).
 */
export function DiscretToggle() {
  const { masque, toggle } = useDiscret();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={masque}
      aria-label={
        masque
          ? "Montants masqués : appuyer pour les afficher (touche M)"
          : "Montants visibles : appuyer pour les masquer (touche M)"
      }
      title={masque ? "Montants masqués (M)" : "Montants visibles (M)"}
      className={`p-2 rounded-md transition-colors ${
        masque
          ? "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          : "text-amber-600 dark:text-amber-400 hover:text-amber-700"
      }`}
    >
      {masque ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
