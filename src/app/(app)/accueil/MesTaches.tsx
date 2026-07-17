"use client";

// ─── Mes tâches (accueil « Ma journée ») ─────────────────────────────────────
// Liste compacte des tâches du jour : en retard d'abord (terracotta), puis
// aujourd'hui, puis les 7 prochains jours. Case à cocher rapide : le geste
// appelle toggleComplete (planning) avec un rendu optimiste, puis rafraîchit
// la route ; l'état de vérité reste côté serveur.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { toggleComplete } from "@/app/(app)/planning/actions";

export type TacheJournee = {
  id: string;
  nom: string;
  groupe: "retard" | "aujourdhui" | "semaine";
  /** Libellé d'échéance déjà formaté côté serveur (fuseau maîtrisé). */
  echeance: string;
  /** Chantier ou affaire d'origine (null pour une tâche perso pure). */
  contexte: string | null;
  contexteHref: string | null;
};

const GROUPES: {
  cle: TacheJournee["groupe"];
  titre: string;
  /** Terracotta pour le retard : c'est le seul groupe qui crie. */
  classeTitre: string;
}[] = [
  {
    cle: "retard",
    titre: "En retard",
    classeTitre: "text-red-700 dark:text-red-400",
  },
  {
    cle: "aujourdhui",
    titre: "Aujourd'hui",
    classeTitre: "text-slate-700 dark:text-slate-300",
  },
  {
    cle: "semaine",
    titre: "7 prochains jours",
    classeTitre: "text-slate-500 dark:text-slate-400",
  },
];

export function MesTaches({ taches }: { taches: TacheJournee[] }) {
  const [, startTransition] = useTransition();
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  if (taches.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Rien d&apos;urgent : aucune tâche en retard ni planifiée sur les 7
        prochains jours.
      </p>
    );
  }

  function cocher(id: string) {
    setEnCours(id);
    // Rendu optimiste : la ligne se barre tout de suite ; en cas d'échec
    // on la rétablit et on explique.
    setFaites((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await toggleComplete(id);
        router.refresh();
      } catch (err) {
        setFaites((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error(err instanceof Error ? err.message : "Erreur");
      } finally {
        setEnCours(null);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {GROUPES.map(({ cle, titre, classeTitre }) => {
        const groupe = taches.filter((t) => t.groupe === cle);
        if (groupe.length === 0) return null;
        return (
          <div key={cle}>
            <div
              className={`border-b border-slate-100 bg-slate-50/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider dark:border-slate-800 dark:bg-slate-800/40 ${classeTitre}`}
            >
              {titre} ({groupe.length})
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupe.map((t) => {
                const faite = faites.has(t.id);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={faite}
                      disabled={enCours === t.id}
                      onChange={() => cocher(t.id)}
                      aria-label={`Terminer : ${t.nom}`}
                      className="h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-200"
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          faite
                            ? "text-slate-400 line-through"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {t.nom}
                      </span>
                      {t.contexte && (
                        <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                          {t.contexteHref ? (
                            <Link
                              href={t.contexteHref}
                              className="underline-offset-2 hover:underline"
                            >
                              {t.contexte}
                            </Link>
                          ) : (
                            t.contexte
                          )}
                        </span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[11px] ${
                        cle === "retard"
                          ? "font-medium text-red-700 dark:text-red-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {t.echeance}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
