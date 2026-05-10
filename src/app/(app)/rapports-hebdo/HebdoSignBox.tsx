"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PenLine, X } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { SignaturePad } from "@/components/SignaturePad";
import { signRapportHebdo } from "./actions";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Encart de signature pour le client sur la page rapport hebdo.
 * Si déjà signé, affiche la signature et la date.
 */
export function HebdoSignBox({
  chantierId,
  semaineDebutStr,
  alreadySignedUrl,
  signedAt,
}: {
  chantierId: string;
  semaineDebutStr: string;
  alreadySignedUrl: string | null;
  signedAt: Date | string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showPad, setShowPad] = useState(false);

  function onSign(dataUrl: string) {
    startTransition(async () => {
      try {
        await signRapportHebdo(chantierId, semaineDebutStr, dataUrl);
        toast.success("Rapport signé. Merci !");
        setShowPad(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (alreadySignedUrl) {
    return (
      <Card className="border-green-200 dark:border-green-900">
        <CardHeader className="bg-green-50 dark:bg-green-950/40">
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 size={18} /> Rapport signé
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={alreadySignedUrl}
              alt="Signature client"
              className="max-h-32"
            />
          </div>
          {signedAt && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Signé le {dateTimeFmt.format(new Date(signedAt))}
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine size={18} /> Signer pour valider la réception
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {!showPad ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Signez ce rapport pour confirmer que vous avez bien pris
              connaissance de l&apos;activité de la semaine.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowPad(true)}
            >
              <PenLine size={14} /> Signer
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
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
            <SignaturePad
              onSign={onSign}
              pending={pending}
              buttonLabel="Valider la signature"
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}
