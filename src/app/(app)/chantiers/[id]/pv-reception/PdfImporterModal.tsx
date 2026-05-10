"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileUp, Loader2, ImagePlus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ajouterPlan } from "./actions";

type PageItem = {
  index: number; // 1-based page number
  thumbnail: string; // dataURL
  width: number; // PDF user space (pts at scale 1)
  height: number;
  selected: boolean;
  nom: string;
};

const DPI_OPTIONS = [72, 100, 150, 200, 300] as const;

/**
 * Modal d'import PDF :
 *  1. L'utilisateur choisit un fichier PDF
 *  2. PDF.js génère une miniature de chaque page côté client
 *  3. L'utilisateur coche les pages, choisit la résolution (DPI),
 *     renomme chaque page si besoin
 *  4. Les pages sélectionnées sont rastérisées au DPI choisi puis
 *     uploadées comme plans (PNG)
 */
export function PdfImporterModal({
  chantierId,
  onClose,
}: {
  chantierId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dpi, setDpi] = useState<number>(150);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Référence vers le PDFDocumentProxy pour réutiliser au moment de l'import
  // (évite de re-télécharger / re-parser le fichier).
  const pdfDocRef = useRef<{ getPage: (n: number) => Promise<unknown>; numPages: number } | null>(null);

  // Charge pdf.js dynamiquement et rend les miniatures
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setPages([]);
    pdfDocRef.current = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Worker servi depuis /public
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const arrayBuf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf as unknown as typeof pdfDocRef.current;

        const baseName = (file.name.replace(/\.pdf$/i, "") || "Plan").trim();
        const items: PageItem[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const page: any = await pdf.getPage(i);
          // Échelle thumbnail : rendu à 60 DPI environ (scale = 0.83)
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas 2D context unavailable");
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const baseViewport = page.getViewport({ scale: 1 });
          items.push({
            index: i,
            thumbnail: canvas.toDataURL("image/png"),
            width: baseViewport.width,
            height: baseViewport.height,
            selected: true,
            nom:
              pdf.numPages > 1 ? `${baseName} - p${i}` : baseName,
          });
          // Mise à jour incrémentale pour feedback live
          if (!cancelled) setPages([...items]);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Impossible de lire ce PDF"
        );
        setFile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, toast]);

  function toggleSelect(idx: number) {
    setPages((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p))
    );
  }

  function selectAll(value: boolean) {
    setPages((prev) => prev.map((p) => ({ ...p, selected: value })));
  }

  function renamePage(idx: number, value: string) {
    setPages((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, nom: value } : p))
    );
  }

  async function handleImport() {
    const pdf = pdfDocRef.current;
    const selected = pages.filter((p) => p.selected);
    if (!pdf || selected.length === 0) {
      toast.error("Sélectionnez au moins une page");
      return;
    }
    setImporting(true);
    try {
      const scale = dpi / 72;
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i];
        setProgress(`Import page ${i + 1} / ${selected.length}...`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await pdf.getPage(p.index);
        const viewport = page.getViewport({ scale });

        // Limite raisonnable : si plus de 8000 px sur un côté, on
        // réduit pour éviter de saturer la mémoire navigateur.
        let finalScale = scale;
        const MAX_PX = 8000;
        if (viewport.width > MAX_PX || viewport.height > MAX_PX) {
          const ratio = MAX_PX / Math.max(viewport.width, viewport.height);
          finalScale = scale * ratio;
        }
        const finalViewport = page.getViewport({ scale: finalScale });

        const canvas = document.createElement("canvas");
        canvas.width = finalViewport.width;
        canvas.height = finalViewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        await page.render({
          canvasContext: ctx,
          viewport: finalViewport,
          canvas,
        }).promise;

        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/png"
          );
        });
        const fd = new FormData();
        fd.append(
          "plan",
          new File([blob], `${p.nom || `page-${p.index}`}.png`, {
            type: "image/png",
          })
        );
        fd.append("nom", p.nom);
        await ajouterPlan(chantierId, fd);
      }
      toast.success(`${selected.length} page(s) importée(s)`);
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'import");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  const selectedCount = pages.filter((p) => p.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Importer un plan PDF
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {!file && (
            <div className="text-center py-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={16} /> Choisir un PDF
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                Le fichier reste sur votre appareil. Seules les pages
                sélectionnées seront converties en image et importées.
              </p>
            </div>
          )}

          {file && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <strong>{file.name}</strong>
                  {pages.length > 0 && (
                    <span className="text-slate-500 ml-2">
                      {pages.length} page{pages.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPages([]);
                  }}
                  disabled={importing}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Changer de PDF
                </button>
              </div>

              {/* Options DPI + select all */}
              <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                <label className="text-sm text-slate-700 dark:text-slate-300">
                  Résolution :{" "}
                  <select
                    value={dpi}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    disabled={importing}
                    className="ml-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                  >
                    {DPI_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} dpi
                        {d === 72 && " (léger)"}
                        {d === 150 && " (recommandé)"}
                        {d === 300 && " (haute qualité)"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => selectAll(true)}
                    disabled={importing}
                    className="text-brand-700 dark:text-brand-400 hover:underline"
                  >
                    Tout sélectionner
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => selectAll(false)}
                    disabled={importing}
                    className="text-slate-500 hover:underline"
                  >
                    Tout désélectionner
                  </button>
                </div>
              </div>

              {loading && pages.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-500">
                  <Loader2 className="animate-spin inline mr-2" size={14} />
                  Lecture du PDF...
                </div>
              )}

              {/* Grille de pages */}
              {pages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {pages.map((p, i) => (
                    <div
                      key={p.index}
                      className={`rounded-md border-2 p-2 transition ${
                        p.selected
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => !importing && toggleSelect(i)}
                        className="block w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.thumbnail}
                          alt={`Page ${p.index}`}
                          className="block w-full h-auto bg-white border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </button>
                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="checkbox"
                          checked={p.selected}
                          disabled={importing}
                          onChange={() => toggleSelect(i)}
                          className="shrink-0"
                          aria-label={`Sélectionner page ${p.index}`}
                        />
                        <span className="text-[10px] text-slate-500 w-6 shrink-0">
                          p{p.index}
                        </span>
                        <Input
                          type="text"
                          value={p.nom}
                          onChange={(e) => renamePage(i, e.target.value)}
                          disabled={importing || !p.selected}
                          className="text-xs !py-1 !px-1.5 h-7"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {progress
              ? progress
              : selectedCount > 0
                ? `${selectedCount} page(s) sélectionnée(s) à ${dpi} dpi`
                : "Aucune page sélectionnée"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={importing}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || selectedCount === 0 || loading}
            >
              {importing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Import...
                </>
              ) : (
                <>
                  <ImagePlus size={14} /> Importer {selectedCount} page
                  {selectedCount > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
