"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import {
  startTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  regenerateBackupCodes,
} from "./actions";

/* -------------------------------------------------------------------------
 *  Section "Authentification à 2 facteurs" du profil.
 *  3 états :
 *   - off (pas activé) → bouton "Activer", wizard QR + code
 *   - on (activé)      → bouton "Désactiver" + régénérer backup codes
 *   - enrolling        → écran QR + saisie code de vérification
 * ----------------------------------------------------------------------- */

type Step =
  | { phase: "idle" }
  | { phase: "enrolling"; qrDataUrl: string; secret: string }
  | { phase: "showBackup"; codes: string[] };

export function TotpSection({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [step, setStep] = useState<Step>({ phase: "idle" });
  const [pending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      try {
        const r = await startTotpEnrollment();
        setStep({ phase: "enrolling", qrDataUrl: r.qrDataUrl, secret: r.secret });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleConfirm(formData: FormData) {
    startTransition(async () => {
      try {
        const r = await confirmTotpEnrollment(formData);
        setEnabled(true);
        setStep({ phase: "showBackup", codes: r.backupCodes });
        toast.success("2FA activé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleDisable(formData: FormData) {
    if (!confirm("Désactiver le 2FA ? Tu perdras la protection supplémentaire.")) return;
    startTransition(async () => {
      try {
        await disableTotp(formData);
        setEnabled(false);
        setStep({ phase: "idle" });
        toast.success("2FA désactivé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleRegenerate(formData: FormData) {
    startTransition(async () => {
      try {
        const r = await regenerateBackupCodes(formData);
        setStep({ phase: "showBackup", codes: r.backupCodes });
        toast.success("Nouveaux codes de secours générés");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {enabled ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={14} /> Activé
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            <ShieldOff size={14} /> Désactivé
          </span>
        )}
      </div>

      {/* Phase 1 : démarrer */}
      {step.phase === "idle" && !enabled && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ajoute une couche de sécurité : à chaque connexion, on te
            demandera un code à 6 chiffres généré par une appli
            authentificateur (Google Authenticator, Authy, 1Password…).
          </p>
          <Button type="button" onClick={handleStart} disabled={pending}>
            <ShieldCheck size={14} /> Activer le 2FA
          </Button>
        </>
      )}

      {/* Phase 1bis : déjà activé */}
      {step.phase === "idle" && enabled && (
        <DisableForm onSubmit={handleDisable} pending={pending} onRegenerate={handleRegenerate} />
      )}

      {/* Phase 2 : QR + code de vérification */}
      {step.phase === "enrolling" && (
        <EnrollForm
          qrDataUrl={step.qrDataUrl}
          secret={step.secret}
          onSubmit={handleConfirm}
          pending={pending}
        />
      )}

      {/* Phase 3 : backup codes (affichés UNE seule fois) */}
      {step.phase === "showBackup" && (
        <BackupCodesView
          codes={step.codes}
          onClose={() => setStep({ phase: "idle" })}
        />
      )}
    </div>
  );
}

function EnrollForm({
  qrDataUrl,
  secret,
  onSubmit,
  pending,
}: {
  qrDataUrl: string;
  secret: string;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copySecret() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/30">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
        1. Scanne ce QR code dans ton authentificateur
      </h3>
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="QR code 2FA"
          className="w-40 h-40 border border-slate-200 dark:border-slate-700 rounded bg-white"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Pas de QR ? Saisis manuellement ce secret dans ton app :
          </p>
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[11px] font-mono break-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5">
              {secret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Copier"
            >
              {copied ? (
                <Check size={14} className="text-emerald-600" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      </div>

      <form action={onSubmit} className="mt-4 space-y-3">
        <Field label="2. Saisis le code de vérification (6 chiffres)">
          <Input
            type="text"
            name="token"
            required
            inputMode="numeric"
            pattern="^[0-9]{6}$"
            placeholder="123456"
            autoComplete="one-time-code"
            className="font-mono tracking-widest text-center"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          <ShieldCheck size={14} /> Confirmer et activer
        </Button>
      </form>
    </div>
  );
}

function BackupCodesView({
  codes,
  onClose,
}: {
  codes: string[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copyAll() {
    navigator.clipboard.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="border border-amber-300 dark:border-amber-900 rounded-lg p-3 bg-amber-50 dark:bg-amber-950/30">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle
          size={16}
          className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
        />
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Codes de secours — à conserver immédiatement
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
            Ces codes te permettront de te connecter si tu perds ton téléphone.
            Chaque code est utilisable <strong>une seule fois</strong>. Ils
            ne seront <strong>plus jamais affichés</strong> après fermeture
            de cette zone.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {codes.map((c, i) => (
          <code
            key={i}
            className="font-mono text-sm bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5 text-center text-slate-900 dark:text-slate-100"
          >
            {c}
          </code>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={copyAll}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiés !" : "Tout copier"}
        </Button>
        <Button type="button" onClick={onClose} variant="outline">
          J&apos;ai sauvegardé mes codes
        </Button>
      </div>
    </div>
  );
}

function DisableForm({
  onSubmit,
  pending,
  onRegenerate,
}: {
  onSubmit: (fd: FormData) => void;
  pending: boolean;
  onRegenerate: (fd: FormData) => void;
}) {
  const [mode, setMode] = useState<"none" | "disable" | "regen">("none");

  if (mode === "none") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Le 2FA est actif sur ce compte. Tu peux :
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button type="button" onClick={() => setMode("regen")} variant="outline">
            Régénérer mes codes de secours
          </Button>
          <Button type="button" onClick={() => setMode("disable")} variant="outline">
            <ShieldOff size={14} /> Désactiver le 2FA
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "regen") {
    return (
      <form action={onRegenerate} className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
        <Field label="Code 2FA actuel pour confirmer">
          <Input
            type="text"
            name="token"
            required
            inputMode="numeric"
            pattern="^[0-9]{6}$"
            placeholder="123456"
            autoComplete="one-time-code"
            className="font-mono tracking-widest text-center"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            Régénérer les codes
          </Button>
          <Button type="button" onClick={() => setMode("none")} variant="outline">
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={onSubmit} className="space-y-3 border border-red-200 dark:border-red-900 rounded-lg p-3">
      <Field label="Mot de passe actuel pour désactiver le 2FA">
        <Input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          <ShieldOff size={14} /> Confirmer la désactivation
        </Button>
        <Button onClick={() => setMode("none")} variant="outline">
          Annuler
        </Button>
      </div>
    </form>
  );
}
