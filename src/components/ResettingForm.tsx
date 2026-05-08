"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import { useToast } from "@/components/Toast";

/**
 * Formulaire qui se réinitialise tout seul après un enregistrement réussi.
 * Utile pour les formulaires d'ajout (avance, outil, multi-pointage, etc.) :
 * après le submit on remet les champs à leurs `defaultValue` sans recharger
 * la page.
 *
 * Pendant le submit le `<fieldset>` interne est `disabled` → tous les inputs
 * du formulaire sont bloqués automatiquement.
 */
export function ResettingForm({
  action,
  children,
  className,
  successMessage,
  onSuccess,
  ...rest
}: {
  action: (formData: FormData) => Promise<unknown>;
  children: ReactNode;
  className?: string;
  /** Toast affiché après succès. Mettre à null pour ne rien afficher. */
  successMessage?: string | null;
  onSuccess?: () => void;
} & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "ref">) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function handleAction(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        ref.current?.reset();
        if (successMessage !== null) {
          toast.success(successMessage ?? "Enregistré");
        }
        onSuccess?.();
      } catch (e) {
        // Les erreurs `redirect()` de Next ne doivent pas être interceptées.
        if (
          e &&
          typeof e === "object" &&
          "digest" in e &&
          typeof (e as { digest?: string }).digest === "string" &&
          (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <form ref={ref} action={handleAction} className={className} {...rest}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
