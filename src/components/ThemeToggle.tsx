"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

const MODE_KEY = "ogc-theme-mode"; // localStorage : "light" / "dark" / "system"
const EFFECTIVE_COOKIE = "ogc-theme"; // cookie : "light" / "dark" (lu par le serveur)

/** Calcule la valeur effective ("dark" ou "light") d'un mode donné. */
function computeEffective(mode: Mode): "dark" | "light" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  // system : suit la préférence OS
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Applique la classe `dark` sur <html> et écrit le cookie EFFECTIVE
 *  pour que le serveur fasse le bon SSR au prochain chargement. */
function applyAndPersist(mode: Mode) {
  const effective = computeEffective(mode);
  document.documentElement.classList.toggle("dark", effective === "dark");
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {}
  // Cookie 1 an, path=/, SameSite=Lax — lu par RootLayout côté serveur
  document.cookie = `${EFFECTIVE_COOKIE}=${effective}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
}

function readMode(): Mode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = readMode();
    setMode(current);
    setMounted(true);
    // Sync le DOM + le cookie avec le mode courant (utile au premier
    // chargement quand on était en "system" et que la pref OS a changé,
    // ou pour réparer un éventuel mismatch SSR/client).
    applyAndPersist(current);

    // Re-applique quand l'OS change (mode "system" uniquement)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (readMode() === "system") applyAndPersist("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function setAndApply(next: Mode) {
    setMode(next);
    applyAndPersist(next);
  }

  if (!mounted) {
    return (
      <div
        className={cn(
          "inline-flex border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden",
          compact ? "text-xs" : "text-sm"
        )}
        aria-hidden
      >
        <span className={compact ? "p-1.5" : "p-2"} />
      </div>
    );
  }

  const options: { value: Mode; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Clair" },
    { value: "system", icon: Monitor, label: "Auto" },
    { value: "dark", icon: Moon, label: "Sombre" },
  ];

  return (
    <div
      className={cn(
        "inline-flex border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden",
        compact ? "text-xs" : "text-sm"
      )}
      role="group"
      aria-label="Thème"
    >
      {options.map(({ value, icon: Icon, label }, i) => (
        <button
          key={value}
          type="button"
          onClick={() => setAndApply(value)}
          className={cn(
            "flex items-center gap-1.5 transition-colors",
            compact ? "p-1.5" : "px-2.5 py-1.5",
            i > 0 && "border-l border-slate-300 dark:border-slate-700",
            mode === value
              ? "bg-brand-500 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          )}
          title={label}
          aria-label={label}
          aria-pressed={mode === value}
        >
          <Icon size={compact ? 13 : 14} />
          {!compact && <span className="hidden lg:inline">{label}</span>}
        </button>
      ))}
    </div>
  );
}
