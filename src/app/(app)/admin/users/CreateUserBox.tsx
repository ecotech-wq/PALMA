"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import { adminCreateUser } from "./actions";

type Chantier = { id: string; nom: string };
type InviteResult = {
  url: string;
  expiresAt: Date;
  emailSent: boolean;
  userEmail: string;
  userName: string;
};

/**
 * Encart admin pour créer un nouvel utilisateur :
 * - Saisit nom + email + rôle
 * - Si rôle CLIENT : assigne déjà des chantiers
 * - Génère un lien de reset valide 24h
 * - Si SMTP configuré : email envoyé direct
 * - Sinon : retourne le lien à copier (à envoyer par WhatsApp/SMS)
 */
export function CreateUserBox({
  chantiers,
}: {
  chantiers: Chantier[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [role, setRole] = useState<"ADMIN" | "CHEF" | "CLIENT">("CHEF");
  const [selectedChantiers, setSelectedChantiers] = useState<Set<string>>(
    new Set()
  );
  const [copied, setCopied] = useState(false);

  function toggleChantier(id: string) {
    setSelectedChantiers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    formData.delete("chantierIds");
    for (const id of selectedChantiers) {
      formData.append("chantierIds", id);
    }
    startTransition(async () => {
      try {
        const res = await adminCreateUser(formData);
        setResult(res);
        toast.success(`Compte créé pour ${res.userName}`);
        setSelectedChantiers(new Set());
        // On ne ferme pas immédiatement pour que l'admin voie le lien
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) {
            setResult(null);
            setError(null);
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-brand-600" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Créer un nouvel utilisateur
          </span>
        </div>
        {open ? (
          <ChevronUp size={18} className="text-slate-400" />
        ) : (
          <ChevronDown size={18} className="text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {result ? (
            <ResultBox
              result={result}
              copied={copied}
              onCopy={() => copyUrl(result.url)}
              onReset={() => {
                setResult(null);
                setError(null);
              }}
            />
          ) : (
            <form action={onSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nom complet" required>
                  <Input name="name" required placeholder="Jean Dupont" />
                </Field>
                <Field label="Email" required>
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="jean@exemple.fr"
                  />
                </Field>
              </div>

              <Field label="Rôle" required>
                <Select
                  name="role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "ADMIN" | "CHEF" | "CLIENT")
                  }
                  required
                >
                  <option value="CHEF">Chef de chantier</option>
                  <option value="ADMIN">Administrateur</option>
                  <option value="CLIENT">Client</option>
                </Select>
              </Field>

              {role === "CLIENT" && (
                <div className="rounded-md bg-slate-50 dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Chantiers visibles par ce client
                  </div>
                  {chantiers.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      Aucun chantier dans le système.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {chantiers.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 px-1.5 py-1 rounded"
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
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
                    Tu peux aussi modifier les chantiers plus tard depuis
                    la liste des utilisateurs.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={pending}>
                  <UserPlus size={14} />
                  {pending ? "Création…" : "Créer & inviter"}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                Un lien d&apos;invitation valide 24h sera généré. Si SMTP
                est configuré, l&apos;email part direct ; sinon tu pourras
                copier le lien et l&apos;envoyer par WhatsApp / SMS.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function ResultBox({
  result,
  copied,
  onCopy,
  onReset,
}: {
  result: InviteResult;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium">
          ✅ Compte créé pour <strong>{result.userName}</strong> (
          {result.userEmail})
        </p>
        <button
          type="button"
          onClick={onReset}
          className="text-amber-700 dark:text-amber-300 hover:text-amber-900"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>
      {result.emailSent ? (
        <p className="text-amber-700 dark:text-amber-300 mb-2">
          ✓ Email d&apos;invitation envoyé. L&apos;utilisateur peut aussi
          utiliser ce lien direct :
        </p>
      ) : (
        <p className="text-amber-700 dark:text-amber-300 mb-2">
          Aucun SMTP configuré → copie ce lien et envoie-le par WhatsApp,
          SMS ou autre :
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={result.url}
          readOnly
          onClick={(e) => e.currentTarget.select()}
          className="flex-1 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 px-2 py-1 text-[11px] font-mono"
        />
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs flex items-center gap-1"
        >
          <Copy size={11} />
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <p className="mt-2 text-amber-700 dark:text-amber-300">
        Valide jusqu&apos;au{" "}
        {new Date(result.expiresAt).toLocaleString("fr-FR")}
      </p>
    </div>
  );
}
