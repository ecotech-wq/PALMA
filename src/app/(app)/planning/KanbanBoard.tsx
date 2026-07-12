"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Flag,
  Users,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { setStatut, deleteTache } from "./actions";

type StatutTache = "A_FAIRE" | "EN_COURS" | "TERMINEE" | "BLOQUEE";

export type TacheKanban = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: StatutTache | string;
  priorite: number;
  parentId: string | null;
  equipe: { nom: string } | null;
  chantier: { nom: string };
  labels: { label: { id: string; nom: string; couleur: string } }[];
};

const COLUMNS: {
  key: StatutTache;
  label: string;
  Icon: typeof Clock;
  bg: string;
  /** Fond OPAQUE de l'en-tête sticky : les cartes défilent dessous. */
  headerBg: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    key: "A_FAIRE",
    label: "À faire",
    Icon: Clock,
    bg: "bg-slate-50 dark:bg-slate-900/40",
    headerBg: "bg-slate-50 dark:bg-slate-900",
    badgeBg: "bg-slate-200 dark:bg-slate-800",
    badgeText: "text-slate-700 dark:text-slate-300",
  },
  {
    key: "EN_COURS",
    label: "En cours",
    Icon: AlertCircle,
    bg: "bg-blue-50 dark:bg-blue-950/20",
    headerBg: "bg-blue-50 dark:bg-blue-950",
    badgeBg: "bg-blue-200 dark:bg-blue-900/60",
    badgeText: "text-blue-800 dark:text-blue-300",
  },
  {
    key: "BLOQUEE",
    label: "Bloquée",
    Icon: Ban,
    bg: "bg-red-50 dark:bg-red-950/20",
    headerBg: "bg-red-50 dark:bg-red-950",
    badgeBg: "bg-red-200 dark:bg-red-900/60",
    badgeText: "text-red-800 dark:text-red-300",
  },
  {
    key: "TERMINEE",
    label: "Terminée",
    Icon: CheckCircle2,
    bg: "bg-green-50 dark:bg-green-950/20",
    headerBg: "bg-green-50 dark:bg-green-950",
    badgeBg: "bg-green-200 dark:bg-green-900/60",
    badgeText: "text-green-800 dark:text-green-300",
  },
];

const PRIO_FLAG: Record<number, string> = {
  1: "fill-red-500 stroke-red-600 text-red-600",
  2: "fill-orange-500 stroke-orange-600 text-orange-600",
  3: "fill-blue-500 stroke-blue-600 text-blue-600",
  4: "fill-transparent stroke-slate-400 text-slate-400",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

function isLate(t: TacheKanban) {
  if (t.statut === "TERMINEE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(t.dateFin) < today;
}

/* Réglages du glisser-déposer par Pointer Events */
const SEUIL_SOURIS = 6; // px de mouvement avant de démarrer le drag à la souris
const SEUIL_TACTILE = 8; // px de tolérance pendant l'appui maintenu au doigt
const DUREE_APPUI = 220; // ms d'appui maintenu avant d'armer le drag tactile
const MARGE_AUTOSCROLL = 80; // px du bord (cadre ou écran) déclenchant le défilement
const VITESSE_AUTOSCROLL = 14; // px par frame de défilement automatique

/** État interne d'un geste en cours (une seule instance à la fois). */
type DragState = {
  taskId: string;
  nom: string;
  dragging: boolean;
  aborted: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  raf: number | null;
};

function isStatutTache(v: string | undefined): v is StatutTache {
  return (
    v === "A_FAIRE" || v === "EN_COURS" || v === "BLOQUEE" || v === "TERMINEE"
  );
}

/** Colonne Kanban sous le point (x, y), trouvée via l'attribut [data-col]. */
function colFromPoint(x: number, y: number): StatutTache | null {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest?.("[data-col]") as HTMLElement | null;
  const col = zone?.dataset.col;
  return isStatutTache(col) ? col : null;
}

/**
 * Vue Kanban : 4 colonnes (À faire / En cours / Bloquée / Terminée).
 * Glisser-déposer par Pointer Events, fonctionnel à la souris ET au tactile
 * (l'app est utilisée à 99 % sur téléphone). Même motif que CalendarMonth :
 *  - souris : le drag démarre dès que le mouvement dépasse 6 px ; un clic
 *    sans mouvement ouvre l'édition ;
 *  - tactile : appui maintenu d'environ 220 ms sans bouger de plus de 8 px
 *    pour armer le drag ; avant cela le geste reste un défilement normal
 *    (touchAction "pan-y" sur la carte, jamais "none"). Un tap court ouvre
 *    l'édition. Vibration discrète au démarrage du drag si disponible.
 * La colonne cible est trouvée par elementFromPoint + closest('[data-col]').
 */
export function KanbanBoard({
  taches,
  canEdit,
  onClickTask,
}: {
  taches: TacheKanban[];
  canEdit: boolean;
  /** Tap court / clic sans mouvement sur une carte : ouvre l'édition. */
  onClickTask?: (tacheId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  // Cadre défilant du plateau (72vh) : c'est LUI que l'auto-défilement du
  // drag fait défiler en priorité, la fenêtre ne servant que de secours.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<StatutTache | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Petit fantôme qui suit le doigt (ou la souris) pendant le drag.
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    nom: string;
  } | null>(null);
  // Override visuel optimiste pour déplacer la carte dans la colonne cible
  // en attendant la confirmation du serveur.
  const [statutOverride, setStatutOverride] = useState<
    Record<string, StatutTache>
  >({});

  function statutOf(t: TacheKanban): StatutTache {
    return (statutOverride[t.id] ?? t.statut) as StatutTache;
  }

  // Retire un override quand les props rafraichies l'ont rattrape (anti-flash).
  useEffect(() => {
    setStatutOverride((prev) => {
      let change = false;
      const next = { ...prev };
      for (const [id, col] of Object.entries(prev)) {
        if (savingId === id) continue; // sauvegarde encore en cours
        const t = taches.find((x) => x.id === id);
        if (!t || t.statut === col) {
          delete next[id];
          change = true;
        }
      }
      return change ? next : prev;
    });
  }, [taches, savingId]);

  /** Applique le drop : override optimiste puis action serveur. */
  function dropTask(id: string, col: StatutTache) {
    const t = taches.find((x) => x.id === id);
    if (!t) return;
    if (statutOf(t) === col) return;

    setStatutOverride((prev) => ({ ...prev, [id]: col }));
    setSavingId(id);

    startTransition(async () => {
      try {
        await setStatut(id, col);
        toast.success("Statut modifié");
        // On GARDE l'override : le retirer avant l'arrivee des props
        // rafraichies ferait revenir la carte un instant dans sa colonne
        // d'origine (meme flash que sur le Gantt). L'effet ci-dessous le
        // retire quand les props ont rattrape.
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
        setStatutOverride((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } finally {
        setSavingId(null);
      }
    });
  }

  function onCardPointerDown(e: React.PointerEvent, tache: TacheKanban) {
    if (!canEdit) return;
    // Ignore un second doigt / clic pendant qu'un geste est déjà actif :
    // sinon dragRef serait écrasé et la mauvaise tâche déplacée.
    if (dragRef.current) return;
    // Laisse le bouton "supprimer" (ou tout autre bouton) gérer son clic.
    if ((e.target as HTMLElement).closest("button")) return;
    const isTouch = e.pointerType === "touch";
    if (!isTouch && e.button !== 0) return;
    // À la souris : bloque le démarrage d'une sélection de texte.
    if (!isTouch) e.preventDefault();
    // Capture le pointeur : on continue de recevoir les événements même si
    // le doigt sort de la carte (fiable au tactile).
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture indisponible : on continue sans. */
    }
    const pointerId = e.pointerId;
    const st: DragState = {
      taskId: tache.id,
      nom: tache.nom,
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

    // Pendant un drag tactile, empêche le navigateur de reprendre la main
    // pour faire défiler la page (touchAction "pan-y" resterait actif).
    // L'écouteur doit être non passif pour que preventDefault agisse.
    const blockTouchMove = (tev: TouchEvent) => tev.preventDefault();
    // Empêche le menu contextuel de l'appui long (Android) pendant le geste.
    const blockContextMenu = (cev: Event) => cev.preventDefault();

    function startDrag() {
      st.dragging = true;
      setDraggingId(st.taskId);
      setHoverCol(colFromPoint(st.lastX, st.lastY));
      setGhost({ x: st.lastX, y: st.lastY, nom: st.nom });
      if (isTouch) {
        window.addEventListener("touchmove", blockTouchMove, {
          passive: false,
        });
        // Retour haptique discret au démarrage, si le matériel le permet.
        navigator.vibrate?.(10);
      }
      st.raf = requestAnimationFrame(autoScroll);
    }

    // Défilement automatique quand le pointeur approche d'un bord :
    // indispensable sur mobile, où les 4 colonnes empilées ne tiennent pas
    // toutes dans le cadre. Depuis que le plateau vit dans un cadre 72vh,
    // c'est le CADRE qu'on fait défiler (vertical au 375px, horizontal sur
    // desktop étroit) ; la fenêtre ne sert que de secours quand le cadre
    // est déjà en butée (page plus longue que l'écran).
    function autoScroll() {
      if (!st.dragging || dragRef.current !== st) return;
      let scrolled = false;
      const sc = boardRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        // Bords visibles du cadre (bornés à la fenêtre si le cadre déborde).
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
      // Secours : le cadre est en butée (ou absent), on défile la page.
      if (!scrolled) {
        if (st.lastY < MARGE_AUTOSCROLL && window.scrollY > 0) {
          window.scrollBy(0, -VITESSE_AUTOSCROLL);
          scrolled = true;
        } else if (st.lastY > window.innerHeight - MARGE_AUTOSCROLL) {
          window.scrollBy(0, VITESSE_AUTOSCROLL);
          scrolled = true;
        }
      }
      // Le contenu a bougé sous un doigt immobile : on recalcule la cible.
      if (scrolled) setHoverCol(colFromPoint(st.lastX, st.lastY));
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
          // Avant la fin de l'appui maintenu, un mouvement franc est un
          // défilement : on abandonne le drag et on laisse le navigateur
          // dérouler la page (pan-y).
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
      setHoverCol(colFromPoint(ev.clientX, ev.clientY));
      setGhost({ x: ev.clientX, y: ev.clientY, nom: st.nom });
    }

    // Interruption (défilement repris par le navigateur, 2e doigt,
    // notification, geste système...) : on annule proprement, sans rien
    // modifier ni ouvrir l'édition.
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
      // Tap court / clic sans mouvement : ouvre l'édition.
      if (!wasDragging) {
        onClickTask?.(st.taskId);
        return;
      }
      const col = colFromPoint(dropX, dropY);
      if (!col) return;
      dropTask(st.taskId, col);
    }

    if (isTouch) {
      // Appui maintenu : le drag ne s'arme qu'après DUREE_APPUI ms sans
      // bouger de plus de SEUIL_TACTILE px. Avant cela, le geste reste un
      // défilement (ou un tap) normal.
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

  const columns = COLUMNS.map((c) => ({
    ...c,
    items: taches.filter((t) => statutOf(t) === c.key),
  }));

  return (
    // Cadre du plateau (même confort que le Gantt) : hauteur bornée à 72vh,
    // défilement interne vertical (mobile : colonnes empilées) ET horizontal
    // (desktop : 4 colonnes en ligne qui ne rétrécissent pas sous 240px).
    // Les en-têtes de colonne restent sticky en haut du cadre.
    <div
      ref={boardRef}
      className="overflow-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch", maxHeight: "72vh" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        {columns.map((col) => (
          <div
            key={col.key}
            data-col={col.key}
            className={`rounded-xl border ${col.bg} ${
              hoverCol === col.key
                ? "border-brand-500 ring-2 ring-brand-300/50"
                : "border-slate-200 dark:border-slate-800"
            } flex flex-col min-h-[200px] transition-colors sm:flex-1 sm:min-w-[240px]`}
          >
            {/* En-tête sticky : reste visible en haut du cadre pendant le
                défilement des cartes (fond opaque, les cartes passent
                dessous). */}
            <div
              className={`sticky top-0 z-10 rounded-t-xl ${col.headerBg} px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2`}
            >
              <col.Icon size={14} className="text-slate-500 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">
                {col.label}
              </h3>
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText} tabular-nums`}
              >
                {col.items.length}
              </span>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[100px]">
              {col.items.length === 0 ? (
                <div className="text-[11px] text-slate-400 italic text-center py-6">
                  {canEdit ? "Glissez une tâche ici" : "Aucune tâche"}
                </div>
              ) : (
                col.items.map((t) => (
                  <KanbanCard
                    key={t.id}
                    tache={t}
                    canEdit={canEdit}
                    isDragging={draggingId === t.id}
                    pending={savingId === t.id}
                    onPointerDown={
                      canEdit ? (e) => onCardPointerDown(e, t) : undefined
                    }
                    onClick={
                      !canEdit && onClickTask
                        ? () => onClickTask(t.id)
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Fantôme suivant le pointeur pendant le drag (au-dessus du doigt) */}
      {ghost && (
        <div
          aria-hidden="true"
          className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 shadow-lg text-xs font-medium text-slate-900 dark:text-slate-100 max-w-[220px] truncate"
          style={{
            left: ghost.x,
            top: ghost.y,
            transform: "translate(-50%, -130%)",
          }}
        >
          {ghost.nom}
        </div>
      )}
    </div>
  );
}

function KanbanCard({
  tache: t,
  canEdit,
  isDragging,
  pending,
  onPointerDown,
  onClick,
}: {
  tache: TacheKanban;
  canEdit: boolean;
  isDragging: boolean;
  pending: boolean;
  /** Démarre le suivi Pointer Events (drag + tap) quand l'édition est permise. */
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Clic simple (mode lecture seule uniquement). */
  onClick?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const late = isLate(t);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer cette tâche ?")) return;
    deleteTache(t.id)
      .then(() => {
        toast.success("Tâche supprimée");
        router.refresh();
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Erreur");
      });
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      // pan-y : le doigt peut toujours faire défiler la page verticalement ;
      // le drag ne s'arme qu'après l'appui maintenu (jamais touchAction "none").
      style={canEdit ? { touchAction: "pan-y" } : undefined}
      className={`bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 shadow-sm hover:shadow-md transition group ${
        onClick ? "cursor-pointer" : ""
      } ${canEdit ? "cursor-grab active:cursor-grabbing select-none" : ""} ${
        isDragging ? "opacity-30" : ""
      } ${pending ? "animate-pulse" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {t.priorite < 4 && (
          <Flag
            size={12}
            className={`shrink-0 mt-0.5 ${PRIO_FLAG[t.priorite]}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-medium leading-snug ${
              t.statut === "TERMINEE"
                ? "line-through text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {t.parentId && <span className="text-slate-400 mr-1">↳</span>}
            {t.nom}
          </p>
          <p className="text-[10px] text-brand-700 dark:text-brand-400 truncate mt-0.5">
            {t.chantier.nom}
          </p>
          <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {t.equipe && (
              <span className="inline-flex items-center gap-0.5">
                <Users size={9} />
                {t.equipe.nom}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 ${
                late ? "text-red-600 font-medium" : ""
              }`}
            >
              <Calendar size={9} />
              {dateFmt.format(new Date(t.dateFin))}
            </span>
            {t.avancement > 0 && t.avancement < 100 && (
              <span className="text-blue-600">{t.avancement}%</span>
            )}
            {t.labels.map((tl) => (
              <span
                key={tl.label.id}
                className="px-1 rounded font-medium"
                style={{
                  backgroundColor: tl.label.couleur + "33",
                  color: tl.label.couleur,
                }}
              >
                {tl.label.nom}
              </span>
            ))}
          </div>
        </div>
        {pending && <Loader2 size={12} className="animate-spin text-slate-400" />}
        {canEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className="shrink-0 -mr-1 -mt-0.5 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 sm:opacity-0 sm:group-hover:opacity-100 transition"
            title="Supprimer la tâche"
            aria-label="Supprimer la tâche"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
