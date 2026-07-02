import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets par liens (état porté par l'URL, ?onglet=...).
 * Composant serveur : aucun état client, le rechargement et le partage
 * d'URL tombent sur le bon onglet. Défilement horizontal au téléphone.
 */
export function Onglets({
  items,
  actif,
}: {
  items: { id: string; label: string; href: string }[];
  actif: string;
}) {
  return (
    <nav
      aria-label="Sections"
      className="mb-4 flex items-end gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 -mx-1 px-1"
    >
      {items.map((t) => {
        const estActif = t.id === actif;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={estActif ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              estActif
                ? "border-brand-500 bg-brand-500/10 font-medium text-brand-700 dark:text-brand-300"
                : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
