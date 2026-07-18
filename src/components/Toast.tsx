"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Check, AlertCircle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";
/** Lien d'action optionnel sous le message (ex. « Ouvrir la fiche »). */
type ToastAction = { label: string; href: string };
type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
};

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message, variant, action }]);
      // Un toast porteur d'un lien reste un peu plus longtemps : le temps
      // de viser la cible au pouce.
      setTimeout(() => removeToast(id), action ? 6000 : 4000);
    },
    [removeToast]
  );

  const value: ToastContextValue = {
    toast,
    success: (m, action) => toast(m, "success", action),
    error: (m) => toast(m, "error"),
    info: (m) => toast(m, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-sm z-50 flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <ToastView key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const Icon =
    toast.variant === "success" ? Check : toast.variant === "error" ? AlertCircle : Info;
  const colorClasses =
    toast.variant === "success"
      ? "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 border-green-200 dark:border-green-900"
      : toast.variant === "error"
      ? "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border-red-200 dark:border-red-900"
      : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700";

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-lg border shadow-md px-3 py-2.5 flex items-start gap-2.5 transition-all duration-200",
        colorClasses,
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      )}
    >
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        {toast.message}
        {toast.action && (
          <Link
            href={toast.action.href}
            onClick={onClose}
            className="mt-0.5 -mx-1.5 flex min-h-11 w-fit items-center px-1.5 text-sm font-semibold underline underline-offset-2"
          >
            {toast.action.label}
          </Link>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 -mr-1 -mt-1 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
