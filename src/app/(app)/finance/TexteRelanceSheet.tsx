"use client";

import { useEffect, useState } from "react";
import { Copy, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";

/**
 * Texte de relance prêt à copier, dans une feuille bas d'écran (mobile
 * d'abord ; centrée et bornée en largeur au-delà). Le texte est généré côté
 * serveur par la fonction pure genererTexteRelanceFacture (testée) : ici on
 * ne fait qu'afficher et copier. RIEN ne part vers le client depuis LYNX :
 * l'utilisateur colle le texte dans son propre courriel ou courrier.
 */
export function TexteRelanceSheet({
  titre,
  texte,
}: {
  titre: string;
  texte: string;
}) {
  const [open, setOpen] = useState(false);
  const panneau = usePanneauOpaque();
  const toast = useToast();

  // Fermeture à Échap ; verrouille le défilement de la page derrière.
  useEffect(() => {
    if (!open) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", surTouche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      toast.success("Texte de relance copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte manuellement");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <FileText size={14} />
        Texte de relance
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/30"
          />
          <div
            role="dialog"
            aria-label={`Texte de relance : ${titre}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-slate-200 p-4 shadow-2xl dark:border-slate-800 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-t-xl"
            style={{
              ...panneau,
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {titre}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              À coller dans votre courriel ou votre courrier. Rien n'est envoyé
              au client depuis LYNX.
            </p>

            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {texte}
            </pre>

            <Button type="button" size="lg" className="mt-3 w-full" onClick={copier}>
              <Copy size={16} />
              Copier le texte
            </Button>
          </div>
        </>
      )}
    </>
  );
}
