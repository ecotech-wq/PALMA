"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Frontière d'erreur du groupe (app). Sans elle, une Error levée par une
 * server action ou un rendu (gardes d'espace, requireEspaceCourant...)
 * produisait un crash plein écran ; en production Next masque le message
 * réel. Ici on affiche un écran lisible avec une action de réessai, pensé
 * téléphone d'abord (contenu centré, bouton au pouce).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 gap-4">
      <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
        <AlertTriangle className="text-amber-600 dark:text-amber-400" size={28} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Une action n&apos;a pas pu aboutir
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md">
          {error.message && error.message !== "An error occurred in the Server Components render"
            ? error.message
            : "Réessaie. Si le problème persiste, vérifie l'entreprise sélectionnée ou tes droits sur cet élément."}
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-medium"
      >
        <RotateCcw size={16} />
        Réessayer
      </button>
    </div>
  );
}
