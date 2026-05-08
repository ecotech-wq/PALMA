"use client";

import { useState, useTransition } from "react";
import {
  Check,
  X,
  Trash2,
  Shield,
  ShieldOff,
  RotateCcw,
  KeyRound,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ResetResult {
  url: string;
  expiresAt: Date;
  emailSent: boolean;
  userEmail: string;
}

export function UserActions({
  userId,
  status,
  role,
  isMe,
  onApprove,
  onRevoke,
  onDelete,
  onChangeRole,
  onResetPassword,
}: {
  userId: string;
  status: string;
  role: string;
  isMe: boolean;
  onApprove: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChangeRole: (id: string, role: string) => Promise<void>;
  onResetPassword: (id: string) => Promise<ResetResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function runReset() {
    setError(null);
    setResetResult(null);
    startTransition(async () => {
      try {
        const result = await onResetPassword(userId);
        setResetResult(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 w-full sm:w-auto">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 max-w-full sm:max-w-[260px] text-right">
          {error}
        </div>
      )}

      {resetResult && (
        <div className="w-full max-w-md rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-medium mb-1">
            Lien de réinitialisation pour {resetResult.userEmail}
          </p>
          {resetResult.emailSent ? (
            <p className="text-amber-700 dark:text-amber-300 mb-2">
              ✓ Email envoyé. L&apos;utilisateur peut aussi utiliser ce lien direct :
            </p>
          ) : (
            <p className="text-amber-700 dark:text-amber-300 mb-2">
              Aucun SMTP configuré → copie ce lien et envoie-le manuellement à
              l&apos;utilisateur :
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={resetResult.url}
              readOnly
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 px-2 py-1 text-[11px] font-mono"
            />
            <button
              type="button"
              onClick={() => copyLink(resetResult.url)}
              className="shrink-0 px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs flex items-center gap-1"
            >
              <Copy size={11} />
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="mt-2 text-amber-700 dark:text-amber-300">
            Valide jusqu&apos;au {new Date(resetResult.expiresAt).toLocaleString("fr-FR")}
          </p>
          <button
            type="button"
            onClick={() => setResetResult(null)}
            className="mt-2 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline"
          >
            Masquer
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 justify-end">
        {status === "PENDING" && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => run(() => onApprove(userId))}
            disabled={pending}
            title="Approuver le compte"
          >
            <Check size={14} />
            <span className="hidden sm:inline">Approuver</span>
          </Button>
        )}

        {status === "REVOKED" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run(() => onApprove(userId))}
            disabled={pending}
            title="Réactiver le compte"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Réactiver</span>
          </Button>
        )}

        {status === "ACTIVE" && !isMe && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => run(() => onRevoke(userId))}
            disabled={pending}
            title="Révoquer l'accès"
          >
            <X size={14} />
            <span className="hidden sm:inline">Révoquer</span>
          </Button>
        )}

        {!isMe && status !== "REVOKED" && (
          <Button
            size="sm"
            variant="outline"
            onClick={runReset}
            disabled={pending}
            title="Générer un lien de réinitialisation de mot de passe"
          >
            <KeyRound size={14} />
            <span className="hidden md:inline">Reset MdP</span>
          </Button>
        )}

        {!isMe && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run(() => onChangeRole(userId, role === "ADMIN" ? "CHEF" : "ADMIN"))
            }
            disabled={pending}
            title={
              role === "ADMIN"
                ? "Rétrograder en chef de chantier"
                : "Promouvoir en administrateur"
            }
          >
            {role === "ADMIN" ? <ShieldOff size={14} /> : <Shield size={14} />}
            <span className="hidden md:inline">
              {role === "ADMIN" ? "Retirer admin" : "Faire admin"}
            </span>
          </Button>
        )}

        {!isMe && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (!confirm("Supprimer définitivement ce compte ?")) return;
              run(() => onDelete(userId));
            }}
            disabled={pending}
            title="Supprimer le compte"
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
