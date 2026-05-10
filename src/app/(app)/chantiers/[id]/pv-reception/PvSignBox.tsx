"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { SignaturePad } from "@/components/SignaturePad";
import { signPvAdmin, signPvClient, signLeveeReserves } from "./actions";

/**
 * Encart de signature pour le PV de réception. Le rôle détermine
 * quelle action server est appelée :
 * - admin : signe et envoie au client
 * - client : signe la réception
 * - levee : signe la levée des réserves
 */
export function PvSignBox({
  chantierId,
  role,
  label,
}: {
  chantierId: string;
  role: "admin" | "client" | "levee";
  label: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showPad, setShowPad] = useState(false);

  function onSign(dataUrl: string) {
    startTransition(async () => {
      try {
        if (role === "admin") {
          await signPvAdmin(chantierId, dataUrl);
        } else if (role === "client") {
          await signPvClient(chantierId, dataUrl);
        } else {
          await signLeveeReserves(chantierId, dataUrl);
        }
        toast.success("Signature enregistrée");
        setShowPad(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (!showPad) {
    return (
      <Button type="button" size="sm" onClick={() => setShowPad(true)}>
        <PenLine size={14} /> {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
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
    </div>
  );
}
