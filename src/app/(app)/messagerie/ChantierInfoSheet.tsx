"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, Settings2, X } from "lucide-react";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { RubriquesPanel, type Rubrique } from "./ChantierRubriques";
import { documentsChantier } from "./chantier-documents";

/**
 * Infos du chantier au téléphone, façon « infos de groupe » WhatsApp :
 * une icône dans l'en-tête ouvre une feuille bas d'écran avec les
 * rubriques (fiches créées par les tags), les documents et la fiche
 * chantier. Sur grand écran, ces contenus vivent dans le rail et le
 * panneau latéraux ; le déclencheur est donc masqué en xl.
 */
export function ChantierInfoSheet({
  chantierId,
  chantierNom,
  rubriques,
  className,
}: {
  chantierId: string;
  chantierNom: string;
  rubriques: Rubrique[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panneau = usePanneauOpaque();

  // Fermeture à Échap ; verrouille le défilement de la page derrière
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

  const documents = documentsChantier(chantierId);
  const aDesFiches = rubriques.some((r) => r.count > 0);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Rubriques et documents du chantier"
        title="Rubriques et documents"
        className="relative inline-flex shrink-0 items-center rounded-md border border-slate-300 px-2 py-1.5 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:py-1"
      >
        <Info size={14} />
        {aDesFiches && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-500"
          />
        )}
      </button>

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
            aria-label={`Rubriques et documents du chantier ${chantierNom}`}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            style={{
              ...panneau,
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {chantierNom}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <RubriquesPanel rubriques={rubriques} />

            <div className="mt-4 flex flex-col gap-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Documents
              </div>
              {documents.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-1 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <d.Icon size={15} className="shrink-0 text-slate-400" />
                  {d.label}
                </Link>
              ))}
            </div>

            <Link
              href={`/chantiers/${chantierId}`}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings2 size={15} className="shrink-0 text-slate-400" />
              Fiche chantier
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
