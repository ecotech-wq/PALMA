"use client";

import { useState, useTransition } from "react";
import { Check, X, Trash2, Shield, ShieldOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function UserActions({
  userId,
  status,
  role,
  isMe,
  onApprove,
  onRevoke,
  onDelete,
  onChangeRole,
}: {
  userId: string;
  status: string;
  role: string;
  isMe: boolean;
  onApprove: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChangeRole: (id: string, role: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 max-w-[200px] text-right">
          {error}
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
