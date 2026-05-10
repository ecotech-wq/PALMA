"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ajouterPlan } from "./actions";

/**
 * Permet d'uploader un plan (image PNG/JPG/WEBP) sur lequel on pourra
 * placer des puces de réserves.
 */
export function PlanUploadForm({ chantierId }: { chantierId: string }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [hasFile, setHasFile] = useState(false);

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
      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
        Formats acceptés : PNG, JPG, WEBP. Pour un PDF : convertissez d&apos;abord en image.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!hasFile || pending}>
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Envoi...
            </>
          ) : (
            <>
              <ImagePlus size={14} /> Importer le plan
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
