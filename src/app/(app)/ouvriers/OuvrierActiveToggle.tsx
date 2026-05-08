"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { toggleOuvrierActif } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Petit interrupteur (switch) pour basculer actif / inactif sans recharger
 * la page ni passer par le formulaire complet. Mise à jour optimiste : la
 * UI bascule immédiatement, puis la server action confirme.
 */
export function OuvrierActiveToggle({
  ouvrierId,
  actif: initialActif,
  size = "md",
  showLabel = false,
}: {
  ouvrierId: string;
  actif: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const [actif, setActif] = useState(initialActif);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const optimistic = !actif;
    setActif(optimistic);
    startTransition(async () => {
      try {
        const final = await toggleOuvrierActif(ouvrierId);
        setActif(final);
        toast.success(final ? "Ouvrier activé" : "Ouvrier désactivé");
        router.refresh();
      } catch (err) {
        // Rollback en cas d'erreur
        setActif(!optimistic);
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  const dims =
    size === "sm"
      ? "w-8 h-4 [&>span]:w-3 [&>span]:h-3"
      : "w-10 h-5 [&>span]:w-4 [&>span]:h-4";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-2",
        showLabel && "select-none"
      )}
    >
      {showLabel && (
        <span
          className={cn(
            "text-xs",
            actif
              ? "text-slate-700 dark:text-slate-300"
              : "text-slate-400 dark:text-slate-500"
          )}
        >
          {actif ? "Actif" : "Inactif"}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title={actif ? "Désactiver l'ouvrier" : "Activer l'ouvrier"}
        aria-label={actif ? "Désactiver l'ouvrier" : "Activer l'ouvrier"}
        aria-pressed={actif}
        className={cn(
          "relative inline-flex items-center rounded-full transition-colors duration-200 shrink-0",
          dims,
          actif
            ? "bg-green-500 hover:bg-green-600"
            : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600",
          pending && "opacity-70 cursor-wait"
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full bg-white dark:bg-slate-100 shadow-sm transform transition-transform duration-200 ml-0.5",
            actif &&
              (size === "sm" ? "translate-x-4" : "translate-x-5")
          )}
        />
      </button>
    </div>
  );
}
