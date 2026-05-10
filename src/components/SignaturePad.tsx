"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Canvas de signature : l'utilisateur signe avec la souris ou le doigt,
 * on convertit en data URL PNG. Compatible mobile (touch) et desktop.
 */
export function SignaturePad({
  onSign,
  pending = false,
  buttonLabel = "Valider la signature",
  height = 180,
}: {
  onSign: (dataUrl: string) => void | Promise<void>;
  pending?: boolean;
  buttonLabel?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Initialise le canvas avec une taille adaptée au DPI
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1e293b"; // slate-800
    }
  }, []);

  function getPos(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) {
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e);
  }
  function draw(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = pos;
    setHasDrawing(true);
  }
  function end() {
    setDrawing(false);
    lastPos.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  function submit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasDrawing) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSign(dataUrl);
  }

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden touch-none"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={end}
          className="w-full h-full cursor-crosshair touch-none"
          style={{ width: "100%", height: "100%" }}
        />
        {!hasDrawing && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm pointer-events-none italic">
            Signez ici (souris ou doigt)
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={pending || !hasDrawing}
        >
          <Eraser size={14} /> Effacer
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={pending || !hasDrawing}
        >
          <Check size={14} />
          {pending ? "Envoi…" : buttonLabel}
        </Button>
      </div>
    </div>
  );
}
