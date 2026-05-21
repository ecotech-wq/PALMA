"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Hammer,
  Users,
  Wrench,
  AlertTriangle,
  Package,
  ShoppingCart,
  MessageSquare,
  Loader2,
  CornerDownLeft,
  Plus,
  ClipboardList,
} from "lucide-react";

/* -------------------------------------------------------------------------
 *  Command Palette (Ctrl/Cmd + K)
 *
 *   - Recherche globale (chantiers, ouvriers, matériel, incidents,
 *     demandes, commandes, messages) via /api/search
 *   - Actions rapides en tête (Nouveau chantier, Pointage, etc.)
 *   - Navigation clavier ↑ ↓ Enter
 *   - Fermeture par ESC / clic fond / sélection
 * ----------------------------------------------------------------------- */

type SearchResult = {
  id: string;
  group:
    | "chantier"
    | "ouvrier"
    | "materiel"
    | "incident"
    | "demande"
    | "commande"
    | "message";
  title: string;
  subtitle?: string | null;
  href: string;
};

const GROUP_META: Record<
  string,
  { label: string; Icon: typeof Hammer; order: number }
> = {
  chantier: { label: "Chantiers", Icon: Hammer, order: 1 },
  ouvrier: { label: "Ouvriers", Icon: Users, order: 2 },
  materiel: { label: "Matériel", Icon: Wrench, order: 3 },
  incident: { label: "Incidents", Icon: AlertTriangle, order: 4 },
  demande: { label: "Demandes", Icon: Package, order: 5 },
  commande: { label: "Commandes", Icon: ShoppingCart, order: 6 },
  message: { label: "Messages", Icon: MessageSquare, order: 7 },
};

type QuickAction = { label: string; href: string; Icon: typeof Hammer };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Nouveau chantier", href: "/chantiers/nouveau", Icon: Plus },
  { label: "Faire un pointage", href: "/pointage", Icon: ClipboardList },
  { label: "Nouvelle demande matériel", href: "/demandes/nouvelle", Icon: Package },
  { label: "Nouveau matériel", href: "/materiel/nouveau", Icon: Wrench },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci global Ctrl/Cmd + K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Reset quand on ferme
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setActive(0);
    } else {
      // focus l'input après l'ouverture (next tick)
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Recherche debounced
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = (await res.json()) as { results: SearchResult[] };
          // Trie par groupe puis par ordre d'arrivée
          const sorted = [...data.results].sort(
            (a, b) =>
              (GROUP_META[a.group]?.order ?? 99) -
              (GROUP_META[b.group]?.order ?? 99)
          );
          setResults(sorted);
          setActive(0);
        }
      } catch {
        // silencieux
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [query, open]);

  // Items combinés : actions rapides en mode "vide", sinon résultats
  const items: { kind: "action" | "result"; data: QuickAction | SearchResult }[] =
    query.trim().length < 2
      ? QUICK_ACTIONS.map((a) => ({ kind: "action", data: a }))
      : results.map((r) => ({ kind: "result", data: r }));

  // Navigation clavier
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[active];
        if (it) {
          const href = (it.data as { href: string }).href;
          router.push(href);
          setOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, items, active, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-3"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          {loading ? (
            <Loader2 size={16} className="animate-spin text-slate-400" />
          ) : (
            <Search size={16} className="text-slate-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher chantier, ouvrier, matériel, incident…"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Liste */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 && query.trim().length >= 2 && !loading && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-6 italic">
              Aucun résultat
            </p>
          )}

          {items.length === 0 && query.trim().length < 2 && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-6 italic">
              Tape au moins 2 caractères pour rechercher…
            </p>
          )}

          {query.trim().length < 2 && items.length > 0 && (
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
              Actions rapides
            </div>
          )}

          {items.map((it, idx) => {
            const isActive = idx === active;
            if (it.kind === "action") {
              const a = it.data as QuickAction;
              return (
                <button
                  key={`a-${a.href}`}
                  type="button"
                  onClick={() => {
                    router.push(a.href);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                    isActive
                      ? "bg-brand-50 dark:bg-brand-950/40"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <a.Icon size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                  <span className="flex-1 text-sm text-slate-900 dark:text-slate-100 truncate">
                    {a.label}
                  </span>
                  {isActive && (
                    <CornerDownLeft size={12} className="text-slate-400" />
                  )}
                </button>
              );
            }
            const r = it.data as SearchResult;
            const meta = GROUP_META[r.group];
            const prev = idx > 0 ? items[idx - 1] : null;
            const showHeader =
              !prev ||
              (prev.kind === "result" &&
                (prev.data as SearchResult).group !== r.group);
            return (
              <div key={`r-${r.group}-${r.id}`}>
                {showHeader && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mt-1">
                    {meta.label}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    router.push(r.href);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                    isActive
                      ? "bg-brand-50 dark:bg-brand-950/40"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <meta.Icon size={14} className="text-slate-500 dark:text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-900 dark:text-slate-100 truncate">
                      {highlight(r.title, query)}
                    </div>
                    {r.subtitle && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {r.subtitle}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <CornerDownLeft size={12} className="text-slate-400" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">↑↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">↵</kbd>
            ouvrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">ESC</kbd>
            fermer
          </span>
        </div>
      </div>
    </div>
  );
}

/** Surligne les occurrences de `q` dans `text`. */
function highlight(text: string, q: string) {
  if (!q || q.length < 2) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/40 text-inherit rounded px-0.5">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}
