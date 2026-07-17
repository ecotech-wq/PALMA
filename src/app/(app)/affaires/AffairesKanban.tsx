"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckSquare,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { changerEtape } from "./actions";

/* -------------------------------------------------------------------------
 *  Kanban des affaires : colonnes = étapes du pipeline de la typologie
 *  active. Même motif tactile que le KanbanBoard du planning (Pointer
 *  Events, appui maintenu 220 ms au doigt, anti-flash par override
 *  optimiste, colonnes sticky, cadre 72vh) : l'app vit sur téléphone.
 * ----------------------------------------------------------------------- */

export type AffaireCarte = {
  id: string;
  titre: string;
  contactNom: string;
  contactTel: string | null;
  valeurEstimee: number | null;
  etapeCle: string;
  /** Ancienneté dans l'étape, en jours entiers (calculée côté serveur). */
  joursEtape: number;
  /** Prochaine action échue ou affaire sans action depuis 14 j : AMBRE. */
  dormante: boolean;
  responsable: { name: string } | null;
  /** Badges façon Trello (comptés côté serveur, jamais par carte). */
  checklistFaits: number;
  checklistTotal: number;
  nbDocuments: number;
  nbPhotos: number;
  nbMessages: number;
};

export type ColonneEtape = { cle: string; libelle: string };

/* Réglages du glisser-déposer (mêmes valeurs que le planning). */
const SEUIL_SOURIS = 6;
const SEUIL_TACTILE = 8;
const DUREE_APPUI = 220;
const MARGE_AUTOSCROLL = 80;
const VITESSE_AUTOSCROLL = 14;

type DragState = {
  affaireId: string;
  titre: string;
  dragging: boolean;
  aborted: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  raf: number | null;
};

/** Colonne (étape) sous le point (x, y), via l'attribut [data-etape]. */
function etapeFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest?.("[data-etape]") as HTMLElement | null;
  return zone?.dataset.etape ?? null;
}

const eurosFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AffairesKanban({
  affaires,
  etapes,
  canEdit,
}: {
  affaires: AffaireCarte[];
  etapes: ColonneEtape[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    titre: string;
  } | null>(null);
  // Override optimiste : la carte rejoint sa colonne cible pendant que le
  // serveur confirme (anti-flash, même motif que le planning).
  const [etapeOverride, setEtapeOverride] = useState<Record<string, string>>(
    {}
  );

  function etapeOf(a: AffaireCarte): string {
    return etapeOverride[a.id] ?? a.etapeCle;
  }

  // Retire un override quand les props rafraîchies l'ont rattrapé.
  useEffect(() => {
    setEtapeOverride((prev) => {
      let change = false;
      const next = { ...prev };
      for (const [id, cle] of Object.entries(prev)) {
        if (savingId === id) continue;
        const a = affaires.find((x) => x.id === id);
        if (!a || a.etapeCle === cle) {
          delete next[id];
          change = true;
        }
      }
      return change ? next : prev;
    });
  }, [affaires, savingId]);

  function dropAffaire(id: string, cle: string) {
    const a = affaires.find((x) => x.id === id);
    if (!a) return;
    if (etapeOf(a) === cle) return;

    setEtapeOverride((prev) => ({ ...prev, [id]: cle }));
    setSavingId(id);

    startTransition(async () => {
      try {
        await changerEtape(id, cle);
        toast.success("Étape modifiée");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
        setEtapeOverride((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } finally {
        setSavingId(null);
      }
    });
  }

  function onCardPointerDown(e: React.PointerEvent, affaire: AffaireCarte) {
    if (!canEdit) return;
    if (dragRef.current) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    const isTouch = e.pointerType === "touch";
    if (!isTouch && e.button !== 0) return;
    if (!isTouch) e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture indisponible : on continue sans. */
    }
    const pointerId = e.pointerId;
    const st: DragState = {
      affaireId: affaire.id,
      titre: affaire.titre,
      dragging: false,
      aborted: false,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      holdTimer: null,
      raf: null,
    };
    dragRef.current = st;

    const blockTouchMove = (tev: TouchEvent) => tev.preventDefault();
    const blockContextMenu = (cev: Event) => cev.preventDefault();

    function startDrag() {
      st.dragging = true;
      setDraggingId(st.affaireId);
      setHoverCol(etapeFromPoint(st.lastX, st.lastY));
      setGhost({ x: st.lastX, y: st.lastY, titre: st.titre });
      if (isTouch) {
        window.addEventListener("touchmove", blockTouchMove, {
          passive: false,
        });
        navigator.vibrate?.(10);
      }
      st.raf = requestAnimationFrame(autoScroll);
    }

    function autoScroll() {
      if (!st.dragging || dragRef.current !== st) return;
      let scrolled = false;
      const sc = boardRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const haut = Math.max(rect.top, 0);
        const bas = Math.min(rect.bottom, window.innerHeight);
        const gauche = Math.max(rect.left, 0);
        const droite = Math.min(rect.right, window.innerWidth);
        if (st.lastY < haut + MARGE_AUTOSCROLL && sc.scrollTop > 0) {
          sc.scrollTop -= VITESSE_AUTOSCROLL;
          scrolled = true;
        } else if (
          st.lastY > bas - MARGE_AUTOSCROLL &&
          sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1
        ) {
          sc.scrollTop += VITESSE_AUTOSCROLL;
          scrolled = true;
        }
        if (st.lastX < gauche + MARGE_AUTOSCROLL && sc.scrollLeft > 0) {
          sc.scrollLeft -= VITESSE_AUTOSCROLL;
          scrolled = true;
        } else if (
          st.lastX > droite - MARGE_AUTOSCROLL &&
          sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 1
        ) {
          sc.scrollLeft += VITESSE_AUTOSCROLL;
          scrolled = true;
        }
      }
      if (!scrolled) {
        if (st.lastY < MARGE_AUTOSCROLL && window.scrollY > 0) {
          window.scrollBy(0, -VITESSE_AUTOSCROLL);
          scrolled = true;
        } else if (st.lastY > window.innerHeight - MARGE_AUTOSCROLL) {
          window.scrollBy(0, VITESSE_AUTOSCROLL);
          scrolled = true;
        }
      }
      if (scrolled) setHoverCol(etapeFromPoint(st.lastX, st.lastY));
      st.raf = requestAnimationFrame(autoScroll);
    }

    function cleanup() {
      if (st.holdTimer) clearTimeout(st.holdTimer);
      if (st.raf) cancelAnimationFrame(st.raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", blockTouchMove);
      window.removeEventListener("contextmenu", blockContextMenu);
      dragRef.current = null;
      setDraggingId(null);
      setHoverCol(null);
      setGhost(null);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      st.lastX = ev.clientX;
      st.lastY = ev.clientY;
      if (st.aborted) return;
      if (!st.dragging) {
        const dist = Math.hypot(
          ev.clientX - st.startX,
          ev.clientY - st.startY
        );
        if (isTouch) {
          if (dist > SEUIL_TACTILE) {
            st.aborted = true;
            if (st.holdTimer) {
              clearTimeout(st.holdTimer);
              st.holdTimer = null;
            }
          }
          return;
        }
        if (dist <= SEUIL_SOURIS) return;
        startDrag();
      }
      setHoverCol(etapeFromPoint(ev.clientX, ev.clientY));
      setGhost({ x: ev.clientX, y: ev.clientY, titre: st.titre });
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const wasDragging = st.dragging;
      const wasAborted = st.aborted;
      const dropX = ev.clientX;
      const dropY = ev.clientY;
      cleanup();
      if (wasAborted) return;
      // Tap court / clic sans mouvement : ouvre la fiche.
      if (!wasDragging) {
        router.push(`/affaires/${st.affaireId}`);
        return;
      }
      const cle = etapeFromPoint(dropX, dropY);
      if (!cle) return;
      dropAffaire(st.affaireId, cle);
    }

    if (isTouch) {
      st.holdTimer = setTimeout(() => {
        st.holdTimer = null;
        if (dragRef.current === st && !st.aborted) startDrag();
      }, DUREE_APPUI);
      window.addEventListener("contextmenu", blockContextMenu);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  const colonnes = etapes.map((e) => ({
    ...e,
    items: affaires.filter((a) => etapeOf(a) === e.cle),
  }));

  return (
    <div
      ref={boardRef}
      className="overflow-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch", maxHeight: "72vh" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        {colonnes.map((col) => (
          <div
            key={col.cle}
            data-etape={col.cle}
            className={`rounded-xl border bg-slate-50 dark:bg-slate-900/40 ${
              hoverCol === col.cle
                ? "border-slate-900 ring-2 ring-slate-400/40 dark:border-slate-200"
                : "border-slate-200 dark:border-slate-800"
            } flex flex-col min-h-[180px] transition-colors sm:flex-1 sm:min-w-[220px]`}
          >
            {/* En-tête sticky, fond opaque : les cartes défilent dessous. */}
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {col.libelle}
              </h3>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {col.items.length}
              </span>
            </div>
            <div className="min-h-[90px] flex-1 space-y-2 p-2">
              {col.items.length === 0 ? (
                <div className="py-6 text-center text-[11px] italic text-slate-400">
                  {canEdit ? "Glissez une affaire ici" : "Aucune affaire"}
                </div>
              ) : (
                col.items.map((a) => (
                  <AffaireCarteKanban
                    key={a.id}
                    affaire={a}
                    canEdit={canEdit}
                    isDragging={draggingId === a.id}
                    pending={savingId === a.id}
                    onPointerDown={
                      canEdit ? (e) => onCardPointerDown(e, a) : undefined
                    }
                    onClick={
                      !canEdit
                        ? () => router.push(`/affaires/${a.id}`)
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Fantôme suivant le pointeur pendant le drag */}
      {ghost && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 max-w-[220px] truncate rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-lg dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          style={{
            left: ghost.x,
            top: ghost.y,
            transform: "translate(-50%, -130%)",
          }}
        >
          {ghost.titre}
        </div>
      )}
    </div>
  );
}

function AffaireCarteKanban({
  affaire: a,
  canEdit,
  isDragging,
  pending,
  onPointerDown,
  onClick,
}: {
  affaire: AffaireCarte;
  canEdit: boolean;
  isDragging: boolean;
  pending: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      // pan-y : le doigt fait défiler la page tant que l'appui maintenu
      // n'a pas armé le drag (jamais touchAction "none").
      style={canEdit ? { touchAction: "pan-y" } : undefined}
      className={`group rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${
        onClick ? "cursor-pointer" : ""
      } ${canEdit ? "cursor-grab select-none active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-30" : ""
      } ${pending ? "animate-pulse" : ""}`}
    >
      <div className="flex items-start gap-2">
        {/* Pastille AMBRE : action en retard ou affaire sans prochaine
            action (l'ambre est un signal, jamais une décoration). */}
        {a.dormante && (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
            title="Action en retard ou aucune prochaine action"
            aria-label="Affaire dormante"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-slate-900 dark:text-slate-100">
            {a.titre}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
            <Phone size={9} className="shrink-0" />
            {a.contactNom}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
            {a.valeurEstimee !== null && (
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {eurosFmt.format(a.valeurEstimee)} EUR
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 ${
                a.dormante ? "font-medium text-brand-700 dark:text-brand-400" : ""
              }`}
            >
              <CalendarClock size={9} />
              {a.joursEtape} j
            </span>
          </div>
          {/* Badges façon Trello : discrets, absents quand le compte est
              nul (la checklist s'affiche dès qu'elle a des pièces, verte
              quand tout est coché). */}
          {(a.checklistTotal > 0 ||
            a.nbDocuments > 0 ||
            a.nbPhotos > 0 ||
            a.nbMessages > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
              {a.checklistTotal > 0 && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    a.checklistFaits >= a.checklistTotal
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : ""
                  }`}
                  title="Pièces de la checklist"
                >
                  <CheckSquare size={12} />
                  <span className="font-mono tabular-nums">
                    {a.checklistFaits}/{a.checklistTotal}
                  </span>
                </span>
              )}
              {a.nbDocuments > 0 && (
                <span
                  className="inline-flex items-center gap-1"
                  title="Documents du dossier client"
                >
                  <Paperclip size={12} />
                  <span className="font-mono tabular-nums">{a.nbDocuments}</span>
                </span>
              )}
              {a.nbPhotos > 0 && (
                <span className="inline-flex items-center gap-1" title="Photos">
                  <ImageIcon size={12} />
                  <span className="font-mono tabular-nums">{a.nbPhotos}</span>
                </span>
              )}
              {a.nbMessages > 0 && (
                <span
                  className="inline-flex items-center gap-1"
                  title="Messages du fil"
                >
                  <MessageSquare size={12} />
                  <span className="font-mono tabular-nums">{a.nbMessages}</span>
                </span>
              )}
            </div>
          )}
        </div>
        {pending && (
          <Loader2 size={12} className="animate-spin text-slate-400" />
        )}
        {a.responsable && (
          <span
            title={a.responsable.name}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-semibold text-slate-50 dark:bg-slate-100 dark:text-slate-950"
          >
            {initiales(a.responsable.name)}
          </span>
        )}
      </div>
    </div>
  );
}
