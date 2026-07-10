"use client";

import { useTransition } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { changerEspace } from "./server/espace-actions";
import { TOUS_ESPACES } from "@/lib/espaces-client";

type EspaceOption = { id: string; nom: string; couleur?: string | null };

// ─── Sélecteur d'entreprise, variante feuille bas d'écran ──────────────────
// LYNX vit sur téléphone : le changement d'espace se fait dans le tiroir
// « Plus » (bottom sheet), en lignes larges au pouce, jamais au survol.
// Rendu seulement quand l'utilisateur appartient à plus d'un espace.

export function EspaceSwitcherMobile({
  espaces,
  courantId,
  onDone,
}: {
  espaces: EspaceOption[];
  courantId: string | null; // null = mode « tous »
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (espaces.length <= 1) return null;

  const options: EspaceOption[] = [
    ...espaces,
    { id: TOUS_ESPACES, nom: "Tous les espaces" },
  ];
  const actifId = courantId ?? TOUS_ESPACES;

  return (
    <div className="mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
      <div className="mt-1 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Entreprise
      </div>
      {options.map((e) => {
        const actif = actifId === e.id;
        const tous = e.id === TOUS_ESPACES;
        const initiale = e.nom.trim().charAt(0).toUpperCase() || "?";
        return (
          <button
            key={e.id}
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                // changerEspace fait revalidatePath("/", "layout") : la
                // réponse de l'action contient déjà l'arbre RSC frais, pas
                // besoin d'un router.refresh() (2e aller-retour, réseau
                // chantier oblige).
                await changerEspace(e.id);
                onDone?.();
              });
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition disabled:opacity-60",
              // Ligne active : fond neutre + le losange ambre en marqueur
              // (charte : l'ambre est le signal « espace actif », pas un aplat).
              actif
                ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            {tous ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                <Building2 size={16} />
              </span>
            ) : (
              // Avatar coloré à la couleur d'accent de l'entreprise.
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: e.couleur ?? "#6e6a63" }}
              >
                {initiale}
              </span>
            )}
            <span className="flex-1 text-left truncate">{e.nom}</span>
            {actif && (
              <span
                className="h-2.5 w-2.5 rotate-45 bg-brand-500"
                aria-label="active"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
