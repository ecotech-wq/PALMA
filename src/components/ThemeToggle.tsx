"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

const STORAGE_KEY = "ogc-theme";

function applyTheme(mode: Mode) {
  const root = document.documentElement;
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function readMode(): Mode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readMode());
    setMounted(true);

    // Re-apply on system change if mode === "system"
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (readMode() === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function setAndApply(next: Mode) {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
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
