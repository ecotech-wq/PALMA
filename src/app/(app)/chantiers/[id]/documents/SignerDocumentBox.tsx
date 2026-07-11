"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { SignaturePad } from "@/components/SignaturePad";
import { signerDocumentChantier } from "./actions";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Encart de signature d'un document de chantier par le client. Même UX que
 * l'encart devis / situations de /mes-documents : si déjà signé, vignette de
 * la signature, horodatage et nom du signataire (valeur probante) ; sinon un
 * bouton signal « Lire et signer » qui déplie le lien vers la pièce puis le
 * pavé de signature (mobile-first : rien au survol).
 */
export function SignerDocumentBox({
  documentId,
  fichier,
  signeUrl,
  signeLe,
  signePar,
}: {
  documentId: string;
  fichier: string;
  signeUrl: string | null;
  signeLe: Date | string | null;
  signePar: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showPad, setShowPad] = useState(false);

  function onSign(dataUrl: string) {
    startTransition(async () => {
      try {
        await signerDocumentChantier(documentId, dataUrl);
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
          {signePar && <span className="block">{signePar}</span>}
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
        <Button
          type="button"
          variant="signal"
          size="sm"
          onClick={() => setShowPad(true)}
        >
          <PenLine size={14} /> Lire et signer
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
              className="p-2 text-slate-400 hover:text-slate-600"
              aria-label="Annuler"
            >
              <X size={16} />
            </button>
          </div>
          <a
            href={fichier}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            <ExternalLink size={12} /> Ouvrir le document avant de signer
          </a>
          <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
            Votre signature vaut bon pour accord sur ce document. Elle est
            horodatée et associée à votre compte.
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
