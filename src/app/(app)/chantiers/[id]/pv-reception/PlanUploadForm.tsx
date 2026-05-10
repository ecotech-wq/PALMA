"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, FileText } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ajouterPlan } from "./actions";
import { PdfImporterModal } from "./PdfImporterModal";

/**
 * Permet d'ajouter un plan au PV. Deux modes :
 *  - Image directe (PNG/JPG/WEBP) : envoyée telle quelle
 *  - PDF : ouvre une modale qui rastérise les pages choisies
 */
export function PlanUploadForm({ chantierId }: { chantierId: string }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [hasFile, setHasFile] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await ajouterPlan(chantierId, fd);
        toast.success("Plan ajouté");
        form.reset();
        setHasFile(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Bouton PDF */}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPdfModalOpen(true)}
          className="w-full sm:w-auto"
        >
          <FileText size={14} /> Importer depuis un PDF (sélection de pages + DPI)
        </Button>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">
          Idéal pour un dossier de plans : sélectionnez les pages utiles et la résolution.
        </p>
      </div>

      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          ou
        </span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Upload image directe */}
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
        <Input
          type="text"
          name="nom"
          placeholder="Nom du plan (ex: RDC, Étage 1...)"
        />
        <input
          ref={fileRef}
          type="file"
          name="plan"
          accept="image/png,image/jpeg,image/webp"
          required
          onChange={(e) => setHasFile(!!e.target.files?.length)}
          className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!hasFile || pending}>
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Envoi...
              </>
            ) : (
              <>
                <ImagePlus size={14} /> Importer une image
              </>
            )}
          </Button>
        </div>
      </form>

      {pdfModalOpen && (
        <PdfImporterModal
          chantierId={chantierId}
          onClose={() => setPdfModalOpen(false)}
        />
      )}
    </div>
  );
}
