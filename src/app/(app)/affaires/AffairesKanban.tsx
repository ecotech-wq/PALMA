"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckSquare,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { PhotoVignette } from "@/components/PhotoVignette";
import type { ChecklistItem } from "@/lib/affaires";
import type { AccentPipeline } from "@/lib/pipelines";
import { changerEtape, cocherChecklist, creerAffaireRapide } from "./actions";
import { FeuillePiece, type DocPiece } from "./FeuillePiece";

/* -------------------------------------------------------------------------
 *  Kanban des affaires : colonnes = étapes de la procédure active. Même
 *  motif tactile que le KanbanBoard du planning (Pointer Events, appui
 *  maintenu 220 ms au doigt, anti-flash par override optimiste, colonnes
 *  sticky, cadre 72vh) : l'app vit sur téléphone.
 *
 *  Cartes façon Trello : couverture photo (dernière photo du dossier
 *  client), badges cliquables (checklist dépliable sur place, dossier
 *  client, fil de discussion toujours à un tap), et « + Ajouter une
 *  affaire » au pied de chaque colonne (titre seul, le reste se complète
 *  sur la fiche). Les couleurs viennent de la palette des procédures
 *  (lib/pipelines.ts), jamais d'un hex local.
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
  /** Couverture façon Trello : la photo la plus récente du dossier client
   *  (URL d'origine, la vignette calcule elle-même sa miniature). */
  couverture: string | null;
  /** Pièces de la checklist, dépliables sous la carte. */
  checklist: ChecklistItem[];
  /** cle de checklist -> document validant (AffaireDocument.checklistCle),
   *  même calcul que le fil et la fiche : cocher une pièce SANS document
   *  ouvre la feuille « joindre le fichier » (comportement unique des
   *  trois surfaces de coche). */
  docsChecklist: Record<string, DocPiece>;
};

export type ColonneEtape = { cle: string; libelle: string };

/** Affaire créée depuis le pied de colonne, en attente du serveur
 *  (anti-flash : la carte fantôme reste jusqu'à ce que la vraie arrive). */
type AffaireFantome = {
  tempId: string;
  etapeCle: string;
  titre: string;
  /** Id serveur une fois la création confirmée (null tant que ça crée). */
  id: string | null;
};

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

/** Demande d'ouverture de la feuille « joindre le fichier » émise par la
 *  checklist d'une carte. La feuille est rendue à la RACINE du plateau
 *  (comme le fantôme de drag) : les colonnes portent un backdrop-blur qui
 *  ferait d'elles le bloc conteneur d'un descendant `fixed`, la feuille se
 *  retrouverait rognée dans la colonne. Les rappels referment sur l'état
 *  optimiste de la carte émettrice. */
type DemandePiece = {
  affaireId: string;
  cle: string;
  libelle: string;
  marquerSansFichier: () => void;
  fichierJoint: () => void;
};

const eurosFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AffairesKanban({
  affaires,
  etapes,
  canEdit,
  pipelineId,
  accent,
}: {
  affaires: AffaireCarte[];
  etapes: ColonneEtape[];
  canEdit: boolean;
  /** Procédure affichée : la création rapide naît dans SES étapes. */
  pipelineId: string;
  /** Accent de la procédure (palette de lib/pipelines.ts) : liseré des
   *  colonnes. Des chaînes de classes, sérialisables serveur -> client. */
  accent: AccentPipeline;
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
  // Créations rapides en vol : cartes fantômes au pied des colonnes.
  const [fantomes, setFantomes] = useState<AffaireFantome[]>([]);
  // Feuille « joindre le fichier » demandée par la checklist d'une carte
  // (null = fermée), rendue à la racine du plateau (voir DemandePiece).
  const [feuillePiece, setFeuillePiece] = useState<DemandePiece | null>(null);

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

  // Retire une carte fantôme quand la vraie affaire est arrivée dans les
  // props (jamais avant : sinon la carte disparaîtrait un instant).
  useEffect(() => {
    setFantomes((prev) => {
      const next = prev.filter(
        (f) => !(f.id && affaires.some((a) => a.id === f.id))
      );
      return next.length === prev.length ? prev : next;
    });
  }, [affaires]);

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
    // Les commandes de la carte (badges-liens, checklist, boutons) sont
    // des zones distinctes : jamais un début de drag.
    if ((e.target as HTMLElement).closest("button, a, input, label")) return;
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
    fantomes: fantomes.filter((f) => f.etapeCle === e.cle),
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
            // Fond translucide + flou léger : le plateau laisse respirer la
            // page sans sacrifier la lisibilité (vérifié clair ET sombre).
            className={`relative rounded-xl border bg-white/60 backdrop-blur-sm dark:bg-slate-900/50 ${
              hoverCol === col.cle
                ? "border-slate-900 ring-2 ring-slate-400/40 dark:border-slate-200"
                : "border-slate-200 dark:border-slate-800"
            } flex flex-col min-h-[180px] transition-colors sm:flex-1 sm:min-w-[220px]`}
          >
            {/* Liseré gauche à la couleur de la procédure (palette des
                pipelines : un seul endroit pour changer l'accent). */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl ${accent.pastille}`}
            />
            {/* En-tête sticky, semi-opaque + flou : les cartes défilent
                dessous en restant lisibles. */}
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-xl border-b border-slate-200 bg-white/75 px-3 py-2 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/75">
              <h3 className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {col.libelle}
              </h3>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {col.items.length}
              </span>
            </div>
            <div className="min-h-[90px] flex-1 space-y-2 p-2">
              {col.items.length === 0 && col.fantomes.length === 0 ? (
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
                    onDemanderPiece={setFeuillePiece}
                  />
                ))
              )}
              {/* Cartes fantômes des créations rapides en vol. */}
              {col.fantomes.map((f) => (
                <div
                  key={f.tempId}
                  className="animate-pulse rounded-lg border border-dashed border-slate-300 bg-white/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <p className="text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">
                    {f.titre}
                  </p>
                  <p className="mt-0.5 text-[10px] italic text-slate-400">
                    Création...
                  </p>
                </div>
              ))}
            </div>
            {/* « + Ajouter une affaire » au pied de la colonne, façon
                Trello : un titre suffit, la fiche complètera le reste. */}
            {canEdit && (
              <div className="p-2 pt-0">
                <AjoutRapideAffaire
                  pipelineId={pipelineId}
                  etapeCle={col.cle}
                  onOptimiste={(f) => setFantomes((prev) => [...prev, f])}
                  onSucces={(tempId, id) =>
                    setFantomes((prev) =>
                      prev.map((f) => (f.tempId === tempId ? { ...f, id } : f))
                    )
                  }
                  onEchec={(tempId) =>
                    setFantomes((prev) =>
                      prev.filter((f) => f.tempId !== tempId)
                    )
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Feuille « joindre le fichier » : à la racine du plateau, hors des
          colonnes (leur backdrop-blur rognerait un descendant fixed). */}
      {feuillePiece && (
        <FeuillePiece
          affaireId={feuillePiece.affaireId}
          cle={feuillePiece.cle}
          libelle={feuillePiece.libelle}
          onMarquerSansFichier={feuillePiece.marquerSansFichier}
          onFichierJoint={feuillePiece.fichierJoint}
          onClose={() => setFeuillePiece(null)}
        />
      )}

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

/* -------------------------------------------------------------------------
 *  Carte
 * ----------------------------------------------------------------------- */

function AffaireCarteKanban({
  affaire: a,
  canEdit,
  isDragging,
  pending,
  onPointerDown,
  onClick,
  onDemanderPiece,
}: {
  affaire: AffaireCarte;
  canEdit: boolean;
  isDragging: boolean;
  pending: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
  /** Ouvre la feuille « joindre le fichier » rendue à la racine du plateau. */
  onDemanderPiece: (demande: DemandePiece) => void;
}) {
  const [checklistOuverte, setChecklistOuverte] = useState(false);

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      // pan-y : le doigt fait défiler la page tant que l'appui maintenu
      // n'a pas armé le drag (jamais touchAction "none").
      style={canEdit ? { touchAction: "pan-y" } : undefined}
      className={`group overflow-hidden rounded-lg border border-slate-200 bg-white/85 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 ${
        onClick ? "cursor-pointer" : ""
      } ${canEdit ? "cursor-grab select-none active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-30" : ""
      } ${pending ? "animate-pulse" : ""}`}
    >
      {/* Couverture façon Trello : la photo la plus récente du dossier
          client, en miniature légère (PhotoVignette gère le fallback). */}
      {a.couverture && (
        <PhotoVignette
          url={a.couverture}
          alt=""
          draggable={false}
          className="h-[72px] w-full select-none object-cover"
        />
      )}
      <div className="p-2.5">
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
              {a.contactNom || (
                <span className="italic text-slate-400">
                  Contact à compléter
                </span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
              {a.valeurEstimee !== null && (
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {eurosFmt.format(a.valeurEstimee)} EUR
                </span>
              )}
              <span
                className={`inline-flex items-center gap-0.5 ${
                  a.dormante
                    ? "font-medium text-brand-700 dark:text-brand-400"
                    : ""
                }`}
              >
                <CalendarClock size={9} />
                {a.joursEtape} j
              </span>
            </div>
            {/* Badges façon Trello, CLIQUABLES : la checklist se déplie
                sur place, le trombone ouvre le dossier client, la bulle
                rejoint le fil (toujours présente, même à zéro message).
                Cibles 44 px par débord vertical (-my) ; le débord latéral
                (-mx-0.5) reste INFÉRIEUR au demi-écart (gap-x-1.5) pour
                que les zones de tap voisines ne se chevauchent jamais.
                Zones distinctes du drag (le pointerdown ignore
                boutons/liens). */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-slate-500 dark:text-slate-400">
              {a.checklistTotal > 0 && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChecklistOuverte((v) => !v);
                  }}
                  aria-expanded={checklistOuverte}
                  title="Pièces de la checklist"
                  className={`-mx-0.5 -my-2.5 inline-flex min-h-11 items-center gap-1 rounded px-1 ${
                    a.checklistFaits >= a.checklistTotal
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : ""
                  }`}
                >
                  <CheckSquare size={12} />
                  <span className="font-mono tabular-nums">
                    {a.checklistFaits}/{a.checklistTotal}
                  </span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform ${
                      checklistOuverte ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
              {a.nbDocuments > 0 && (
                <Link
                  href={`/affaires/${a.id}/documents`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  title="Ouvrir le dossier client"
                  className="-mx-0.5 -my-2.5 inline-flex min-h-11 items-center gap-1 rounded px-1"
                >
                  <Paperclip size={12} />
                  <span className="font-mono tabular-nums">
                    {a.nbDocuments}
                  </span>
                </Link>
              )}
              {a.nbPhotos > 0 && (
                <span className="inline-flex items-center gap-1" title="Photos">
                  <ImageIcon size={12} />
                  <span className="font-mono tabular-nums">{a.nbPhotos}</span>
                </span>
              )}
              <Link
                href={`/messagerie/affaire/${a.id}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                title="Ouvrir le fil de discussion"
                aria-label="Ouvrir le fil de discussion"
                className="-mx-0.5 -my-2.5 inline-flex min-h-11 items-center gap-1 rounded px-1 text-slate-600 dark:text-slate-300"
              >
                <MessageSquare size={12} />
                {a.nbMessages > 0 && (
                  <span className="font-mono tabular-nums">
                    {a.nbMessages}
                  </span>
                )}
              </Link>
            </div>
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
      {/* Checklist dépliée SOUS le contenu de la carte : cocher/décocher
          sur place (état optimiste, comme la feuille du fil), zone
          protégée du drag (stopPropagation). */}
      {checklistOuverte && a.checklist.length > 0 && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="border-t border-slate-100 px-1.5 pb-1 dark:border-slate-800"
        >
          <ChecklistCarte
            affaireId={a.id}
            items={a.checklist}
            docs={a.docsChecklist}
            canEdit={canEdit}
            onDemanderPiece={onDemanderPiece}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 *  Checklist dépliable de la carte : même mécanique optimiste que la
 *  feuille « Pièces du dossier » du fil (cocherChecklist + rollback +
 *  toast), en plus compact. Lignes de 44 px : l'app vit au pouce.
 *  Même comportement que le fil et la fiche : cocher une pièce qu'AUCUN
 *  document ne valide encore ouvre la feuille partagée FeuillePiece
 *  (joindre le fichier, ou marquer reçue sans fichier) ; décocher, ou
 *  cocher une pièce déjà validée par un fichier, reste un geste direct.
 * ----------------------------------------------------------------------- */

function ChecklistCarte({
  affaireId,
  items,
  docs,
  canEdit,
  onDemanderPiece,
}: {
  affaireId: string;
  items: ChecklistItem[];
  /** cle de checklist -> document validant (AffaireDocument.checklistCle). */
  docs: Record<string, DocPiece>;
  canEdit: boolean;
  /** Ouvre la feuille « joindre le fichier » (rendue à la racine du
   *  plateau) ; les rappels transmis referment sur NOTRE état optimiste. */
  onDemanderPiece: (demande: DemandePiece) => void;
}) {
  // Surcouche optimiste : cle -> valeur affichée en attendant le serveur.
  // Conservée après succès (elle coïncide alors avec l'état revalidé).
  const [optimiste, setOptimiste] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const affiches = items.map((it) => ({
    ...it,
    fait: optimiste[it.cle] ?? it.fait,
  }));

  function cocher(cle: string, fait: boolean) {
    setOptimiste((prev) => ({ ...prev, [cle]: fait }));
    startTransition(async () => {
      try {
        await cocherChecklist(affaireId, cle, fait);
        router.refresh();
      } catch (err) {
        // Échec : la case revient à sa valeur serveur.
        setOptimiste((prev) => {
          const suivant = { ...prev };
          delete suivant[cle];
          return suivant;
        });
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <ul>
      {affiches.map((it) => {
        const doc = docs[it.cle];
        return (
          <li key={it.cle} className="flex items-center gap-1">
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <input
                type="checkbox"
                checked={it.fait}
                disabled={!canEdit}
                onChange={(e) => {
                  // Cocher une pièce que rien ne valide encore :
                  // proposer d'abord de joindre le fichier (feuille
                  // partagée). Décocher, ou cocher une pièce déjà
                  // validée par un document : geste direct.
                  if (e.target.checked && !doc) {
                    onDemanderPiece({
                      affaireId,
                      cle: it.cle,
                      libelle: it.libelle,
                      marquerSansFichier: () => cocher(it.cle, true),
                      fichierJoint: () => {
                        // Le serveur a déjà coché la case et posé la
                        // trace : la surcouche optimiste la montre tout
                        // de suite, la revalidation confirme et fait
                        // apparaître le trombone.
                        setOptimiste((prev) => ({
                          ...prev,
                          [it.cle]: true,
                        }));
                        router.refresh();
                      },
                    });
                    return;
                  }
                  cocher(it.cle, e.target.checked);
                }}
                className="h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-200"
              />
              <span
                className={
                  it.fait
                    ? "min-w-0 truncate text-slate-400 line-through"
                    : "min-w-0 truncate text-slate-700 dark:text-slate-300"
                }
              >
                {it.libelle}
              </span>
            </label>
            {/* Pièce validée par un document de la GED : le trombone
                ouvre le fichier (cible 44 px, jamais au survol seul). */}
            {doc && (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                title={`Voir le document : ${doc.nom}`}
                aria-label={`Voir le document : ${doc.nom}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <Paperclip size={13} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 *  Ajout rapide au pied de colonne : un titre, Entrée valide, Échap
 *  annule. La carte fantôme apparaît immédiatement (anti-flash), le toast
 *  de succès offre « Ouvrir la fiche ». Le champ reste ouvert pour
 *  enchaîner plusieurs affaires, façon Trello.
 * ----------------------------------------------------------------------- */

function AjoutRapideAffaire({
  pipelineId,
  etapeCle,
  onOptimiste,
  onSucces,
  onEchec,
}: {
  pipelineId: string;
  etapeCle: string;
  onOptimiste: (f: AffaireFantome) => void;
  onSucces: (tempId: string, id: string) => void;
  onEchec: (tempId: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (ouvert) inputRef.current?.focus();
  }, [ouvert]);

  function fermer() {
    setOuvert(false);
    setTitre("");
  }

  function valider() {
    const t = titre.trim();
    if (!t) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onOptimiste({ tempId, etapeCle, titre: t, id: null });
    setTitre("");
    inputRef.current?.focus();
    startTransition(async () => {
      try {
        const { id } = await creerAffaireRapide({
          pipelineId,
          etapeCle,
          titre: t,
        });
        onSucces(tempId, id);
        toast.success("Affaire créée", {
          label: "Ouvrir la fiche",
          href: `/affaires/${id}`,
        });
        router.refresh();
      } catch (err) {
        onEchec(tempId);
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Plus size={14} />
        Ajouter une affaire
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        valider();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="rounded-lg border border-slate-200 bg-white/85 p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
    >
      <input
        ref={inputRef}
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") fermer();
        }}
        placeholder="Titre de l'affaire"
        maxLength={120}
        aria-label="Titre de la nouvelle affaire"
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <div className="mt-1.5 flex items-center gap-1">
        <button
          type="submit"
          disabled={titre.trim().length === 0}
          className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Ajouter
        </button>
        <button
          type="button"
          onClick={fermer}
          aria-label="Annuler l'ajout"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>
    </form>
  );
}
