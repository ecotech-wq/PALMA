"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";

/**
 * Bouton de soumission protégé par une confirmation. À placer DANS un
 * <form action={...}> : le clic ouvre une boîte de confirmation (panneau
 * opaque, utilisable au pouce) ; « Confirmer » soumet réellement le
 * formulaire. Créé après l'audit UX 2026-07-03 : trois actions
 * destructives (supprimer un chantier, retirer une équipe, supprimer un
 * paiement) partaient sans aucune confirmation.
 */
export function BoutonConfirmation({
  message,
  titre = "Confirmer",
  libelleConfirmer = "Confirmer",
  variant = "danger",
  size = "sm",
  children,
}: {
  message: string;
  titre?: string;
  libelleConfirmer?: string;
  variant?: "danger" | "outline" | "primary";
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const panneau = usePanneauOpaque();

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOuvert(true)}
      >
        {children}
      </Button>

      {ouvert && (
        <>
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => setOuvert(false)}
            className="fixed inset-0 z-50 cursor-default bg-black/40"
          />
          <div
            role="alertdialog"
            aria-label={titre}
            className="fixed inset-x-4 top-1/3 z-50 mx-auto max-w-sm rounded-xl border border-slate-200 p-4 shadow-2xl dark:border-slate-700"
            style={panneau}
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {titre}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {message}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOuvert(false)}
              >
                Annuler
              </Button>
              {/* type=submit : soumet le <form action={...}> englobant */}
              <Button type="submit" variant="danger" size="sm">
                {libelleConfirmer}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
