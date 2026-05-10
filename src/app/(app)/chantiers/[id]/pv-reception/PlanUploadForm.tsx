"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FilePlus, Upload } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { ajouterPlan } from "./actions";
import { PdfImporterModal } from "./PdfImporterModal";

/**
 * Bouton unique d'import : reconnaît automatiquement PDF vs image.
 *  - PDF → ouvre la modale de sélection des pages + DPI
 *  - Image (PNG/JPG/WEBP) → upload direct comme plan
 */
export function PlanUploadForm({
  chantierId,
  variant = "card",
}: {
  chantierId: string;
  /** "card" : ancien rendu (titre + zone). "compact" : juste un bouton
   *  intégré dans la barre d'outils du workspace. */
  variant?: "card" | "compact";
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, startTransition] = useTransition();
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  function handlePick() {
    fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // reset l'input pour permettre de re-sélectionner le même fichier
    e.target.value = "";
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      /\.pdf$/i.test(file.name);
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp)$/i.test(file.name);

    if (isPdf) {
      setPdfFile(file);
      return;
    }

    if (!isImage) {
      toast.error("Format non reconnu. PDF ou image (PNG/JPG/WEBP).");
      return;
    }

    // Upload image direct
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("plan", file);
        fd.append(
          "nom",
          file.name.replace(/\.[^.]+$/, "") || "Plan"
        );
        await ajouterPlan(chantierId, fd);
        toast.success("Plan ajouté");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  const buttonLabel = pendingUpload ? (
    <>
      <Loader2 size={14} className="animate-spin" /> Envoi...
    </>
  ) : variant === "compact" ? (
    <>
      <FilePlus size={14} /> Ajouter un plan
    </>
  ) : (
    <>
      <Upload size={14} /> Importer un plan (PDF ou image)
    </>
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        size="sm"
        variant={variant === "compact" ? "secondary" : undefined}
        onClick={handlePick}
        disabled={pendingUpload}
      >
        {buttonLabel}
      </Button>
      {variant === "card" && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">
          PDF (sélection de pages + DPI) ou image (PNG / JPG / WEBP) — détection auto.
        </p>
      )}

      {pdfFile && (
        <PdfImporterModal
          chantierId={chantierId}
          initialFile={pdfFile}
          onClose={() => setPdfFile(null)}
        />
      )}
    </>
  );
}
