"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { SignaturePad } from "@/components/SignaturePad";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Encart de signature client, réutilisable pour un devis ou une situation.
 * Reçoit la server action en prop. Si déjà signé, affiche l'empreinte, la date
 * et le nom du signataire (valeur probante). Sinon, déplie le pavé de
 * signature à la demande (mobile-first : rien au survol).
 */
export function SignBoxClient({
  docId,
  action,
  signeUrl,
  signeLe,
  signeNom,
  libelle,
  mention,
}: {
  docId: string;
  action: (docId: string, signatureDataUrl: string) => Promise<void>;
  signeUrl: string | null;
  signeLe: Date | string | null;
  signeNom: string | null;
  libelle: string;
  /** Portée juridique exacte affichée avant le tracé (devis vs situation). */
  mention: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showPad, setShowPad] = useState(false);

  function onSign(dataUrl: string) {
    startTransition(async () => {
      try {
        await action(docId, dataUrl);
        toast.success("Signé. Merci !");
        setShowPad(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (signeUrl) {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signeUrl}
          alt="Signature"
          className="max-h-14 rounded bg-white"
        />
        <div className="text-xs text-green-800 dark:text-green-300">
          <span className="flex items-center gap-1 font-medium">
            <CheckCircle2 size={13} /> Signé
          </span>
          {signeNom && <span className="block">{signeNom}</span>}
          {signeLe && (
            <span className="block text-green-700/80 dark:text-green-400/80">
              le {dateTimeFmt.format(new Date(signeLe))}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!showPad ? (
        <Button type="button" size="sm" onClick={() => setShowPad(true)}>
          <PenLine size={14} /> {libelle}
        </Button>
      ) : (
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Signez ci-dessous
            </span>
            <button
              type="button"
              onClick={() => setShowPad(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Annuler"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
            {mention}
          </p>
          <SignaturePad
            onSign={onSign}
            pending={pending}
            buttonLabel="Valider la signature"
          />
        </div>
      )}
    </div>
  );
}
