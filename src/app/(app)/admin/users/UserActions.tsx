"use client";

import { useState, useTransition } from "react";
import {
  Check,
  X,
  Trash2,
  RotateCcw,
  KeyRound,
  Copy,
  Hammer,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";

interface ResetResult {
  url: string;
  expiresAt: Date;
  emailSent: boolean;
  userEmail: string;
}

type ChantierLite = { id: string; nom: string };

type Visibility = {
  showJournal: boolean;
  showIncidents: boolean;
  showPlans: boolean;
  showRapportsHebdo: boolean;
};

export function UserActions({
  userId,
  status,
  role,
  isMe,
  allChantiers,
  assignedChantierIds,
  visibility,
  onApprove,
  onRevoke,
  onDelete,
  onChangeRole,
  onResetPassword,
  onSetClientChantiers,
  onSetClientVisibility,
}: {
  userId: string;
  status: string;
  role: string;
  isMe: boolean;
  allChantiers: ChantierLite[];
  assignedChantierIds: string[];
  visibility: Visibility;
  onApprove: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChangeRole: (id: string, role: string) => Promise<void>;
  onResetPassword: (id: string) => Promise<ResetResult>;
  onSetClientChantiers: (id: string, chantierIds: string[]) => Promise<void>;
  onSetClientVisibility: (
    id: string,
    flags: Partial<Visibility>
  ) => Promise<void>;
}) {
  const toast = useToast();
  const [showChantiers, setShowChantiers] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [selectedChantiers, setSelectedChantiers] = useState<Set<string>>(
    new Set(assignedChantierIds)
  );
  const [vis, setVis] = useState<Visibility>(visibility);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleChantier(id: string) {
    setSelectedChantiers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveChantiers() {
    startTransition(async () => {
      try {
        await onSetClientChantiers(userId, Array.from(selectedChantiers));
        toast.success("Chantiers du client mis à jour");
        setShowChantiers(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function toggleVis(key: keyof Visibility) {
    const next = { ...vis, [key]: !vis[key] };
    setVis(next);
    startTransition(async () => {
      try {
        await onSetClientVisibility(userId, { [key]: next[key] });
        toast.success("Visibilité mise à jour");
      } catch (e) {
        setVis(vis);
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

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
          <select
            value={role}
            onChange={(e) =>
              run(() => onChangeRole(userId, e.target.value))
            }
            disabled={pending}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            title="Rôle"
          >
            <option value="ADMIN">Admin</option>
            <option value="CHEF">Chef de chantier</option>
            <option value="CLIENT">Client</option>
          </select>
        )}

        {role === "CLIENT" && !isMe && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowChantiers((v) => !v)}
              disabled={pending}
              title="Choisir les chantiers visibles par ce client"
            >
              <Hammer size={14} />
              <span className="hidden md:inline">
                Chantiers ({selectedChantiers.size})
              </span>
              {showChantiers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowVisibility((v) => !v)}
              disabled={pending}
              title="Choisir ce que ce client peut voir"
            >
              <Eye size={14} />
              <span className="hidden md:inline">Visibilité</span>
              {showVisibility ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          </>
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

      {/* Panneau d'assignation chantiers (visible uniquement pour CLIENT) */}
      {role === "CLIENT" && showChantiers && (
        <div className="w-full max-w-md mt-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            Chantiers visibles par ce client
          </div>
          {allChantiers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              Aucun chantier dans le système.
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {allChantiers.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 py-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedChantiers.has(c.id)}
                    onChange={() => toggleChantier(c.id)}
                    className="rounded border-slate-400 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300 truncate">
                    {c.nom}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedChantiers(new Set(assignedChantierIds));
                setShowChantiers(false);
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveChantiers}
              disabled={pending}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {/* Panneau de visibilité (CLIENT uniquement) */}
      {role === "CLIENT" && showVisibility && (
        <div className="w-full max-w-md mt-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            Que voit ce client ?
          </div>
          <div className="space-y-1">
            {(
              [
                { key: "showRapportsHebdo", label: "Rapports hebdomadaires" },
                { key: "showJournal", label: "Journal de chantier (chat)" },
                { key: "showIncidents", label: "Incidents" },
                { key: "showPlans", label: "Plans" },
              ] as const
            ).map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 py-1.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={vis[key]}
                  onChange={() => toggleVis(key)}
                  disabled={pending}
                  className="rounded border-slate-400 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
            Désactivé = le client ne voit pas la section et n&apos;y a pas
            accès via l&apos;URL.
          </p>
        </div>
      )}
    </div>
  );
}
