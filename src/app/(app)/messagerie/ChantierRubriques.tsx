import Link from "next/link";
import { AlertTriangle, CalendarCheck, ClipboardList } from "lucide-react";

/**
 * Rubriques du chantier (v4.2) : incidents ouverts, tâches actives,
 * réserves non levées. C'est la matérialisation du principe des tags :
 * un tag posé sur un message crée la fiche, et les rubriques deviennent
 * des vues de ce qui se dit dans les canaux.
 *
 * Deux rendus : panneau latéral (écrans larges, façon maquette v4) et
 * rangée de pastilles compacte (téléphone). Composants serveur : de purs
 * liens, aucun état.
 */

export type RubriqueFiche = { id: string; titre: string; href: string };

export type Rubrique = {
  key: "incidents" | "taches" | "reserves";
  label: string;
  count: number;
  href: string;
  fiches: RubriqueFiche[];
};

const RUBRIQUE_ICON = {
  incidents: AlertTriangle,
  taches: CalendarCheck,
  reserves: ClipboardList,
} as const;

/** Panneau latéral droit, visible sur écrans larges. */
export function RubriquesPanel({ rubriques }: { rubriques: Rubrique[] }) {
  const vide = rubriques.every((r) => r.count === 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Rubriques du chantier
      </div>
      {vide ? (
        <p className="px-1 text-xs italic text-slate-500 dark:text-slate-400">
          Aucune fiche pour l&apos;instant. Taguez un message pour en créer
          une : la fiche apparaîtra ici, avec le lien vers la conversation.
        </p>
      ) : (
        rubriques.map((r) => {
          const Icon = RUBRIQUE_ICON[r.key];
          return (
            <div key={r.key} className="px-1">
              <Link
                href={r.href}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-400"
              >
                <Icon size={13} className="shrink-0 text-slate-400" />
                <span className="flex-1">{r.label}</span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                  {r.count}
                </span>
              </Link>
              {r.fiches.length > 0 && (
                <ul className="mt-1 space-y-0.5 border-l border-slate-200 dark:border-slate-700 pl-2.5">
                  {r.fiches.map((f) => (
                    <li key={f.id}>
                      <Link
                        href={f.href}
                        className="block truncate text-xs text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400"
                        title={f.titre}
                      >
                        {f.titre}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/** Rangée de pastilles compacte, pour le téléphone. */
export function RubriquesPills({ rubriques }: { rubriques: Rubrique[] }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {rubriques.map((r) => {
        const Icon = RUBRIQUE_ICON[r.key];
        return (
          <Link
            key={r.key}
            href={r.href}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              r.count > 0
                ? "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
            }`}
          >
            <Icon size={11} />
            {r.label}
            <span className="tabular-nums font-medium">{r.count}</span>
          </Link>
        );
      })}
    </div>
  );
}
