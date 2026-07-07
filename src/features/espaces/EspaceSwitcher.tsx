"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { changerEspace } from "./server/espace-actions";
import { TOUS_ESPACES } from "@/lib/espaces-client";

type EspaceOption = { id: string; nom: string };

// ─── Sélecteur d'entreprise (façon Odoo) ────────────────────────────────────
// Rendu seulement quand l'utilisateur appartient à plus d'un espace : à un
// seul espace, le contexte est implicite et l'interface reste inchangée.

export function EspaceSwitcher({
  espaces,
  courantId,
}: {
  espaces: EspaceOption[];
  courantId: string | null; // null = mode « tous »
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (espaces.length <= 1) return null;

  return (
    <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
      <Building2 size={15} className="shrink-0 opacity-70" />
      <select
        aria-label="Espace (entreprise)"
        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
        value={courantId ?? TOUS_ESPACES}
        disabled={pending}
        onChange={(e) => {
          const cible = e.target.value;
          startTransition(async () => {
            await changerEspace(cible);
            router.refresh();
          });
        }}
      >
        {espaces.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nom}
          </option>
        ))}
        <option value={TOUS_ESPACES}>Tous les espaces</option>
      </select>
    </label>
  );
}
