"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { useToast } from "@/components/Toast";
import { toggleChantierPin } from "./actions";

/**
 * Petit bouton "épingler" intégré dans la ligne du hub. Stoppe la
 * propagation pour ne pas suivre le lien parent.
 */
export function PinChantierButton({
  chantierId,
  pinned,
}: {
  chantierId: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        const next = await toggleChantierPin(chantierId);
        toast.success(next ? "Chantier épinglé" : "Épingle retirée");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={pinned ? "Désépingler" : "Épingler en tête"}
      aria-label={pinned ? "Désépingler" : "Épingler"}
      className={`shrink-0 p-1.5 rounded-full transition ${
        pinned
          ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          : "text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      } ${pending ? "opacity-50" : ""}`}
    >
      {pinned ? <Pin size={14} className="fill-current" /> : <PinOff size={14} />}
    </button>
  );
}
