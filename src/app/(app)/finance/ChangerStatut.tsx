"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

// ─── Changement de statut en un geste ────────────────────────────────────────
// Un <select> natif (excellent picker au téléphone, aucune action au survol) qui
// appelle une server action (id, valeur). Horodatage et trace côté serveur.

export function ChangerStatut({
  id,
  valeur,
  options,
  action,
  demanderMotifSur,
  ariaLabel = "Changer le statut",
}: {
  id: string;
  valeur: string;
  options: { value: string; label: string }[];
  action: (id: string, statut: string, motif?: string) => Promise<void>;
  /** Statut(s) pour lesquels on demande un motif (refus, opposition). */
  demanderMotifSur?: string[];
  ariaLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <select
      aria-label={ariaLabel}
      value={valeur}
      disabled={pending}
      onChange={(e) => {
        const cible = e.target.value;
        if (cible === valeur) return;
        let motif: string | undefined;
        if (demanderMotifSur?.includes(cible)) {
          motif = window.prompt("Motif (facultatif) :") ?? undefined;
        }
        startTransition(async () => {
          try {
            await action(id, cible, motif);
            toast.success("Statut mis à jour");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        });
      }}
      className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
