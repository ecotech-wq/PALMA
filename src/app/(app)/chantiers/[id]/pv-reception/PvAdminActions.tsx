"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { supprimerPv, reinitialiserPv } from "./actions";

/**
 * Boutons admin :
 * - Réinitialiser : repasse le PV en brouillon (efface signatures)
 * - Supprimer : supprime entièrement le PV (avec confirmation)
 */
export function PvAdminActions({
  chantierId,
  canReset,
}: {
  chantierId: string;
  canReset: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleReset() {
    if (
      !confirm(
        "Réinitialiser le PV en brouillon ? Toutes les signatures seront effacées (les réserves et photos sont conservées)."
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await reinitialiserPv(chantierId);
        toast.success("PV réinitialisé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Supprimer définitivement ce PV ? Toutes les réserves, photos et plans associés seront perdus."
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await supprimerPv(chantierId);
        toast.success("PV supprimé");
        // supprimerPv redirige déjà vers la fiche chantier, mais on rafraîchit
        // par sécurité.
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canReset && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={handleReset}
        >
          <Undo2 size={14} />
          <span className="hidden sm:inline">Revenir en brouillon</span>
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 size={14} />
        <span className="hidden sm:inline">Supprimer le PV</span>
      </Button>
    </div>
  );
}
