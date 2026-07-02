"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Package,
  AlertTriangle,
  Wrench,
  Banknote,
  ShoppingCart,
  Hammer,
} from "lucide-react";

/**
 * Le « + » de l'accueil : un seul bouton, les actions de création se
 * déplient à la demande (feuille bas d'écran au téléphone, menu ancré
 * sur grand écran). Remplace l'ancienne rangée de huit raccourcis, qui
 * dupliquait la navigation et chargeait l'écran. Pointage et messagerie
 * ne figurent plus ici : ils ont leur place dans la barre du bas.
 */
export function QuickActionsBar({
  isAdmin,
  isConducteur,
  isChef,
}: {
  isAdmin: boolean;
  isConducteur: boolean;
  isChef: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);
  void isChef;

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  const canPilot = isAdmin || isConducteur;

  const actions = [
    {
      label: "Signaler un incident",
      sous: "Ouvre une fiche à instruire",
      href: "/incidents/nouveau",
      Icon: AlertTriangle,
      couleur: "text-red-500",
      show: true,
    },
    {
      label: "Demander du matériel",
      sous: "À valider par le conducteur ou l'admin",
      href: "/demandes/nouvelle",
      Icon: Package,
      couleur: "text-blue-500",
      show: true,
    },
    {
      label: "Nouvelle commande",
      sous: "Achat fournisseur pour un chantier",
      href: "/commandes/nouvelle",
      Icon: ShoppingCart,
      couleur: "text-amber-500",
      show: canPilot,
    },
    {
      label: "Nouveau matériel",
      sous: "Entrée dans le parc",
      href: "/materiel/nouveau",
      Icon: Wrench,
      couleur: "text-slate-500",
      show: canPilot,
    },
    {
      label: "Nouveau chantier",
      sous: "Création complète",
      href: "/chantiers/nouveau",
      Icon: Hammer,
      couleur: "text-brand-500",
      show: isAdmin,
    },
    {
      label: "Générer la paie",
      sous: "Depuis les pointages du mois",
      href: "/paie/nouveau",
      Icon: Banknote,
      couleur: "text-emerald-600",
      show: isAdmin,
    },
  ].filter((a) => a.show);

  return (
    <div ref={conteneurRef} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Créer (incident, demande, commande...)"
        title="Créer"
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          ouvert
            ? "bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
            : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        <Plus size={20} className={`transition-transform ${ouvert ? "rotate-45" : ""}`} />
      </button>

      {ouvert && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOuvert(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/25 sm:hidden"
          />
          <div
            role="menu"
            className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:z-30 sm:mt-2 sm:w-72 sm:rounded-md sm:p-1 sm:shadow-lg"
            style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
          >
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Créer
            </div>
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                role="menuitem"
                onClick={() => setOuvert(false)}
                className="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 sm:py-1.5"
              >
                <a.Icon size={15} className={`mt-0.5 shrink-0 ${a.couleur}`} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                    {a.label}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {a.sous}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
