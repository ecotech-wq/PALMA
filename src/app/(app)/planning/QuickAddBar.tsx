"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, HelpCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { parseQuickAdd, fuzzyMatch } from "@/lib/quick-add-parser";
import { quickAddTache } from "./actions";

type ChantierLite = { id: string; nom: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

const PRIO_COLORS: Record<number, string> = {
  1: "text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
  2: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900",
  3: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
  4: "text-slate-600 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
};

/**
 * Saisie rapide style Todoist :
 *   "Couler dalle B #residence-jardin demain p1 +urgent x3j"
 * Affiche un aperçu en temps réel des tokens reconnus avant validation.
 */
export function QuickAddBar({
  chantiers,
  defaultChantierId,
}: {
  chantiers: ChantierLite[];
  defaultChantierId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [showHelp, setShowHelp] = useState(false);

  // Parsing live (sans appeler l'action)
  const tokens = useMemo(() => parseQuickAdd(input), [input]);
  const matchedChantier = useMemo(
    () =>
      tokens.chantierMatch
        ? fuzzyMatch(chantiers, tokens.chantierMatch)
        : null,
    [tokens.chantierMatch, chantiers]
  );

  // Raccourci clavier "Q" pour focus la barre
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        e.key === "q" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function submit() {
    if (!input.trim()) return;
    startTransition(async () => {
      try {
        await quickAddTache(input, defaultChantierId);
        toast.success("Tâche ajoutée");
        setInput("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const hasActiveTokens =
    tokens.priorite !== 4 ||
    !!tokens.chantierMatch ||
    !!tokens.equipeMatch ||
    tokens.labels.length > 0 ||
    !!tokens.dateDebut;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Sparkles
          size={16}
          className="text-brand-600 dark:text-brand-400 shrink-0"
        />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setInput("");
              inputRef.current?.blur();
            }
          }}
          placeholder="Ajouter une tâche…  ex : Couler dalle B  #residence-jardin demain p1 x3j"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
          aria-label="Aide syntaxe"
          title="Aide syntaxe"
        >
          <HelpCircle size={14} />
        </button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={pending || !input.trim()}
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <>
              <Plus size={14} /> Ajouter
            </>
          )}
        </Button>
      </div>

      {/* Aperçu des tokens reconnus */}
      {input.trim() && hasActiveTokens && (
        <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5 text-[11px] border-t border-slate-100 dark:border-slate-800 pt-1.5">
          <span className="text-slate-500 dark:text-slate-400">Aperçu :</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300">
            {tokens.nom || "(nom vide)"}
          </span>
          {tokens.chantierMatch && (
            <span
              className={`px-1.5 py-0.5 rounded border ${
                matchedChantier
                  ? "bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-300"
                  : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
              }`}
            >
              # {matchedChantier ? matchedChantier.nom : `${tokens.chantierMatch} ?`}
            </span>
          )}
          {tokens.equipeMatch && (
            <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-300">
              @ {tokens.equipeMatch}
            </span>
          )}
          {tokens.priorite !== 4 && (
            <span
              className={`px-1.5 py-0.5 rounded border font-semibold ${PRIO_COLORS[tokens.priorite]}`}
            >
              P{tokens.priorite}
            </span>
          )}
          {tokens.labels.map((l) => (
            <span
              key={l}
              className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300"
            >
              + {l}
            </span>
          ))}
          {tokens.dateDebut && (
            <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300">
              📅 {dateFmt.format(tokens.dateDebut)}
              {tokens.dateFin &&
                tokens.dateFin.getTime() !== tokens.dateDebut.getTime() && (
                  <> → {dateFmt.format(tokens.dateFin)}</>
                )}
            </span>
          )}
        </div>
      )}

      {/* Aide syntaxe */}
      {showHelp && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
          <div>
            <code className="text-brand-700 dark:text-brand-400">
              #chantier
            </code>{" "}
            — affecte au chantier
          </div>
          <div>
            <code className="text-purple-700 dark:text-purple-400">
              @equipe
            </code>{" "}
            — affecte à une équipe
          </div>
          <div>
            <code className="text-amber-700 dark:text-amber-400">+label</code>{" "}
            — ajoute un label (créé si inconnu)
          </div>
          <div>
            <code className="text-red-700 dark:text-red-400">p1</code>{" "}
            <code>p2</code> <code>p3</code> <code>p4</code> — priorité
          </div>
          <div>
            <code>aujourd&apos;hui</code> · <code>demain</code> ·{" "}
            <code>vendredi</code> · <code>15/06</code> — date de début
          </div>
          <div>
            <code>x3j</code> ou <code>(3 jours)</code> — durée en jours
          </div>
          <div className="sm:col-span-2 pt-1 italic">
            Astuce : appuyer sur <kbd className="px-1 rounded border">q</kbd>{" "}
            pour focus la barre depuis n&apos;importe où.
          </div>
        </div>
      )}
    </div>
  );
}
