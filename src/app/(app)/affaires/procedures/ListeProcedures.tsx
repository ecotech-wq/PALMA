"use client";

// ─── Liste des procédures de l'entreprise (réordonnable) ────────────────────
// Chaque ligne mène à la page de détail (étapes, checklist, couleur...).
// Monter / descendre en boutons 44 px (jamais d'action au survol seul :
// l'app vit sur téléphone), avec le motif optimiste anti-flash du dépôt :
// l'ordre local s'applique tout de suite, rollback + toast en cas d'échec,
// et l'override s'efface quand les props rafraîchies l'ont rattrapé.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useToast } from "@/components/Toast";
import { accentPipeline } from "@/lib/pipelines";
import { reordonnerPipeline } from "./actions";

export type ProcedureLigne = {
  id: string;
  libelle: string;
  couleur: string;
  actif: boolean;
  nbEtapes: number;
  nbEnCours: number;
  nbTotal: number;
};

function memesIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function ListeProcedures({
  procedures,
}: {
  procedures: ProcedureLigne[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  // Override optimiste de l'ordre (anti-flash) : appliqué immédiatement,
  // effacé quand le serveur a confirmé et que les props ont suivi.
  const [ordreLocal, setOrdreLocal] = useState<string[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const idsProps = procedures.map((p) => p.id);
  useEffect(() => {
    setOrdreLocal((prev) =>
      prev && memesIds(prev, procedures.map((p) => p.id)) ? null : prev
    );
  }, [procedures]);

  const parId = new Map(procedures.map((p) => [p.id, p]));
  const ordonnee = (ordreLocal ?? idsProps)
    .map((id) => parId.get(id))
    .filter((p): p is ProcedureLigne => p !== undefined);

  function deplacer(id: string, sens: "monter" | "descendre") {
    const ids = [...(ordreLocal ?? idsProps)];
    const i = ids.indexOf(id);
    const j = sens === "monter" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrdreLocal(ids);
    setPendingId(id);
    startTransition(async () => {
      try {
        await reordonnerPipeline(id, sens);
        router.refresh();
      } catch (err) {
        setOrdreLocal(null);
        toast.error(err instanceof Error ? err.message : "Erreur");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (ordonnee.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Aucune procédure : créez la première.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {ordonnee.map((p, i) => {
        const accent = accentPipeline(p.couleur);
        return (
          <li key={p.id} className="flex items-center gap-1 pr-2">
            <Link
              href={`/affaires/procedures/${p.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full ${accent.pastille}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${
                      p.actif
                        ? "text-slate-900 dark:text-slate-100"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {p.libelle}
                  </span>
                  {!p.actif && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Inactive
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {p.nbEnCours} affaire{p.nbEnCours > 1 ? "s" : ""} en cours
                  {" · "}
                  {p.nbEtapes} étape{p.nbEtapes > 1 ? "s" : ""}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-slate-300 dark:text-slate-600"
              />
            </Link>
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => deplacer(p.id, "monter")}
                disabled={i === 0 || pendingId !== null}
                aria-label={`Monter ${p.libelle}`}
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronUp size={17} />
              </button>
              <button
                type="button"
                onClick={() => deplacer(p.id, "descendre")}
                disabled={i === ordonnee.length - 1 || pendingId !== null}
                aria-label={`Descendre ${p.libelle}`}
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronDown size={17} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
