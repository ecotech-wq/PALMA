"use client";

// ─── Bouton « + Nouveau » du hub messagerie ──────────────────────────────────
// Un seul point d'entrée pour créer depuis le hub : une feuille bas d'écran
// propose « Affaire » (prospect, devis : la carte du pipeline et son fil)
// ou « Chantier » (marché gagné : le flux /chantiers/nouveau existant).
// Gating identique au reste de l'application : la création d'affaire est
// ouverte aux pilotes (ADMIN + CONDUCTEUR), celle d'un chantier à l'admin
// global dans un espace courant. Seuls les choix permis s'affichent ; sans
// aucun droit, le bouton n'apparaît pas.

import { useState } from "react";
import Link from "next/link";
import { Hammer, Handshake, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { NouvelleAffaireFeuille } from "../affaires/NouvelleAffaire";

export function NouveauBouton({
  peutCreerAffaire,
  peutCreerChantier,
}: {
  peutCreerAffaire: boolean;
  peutCreerChantier: boolean;
}) {
  const [feuille, setFeuille] = useState<"menu" | "affaire" | null>(null);
  const fondOpaque = usePanneauOpaque();

  if (!peutCreerAffaire && !peutCreerChantier) return null;

  return (
    <>
      <Button size="sm" onClick={() => setFeuille("menu")}>
        <Plus size={15} />
        Nouveau
      </Button>

      {feuille === "menu" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFeuille(null);
          }}
        >
          <div
            style={fondOpaque}
            className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Créer
              </h2>
              <button
                type="button"
                onClick={() => setFeuille(null)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {peutCreerAffaire && (
                <button
                  type="button"
                  onClick={() => setFeuille("affaire")}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
                    <Handshake size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Affaire
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Prospect, devis : la carte du pipeline et son fil de
                      discussion
                    </span>
                  </span>
                </button>
              )}
              {peutCreerChantier && (
                <Link
                  href="/chantiers/nouveau"
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                    <Hammer size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Chantier
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Marché gagné : équipes, planning, budget et fil de
                      chantier
                    </span>
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {feuille === "affaire" && (
        <NouvelleAffaireFeuille
          typologieInitiale="PERMIS_CONSTRUIRE"
          responsables={[]}
          compact
          versCanal
          onClose={() => setFeuille(null)}
        />
      )}
    </>
  );
}
