"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ajouterReserve } from "./actions";

/**
 * Formulaire de création d'une nouvelle réserve.
 * - Si `planId` + `posX/posY` sont fournis : la réserve sera liée à ce
 *   point sur le plan.
 * - Sinon : réserve "sans plan" (zone textuelle uniquement).
 */
export function ReserveForm({
  chantierId,
  planId,
  posX,
  posY,
  onSuccess,
}: {
  chantierId: string;
  planId?: string;
  posX?: number;
  posY?: number;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [previews, setPreviews] = useState<string[]>([]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await ajouterReserve(chantierId, fd);
        toast.success("Réserve ajoutée");
        form.reset();
        setPreviews([]);
        onSuccess?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
      {planId && (
        <>
          <input type="hidden" name="planId" value={planId} />
          {typeof posX === "number" && (
            <input type="hidden" name="posX" value={String(posX)} />
          )}
          {typeof posY === "number" && (
            <input type="hidden" name="posY" value={String(posY)} />
          )}
        </>
      )}

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          Description du défaut
        </label>
        <Textarea
          name="texte"
          rows={2}
          required
          placeholder="Ex : peinture écaillée, joint manquant..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
            Localisation
          </label>
          <Input
            name="zone"
            placeholder="Cuisine, Chambre 1..."
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
            Lot / corps de métier
          </label>
          <Input
            name="lot"
            list="lot-suggestions"
            placeholder="NIC, ACC, SOL, FER..."
          />
          <datalist id="lot-suggestions">
            <option value="NIC">Nettoyage</option>
            <option value="ACC">Accessoires / Quincaillerie</option>
            <option value="SOL">Sols</option>
            <option value="FER">Plomberie / Sanitaires</option>
            <option value="MET">Menuiseries Extérieures</option>
            <option value="BOI">Menuiseries Bois</option>
            <option value="PEI">Peinture</option>
            <option value="CAR">Carrelage / Faïence</option>
            <option value="ELE">Électricité</option>
            <option value="VRD">Voirie / Réseaux divers</option>
            <option value="ETA">Étanchéité</option>
            <option value="SBT">Béton / Maçonnerie</option>
          </datalist>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          Date limite (« Pour le ») — optionnel
        </label>
        <Input type="date" name="dateLimite" />
      </div>

      <div>
        <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">
          <Camera size={12} className="inline mr-1" />
          Photos (plusieurs possibles)
        </label>
        <input
          type="file"
          name="photos"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
        />
        {previews.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Aperçu ${i + 1}`}
                className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-800"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Envoi...
            </>
          ) : (
            <>
              <Plus size={14} /> Ajouter la réserve
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
