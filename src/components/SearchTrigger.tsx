"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * Bouton qui ouvre la command palette via un keystroke synthétique.
 * (La palette écoute Ctrl/Cmd+K, on triggere donc l'événement clavier.)
 * Affiche le raccourci pour découvrabilité.
 */
export function SearchTrigger({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "topbar";
}) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  function open() {
    // Dispatch synthétique d'un Ctrl/Cmd+K que CommandPalette écoute
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
      })
    );
  }

  if (variant === "topbar") {
    return (
      <button
        type="button"
        onClick={open}
        title="Rechercher (Ctrl+K)"
        aria-label="Rechercher"
        className="text-slate-500 dark:text-slate-400 p-2 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <Search size={18} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="w-full inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
      title="Rechercher dans toute l'app"
    >
      <Search size={13} />
      <span className="flex-1 text-left">Rechercher…</span>
      <kbd className="text-[10px] border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 font-sans">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
