"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Package,
  Truck,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import { deplacerTache } from "./actions";
import {
  buildMonthGrid,
  buildWeek,
  chunkWeeks,
  dayKey,
  daysBetweenKeys,
  parseKey,
  shiftKey,
  startOfMonth,
  startOfWeek,
} from "./calendrier/dates";
import {
  compterMasques,
  nbLanes,
  segmenterSemaine,
  type Plage,
} from "./calendrier/segments";

/* -------------------------------------------------------------------------
 *  Vue calendrier façon Google Calendar : mois ET semaine (bascule
 *  persistée en localStorage).
 *
 *  - Pilules MULTI-JOURS continues : une tâche de 4 jours = une barre qui
 *    traverse les cellules de sa semaine, segmentée par semaine, arrondie
 *    à ses extrémités réelles. Couleur par statut (mêmes teintes que le
 *    Gantt). Empilement par « lanes » (calendrier/segments.ts).
 *  - Glisser une pilule = reprogrammer (Pointer Events : souris ET
 *    tactile, capture + pointercancel + garde multi-touch).
 *  - Tirer une extrémité (poignées au survol desktop, toujours visibles
 *    au tactile sur la pilule sélectionnée) = changer dateDebut/dateFin.
 *  - Cliquer-glisser sur des cases vides (souris) = créer une tâche
 *    couvrant la plage (onEmptyRangeClick). Au tactile, le doigt reste
 *    dédié au défilement : le bouton « + ajouter » crée sur un jour.
 *  - Anti-flash (motif GanttChartV2) : après un dépôt ou un étirement,
 *    les dates affichées restent sur la valeur envoyée au serveur
 *    (cible) jusqu'à ce que les props rafraîchies l'aient rattrapée.
 *  - « +N autres » ouvre le détail du jour (liste complète).
 * ----------------------------------------------------------------------- */

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  equipe: { id: string; nom: string } | null;
  chantier: { id: string; nom: string };
};

type Event = {
  id: string;
  realId: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date | string;
};

type ModeCal = "mois" | "semaine";

const LS_MODE = "lynx.calendrier.mode";

const monthFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

const weekRangeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Couleurs par statut, identiques aux barres du Gantt. */
const STATUT_PILL: Record<string, string> = {
  A_FAIRE: "bg-slate-400 border-slate-500",
  EN_COURS: "bg-blue-500 border-blue-600",
  TERMINEE: "bg-green-500 border-green-600",
  BLOQUEE: "bg-red-500 border-red-600",
};

/** Barre de priorité (détail du jour uniquement). */
const PRIO_BAR: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-blue-500",
  4: "bg-slate-400",
};

/** Géométrie des rangées selon le mode (px). */
const GEO = {
  mois: { header: 24, lane: 24, pill: 20, lanesMax: 3, pied: 18 },
  semaine: { header: 26, lane: 30, pill: 26, lanesMax: Infinity, pied: 8 },
} as const;

/* Réglages du défilement de bord pendant un geste (motif KanbanBoard). */
const MARGE_AUTOSCROLL = 80; // px du bord (cadre ou écran) déclenchant le défilement
const VITESSE_AUTOSCROLL = 14; // px par frame de défilement automatique

/**
 * Défilement automatique de bord pendant un drag ou un étirement : le
 * pointeur est capturé et touchAction vaut "none", le cadre 72vh ne peut
 * donc plus être défilé au doigt ; sans ceci, impossible de déposer sur
 * une semaine hors de la zone visible (mois à 6 semaines sur petit
 * écran). Motif repris du KanbanBoard : le CADRE défile en priorité
 * quand le pointeur approche de ses bords visibles, la fenêtre en
 * secours quand le cadre est en butée. `point` est muté par le geste ;
 * `surDefilement` recalcule la cible sous un doigt immobile (le contenu
 * a bougé sous lui). Retourne la fonction d'arrêt (cleanup du geste).
 */
function demarrerAutoScrollBords(
  cadre: HTMLElement | null,
  point: { x: number; y: number },
  surDefilement: () => void
): () => void {
  let raf = 0;
  const tick = () => {
    let scrolled = false;
    if (cadre) {
      const rect = cadre.getBoundingClientRect();
      // Bords visibles du cadre (bornés à la fenêtre si le cadre déborde).
      const haut = Math.max(rect.top, 0);
      const bas = Math.min(rect.bottom, window.innerHeight);
      const gauche = Math.max(rect.left, 0);
      const droite = Math.min(rect.right, window.innerWidth);
      if (point.y < haut + MARGE_AUTOSCROLL && cadre.scrollTop > 0) {
        cadre.scrollTop -= VITESSE_AUTOSCROLL;
        scrolled = true;
      } else if (
        point.y > bas - MARGE_AUTOSCROLL &&
        cadre.scrollTop + cadre.clientHeight < cadre.scrollHeight - 1
      ) {
        cadre.scrollTop += VITESSE_AUTOSCROLL;
        scrolled = true;
      }
      if (point.x < gauche + MARGE_AUTOSCROLL && cadre.scrollLeft > 0) {
        cadre.scrollLeft -= VITESSE_AUTOSCROLL;
        scrolled = true;
      } else if (
        point.x > droite - MARGE_AUTOSCROLL &&
        cadre.scrollLeft + cadre.clientWidth < cadre.scrollWidth - 1
      ) {
        cadre.scrollLeft += VITESSE_AUTOSCROLL;
        scrolled = true;
      }
    }
    // Secours : le cadre est en butée (ou absent), on défile la page.
    if (!scrolled) {
      if (point.y < MARGE_AUTOSCROLL && window.scrollY > 0) {
        window.scrollBy(0, -VITESSE_AUTOSCROLL);
        scrolled = true;
      } else if (point.y > window.innerHeight - MARGE_AUTOSCROLL) {
        window.scrollBy(0, VITESSE_AUTOSCROLL);
        scrolled = true;
      }
    }
    if (scrolled) surDefilement();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function CalendarMonth({
  taches,
  events,
  canEdit,
  onClickTask,
  onEmptyCellClick,
  onEmptyRangeClick,
  defaultChantierId,
  chantiers,
}: {
  taches: Tache[];
  events: Event[];
  canEdit: boolean;
  onClickTask?: (id: string) => void;
  onEmptyCellClick?: (date: Date, chantierNom: string) => void | Promise<void>;
  /** Cliquer-glisser sur des cases vides : créer une tâche sur la plage. */
  onEmptyRangeClick?: (
    dateDebut: Date,
    dateFin: Date,
    chantierNom: string
  ) => void | Promise<void>;
  defaultChantierId?: string;
  chantiers: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const todayKey = dayKey(today);

  const [mode, setMode] = useState<ModeCal>("mois");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(today));

  // Mode persisté, lu APRÈS le premier rendu (pas d'écart d'hydratation
  // SSR/client) : même motif que le réglage « Entraîner » du Gantt.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_MODE);
      if (v === "semaine") {
        setMode("semaine");
        setCursor(startOfWeek(new Date()));
      }
    } catch {
      /* stockage indisponible : on reste en mode mois */
    }
  }, []);

  // ---- Gestes (déplacement, étirement, création) --------------------------
  // Cadre défilant de la grille (72vh) : c'est LUI que l'auto-défilement
  // de bord fait défiler pendant un drag/étirement de pilule.
  const cadreRef = useRef<HTMLDivElement | null>(null);
  // Garde multi-geste : un seul geste à la fois. Un second doigt (ou un
  // second bouton) est ignoré tant que le premier geste est actif.
  const gesteRef = useRef(false);
  const dragRef = useRef<{
    taskId: string;
    grabKey: string;
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Pilule sélectionnée (tap) : poignées d'étirement visibles au tactile.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Détail d'un jour (ouvert via « +N autres »).
  const [dayDetailKey, setDayDetailKey] = useState<string | null>(null);
  // Plage en cours de création par cliquer-glisser sur les cases vides.
  const [plageCreation, setPlageCreation] = useState<{
    a: string;
    b: string;
  } | null>(null);

  // Anti-flash (motif GanttChartV2) : dates affichées localement pendant
  // et après un geste ; `cible` note les clés envoyées au serveur, et
  // l'effet ci-dessous ne retire l'override que quand les props
  // rafraîchies les ont rattrapées (sinon la pilule reviendrait un
  // instant à sa position d'origine).
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        debutKey: string;
        finKey: string;
        cible?: { debutKey: string; finKey: string };
      }
    >
  >({});
  const overridesRef = useRef(overrides);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    setOverrides((prev) => {
      let change = false;
      const next = { ...prev };
      for (const [id, ov] of Object.entries(prev)) {
        if (!ov.cible) continue; // geste encore en cours
        const t = taches.find((x) => x.id === id);
        const rattrape =
          t &&
          dayKey(new Date(t.dateDebut)) === ov.cible.debutKey &&
          dayKey(new Date(t.dateFin)) === ov.cible.finKey;
        if (!t || rattrape) {
          delete next[id];
          change = true;
        }
      }
      return change ? next : prev;
    });
  }, [taches]);

  const tacheById = useMemo(
    () => new Map(taches.map((t) => [t.id, t])),
    [taches]
  );

  /** Dates affichées d'une tâche (override anti-flash sinon props). */
  function datesAffichees(t: Tache): { debutKey: string; finKey: string } {
    const ov = overridesRef.current[t.id];
    if (ov) return { debutKey: ov.debutKey, finKey: ov.finKey };
    return {
      debutKey: dayKey(new Date(t.dateDebut)),
      finKey: dayKey(new Date(t.dateFin)),
    };
  }

  // Plages rendues (avec overrides) : matière première des segments.
  const plages: Plage[] = useMemo(
    () =>
      taches.map((t) => {
        const ov = overrides[t.id];
        return {
          id: t.id,
          debutKey: ov?.debutKey ?? dayKey(new Date(t.dateDebut)),
          finKey: ov?.finKey ?? dayKey(new Date(t.dateFin)),
        };
      }),
    [taches, overrides]
  );

  /** Jour sous le point (x, y) : rangée [data-weekdays] + colonne. Marche
   *  aussi quand le pointeur est au-dessus d'une pilule (la rangée est
   *  son ancêtre), là où un ciblage par cellule échouerait. */
  function dayKeyFromPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest?.("[data-weekdays]") as HTMLElement | null;
    if (!row?.dataset.weekdays) return null;
    const keys = row.dataset.weekdays.split(",");
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const col = Math.min(
      6,
      Math.max(0, Math.floor(((x - rect.left) / rect.width) * 7))
    );
    return keys[col] ?? null;
  }

  function retirerOverride(id: string) {
    setOverrides((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  // ---- Geste 1 : glisser une pilule = reprogrammer (durée conservée) ------
  function onPillPointerDown(e: React.PointerEvent, tache: Tache) {
    if (!canEdit) {
      if (onClickTask) onClickTask(tache.id);
      return;
    }
    if (gesteRef.current) return;
    gesteRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    // Sélection : rend les poignées d'étirement visibles au tactile.
    setSelectedId(tache.id);
    // Capture du pointeur : on continue de recevoir les événements même
    // si le doigt sort de la pilule (fiable au tactile).
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture indisponible : on continue sans. */
    }
    const pointerId = e.pointerId;
    const grabKey =
      dayKeyFromPoint(e.clientX, e.clientY) ?? datesAffichees(tache).debutKey;
    dragRef.current = {
      taskId: tache.id,
      grabKey,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
    };
    // Dernière position du pointeur (mutée par onMove) : lue par
    // l'auto-défilement de bord pour recalculer la cible sous un doigt
    // immobile pendant que le cadre défile.
    const dernier = { x: e.clientX, y: e.clientY };
    let stopAutoScroll: (() => void) | null = null;

    function cleanup() {
      stopAutoScroll?.();
      stopAutoScroll = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragRef.current = null;
      gesteRef.current = false;
      setDraggingId(null);
      setOverKey(null);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const st = dragRef.current;
      if (!st) return;
      dernier.x = ev.clientX;
      dernier.y = ev.clientY;
      const dist = Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY);
      if (!st.moved && dist > 6) {
        st.moved = true;
        setDraggingId(st.taskId);
        // Le pointeur est capturé et touchAction "none" : le cadre 72vh
        // ne défile plus au doigt, l'auto-défilement de bord prend le
        // relais pour atteindre les semaines hors de la zone visible.
        stopAutoScroll = demarrerAutoScrollBords(cadreRef.current, dernier, () =>
          setOverKey(dayKeyFromPoint(dernier.x, dernier.y))
        );
      }
      if (!st.moved) return;
      setOverKey(dayKeyFromPoint(ev.clientX, ev.clientY));
    }

    // Interruption (2e doigt, notification, geste navigateur) : on annule
    // proprement sans déplacer ni ouvrir la modale.
    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const st = dragRef.current;
      const moved = st?.moved ?? false;
      const taskId = st?.taskId;
      const gKey = st?.grabKey;
      cleanup();
      if (!taskId || !gKey) return;

      // Simple clic (pas de déplacement) : on ouvre l'édition.
      if (!moved) {
        if (onClickTask) onClickTask(taskId);
        return;
      }
      const dropKey = dayKeyFromPoint(ev.clientX, ev.clientY);
      if (!dropKey || dropKey === gKey) return;
      const delta = daysBetweenKeys(gKey, dropKey);
      if (delta === 0) return;
      const t = tacheById.get(taskId);
      if (!t) return;
      const av = datesAffichees(t);
      const nDebutKey = shiftKey(av.debutKey, delta);
      const nFinKey = shiftKey(av.finKey, delta);
      // Anti-flash : la pilule saute tout de suite sur ses nouvelles
      // dates et y reste jusqu'au rattrapage des props (ou l'erreur).
      setOverrides((prev) => ({
        ...prev,
        [taskId]: {
          debutKey: nDebutKey,
          finKey: nFinKey,
          cible: { debutKey: nDebutKey, finKey: nFinKey },
        },
      }));
      setSavingId(taskId);
      deplacerTache(taskId, parseKey(nDebutKey), parseKey(nFinKey))
        .then(() => router.refresh())
        .catch((err: unknown) => {
          retirerOverride(taskId);
          toast.error(
            err instanceof Error ? err.message : "Erreur de déplacement"
          );
        })
        .finally(() => setSavingId(null));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // ---- Geste 2 : tirer une extrémité = étirer (dateDebut OU dateFin) ------
  function onHandlePointerDown(
    e: React.PointerEvent,
    tache: Tache,
    side: "debut" | "fin"
  ) {
    if (!canEdit) return;
    if (gesteRef.current) return;
    gesteRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(tache.id);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;
    const init = datesAffichees(tache);
    // Snapshot de l'override existant (cible d'un geste précédent pas
    // encore rattrapée par les props) : si CE geste n'aboutit pas, on le
    // restaure au lieu de le supprimer, sinon la pilule re-flasherait à
    // son ancienne position, précisément ce que l'override empêche.
    const overrideAvant = overridesRef.current[tache.id];
    const etat = { debutKey: init.debutKey, finKey: init.finKey };
    setResizingId(tache.id);
    // Auto-défilement de bord pendant l'étirement (pointeur capturé,
    // touchAction "none") : sans lui, impossible d'étirer une pilule
    // jusqu'à une semaine hors de la zone visible du cadre. Armé après
    // 6 px de mouvement seulement : un simple appui sur une poignée
    // proche du bord ne doit pas faire défiler (et donc étirer) tout seul.
    const dernier = { x: e.clientX, y: e.clientY };
    const depart = { x: e.clientX, y: e.clientY };
    let stopAutoScroll: (() => void) | null = null;

    // Retour à l'état d'avant le geste : override précédent restauré
    // s'il existait, supprimé sinon (les props font alors foi).
    function restaurerOverrideAvant() {
      if (overrideAvant) {
        setOverrides((prev) => ({ ...prev, [tache.id]: overrideAvant }));
      } else {
        retirerOverride(tache.id);
      }
    }

    function appliquer(k: string) {
      let nDebut = etat.debutKey;
      let nFin = etat.finKey;
      if (side === "debut") {
        // Le début ne dépasse jamais la fin (au pire : 1 jour).
        nDebut = k > init.finKey ? init.finKey : k;
      } else {
        nFin = k < init.debutKey ? init.debutKey : k;
      }
      if (nDebut === etat.debutKey && nFin === etat.finKey) return;
      etat.debutKey = nDebut;
      etat.finKey = nFin;
      setOverrides((prev) => ({
        ...prev,
        [tache.id]: { debutKey: nDebut, finKey: nFin },
      }));
    }

    function cleanup() {
      stopAutoScroll?.();
      stopAutoScroll = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      gesteRef.current = false;
      setResizingId(null);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      dernier.x = ev.clientX;
      dernier.y = ev.clientY;
      if (
        !stopAutoScroll &&
        Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) > 6
      ) {
        stopAutoScroll = demarrerAutoScrollBords(
          cadreRef.current,
          dernier,
          () => {
            const k = dayKeyFromPoint(dernier.x, dernier.y);
            if (k) appliquer(k);
          }
        );
      }
      const k = dayKeyFromPoint(ev.clientX, ev.clientY);
      if (k) appliquer(k);
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      restaurerOverrideAvant(); // retour aux dates d'avant le geste
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (etat.debutKey === init.debutKey && etat.finKey === init.finKey) {
        // Aucun changement : on ne jette pas l'override d'un geste
        // précédent (aller-retour possible pendant CE geste inclus).
        restaurerOverrideAvant();
        return;
      }
      // Anti-flash : on fige l'étirement à l'écran, annoté de sa cible.
      setOverrides((prev) => ({
        ...prev,
        [tache.id]: {
          debutKey: etat.debutKey,
          finKey: etat.finKey,
          cible: { debutKey: etat.debutKey, finKey: etat.finKey },
        },
      }));
      setSavingId(tache.id);
      deplacerTache(tache.id, parseKey(etat.debutKey), parseKey(etat.finKey))
        .then(() => router.refresh())
        .catch((err: unknown) => {
          // Échec : retour à l'état d'avant CE geste (un override
          // précédent, lui, reste valable jusqu'au rattrapage).
          restaurerOverrideAvant();
          toast.error(
            err instanceof Error ? err.message : "Erreur d'étirement"
          );
        })
        .finally(() => setSavingId(null));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // ---- Geste 3 : cliquer-glisser sur les cases vides = créer une plage ----
  function onCellPointerDown(e: React.PointerEvent, key: string) {
    if (!canEdit || !onEmptyRangeClick || !defaultChantierId || !chantierNom)
      return;
    // Au tactile, le doigt sert au défilement de la page : la création
    // par glisser reste un geste souris/stylet (le bouton « + ajouter »
    // couvre le tactile pour un jour, puis on étire la pilule).
    if (e.pointerType === "touch") return;
    const target = e.target as Element | null;
    if (target?.closest?.("button")) return; // « + ajouter », « +N autres »
    if (gesteRef.current) return;
    gesteRef.current = true;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;
    const plage = { a: key, b: key };
    setPlageCreation({ ...plage });

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      gesteRef.current = false;
      setPlageCreation(null);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const k = dayKeyFromPoint(ev.clientX, ev.clientY);
      if (k && k !== plage.b) {
        plage.b = k;
        setPlageCreation({ ...plage });
      }
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const { a, b } = plage;
      cleanup();
      // Un simple clic (sans glisser) ne crée rien : le bouton
      // « + ajouter » reste le geste explicite pour un seul jour.
      if (a === b) return;
      const [d, f] = a <= b ? [a, b] : [b, a];
      onEmptyRangeClick!(parseKey(d), parseKey(f), chantierNom);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // ---- Navigation et bascule mois/semaine ----------------------------------
  const weeks: Date[][] = useMemo(() => {
    if (mode === "semaine") return [buildWeek(cursor)];
    return chunkWeeks(buildMonthGrid(cursor));
  }, [mode, cursor]);
  const monthIndex = cursor.getMonth();

  function goto(delta: number) {
    setCursor((prev) => {
      if (mode === "semaine") {
        const n = new Date(prev);
        n.setDate(n.getDate() + delta * 7);
        return startOfWeek(n);
      }
      const n = new Date(prev);
      n.setMonth(n.getMonth() + delta);
      return startOfMonth(n);
    });
  }

  function gotoToday() {
    setCursor(mode === "semaine" ? startOfWeek(new Date()) : startOfMonth(new Date()));
  }

  function changerMode(m: ModeCal) {
    if (m === mode) return;
    setMode(m);
    try {
      window.localStorage.setItem(LS_MODE, m);
    } catch {
      /* stockage indisponible : réglage non persisté */
    }
    setCursor((prev) => {
      if (m === "semaine") {
        const memeMois =
          today.getFullYear() === prev.getFullYear() &&
          today.getMonth() === prev.getMonth();
        return startOfWeek(memeMois ? today : prev);
      }
      return startOfMonth(prev);
    });
  }

  const titre =
    mode === "mois"
      ? monthFmt.format(cursor)
      : weekRangeFmt.formatRange(weeks[0][0], weeks[0][6]);

  // Index tâches/événements par jour (dates des props : détail du jour,
  // icônes d'événements, état « case vide » du bouton + ajouter).
  const tachesByDay = useMemo(() => {
    const map = new Map<string, Tache[]>();
    for (const t of taches) {
      const s = new Date(t.dateDebut);
      const e = new Date(t.dateFin);
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const k = dayKey(d);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      }
    }
    return map;
  }, [taches]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events]);

  const chantierNom =
    chantiers.find((c) => c.id === defaultChantierId)?.nom ?? "";

  const plageSel: [string, string] | null = plageCreation
    ? plageCreation.a <= plageCreation.b
      ? [plageCreation.a, plageCreation.b]
      : [plageCreation.b, plageCreation.a]
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header : navigation + titre + bascule Mois/Semaine */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goto(-1)}
            className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label={mode === "mois" ? "Mois précédent" : "Semaine précédente"}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={gotoToday}
            className="text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => goto(1)}
            className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label={mode === "mois" ? "Mois suivant" : "Semaine suivante"}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <h2 className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
          <Calendar size={14} className="inline -mt-0.5 mr-1" />
          {titre}
        </h2>
        <div className="inline-flex border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden text-xs shrink-0">
          {(["mois", "semaine"] as const).map((m, i) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => changerMode(m)}
                aria-pressed={active}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  i > 0 && "border-l border-slate-300 dark:border-slate-700",
                  active
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                {m === "mois" ? "Mois" : "Semaine"}
              </button>
            );
          })}
        </div>
        <div className="hidden md:block text-xs text-slate-500 dark:text-slate-400">
          {taches.length} tâche{taches.length > 1 ? "s" : ""} ·{" "}
          {events.length} événement{events.length > 1 ? "s" : ""}
        </div>
      </div>

      {/* Cadre de la grille (même confort que le Gantt) : hauteur bornée à
          72vh, défilement interne vertical ET horizontal (la vue semaine
          garde ses 7 colonnes larges via min-w-[640px]). La barre de
          navigation ci-dessus reste hors du cadre, donc toujours visible ;
          la ligne des jours est sticky en haut du cadre. */}
      <div
        ref={cadreRef}
        className="overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", maxHeight: "72vh" }}
        onPointerDown={(e) => {
          // Désélection : un appui hors pilule replie les poignées
          // tactiles (les pilules stoppent la propagation).
          const el = e.target as Element | null;
          if (!el?.closest?.("[data-pill]")) setSelectedId(null);
        }}
      >
        <div className={mode === "semaine" ? "min-w-[640px]" : undefined}>
          {/* En-têtes jours semaine : sticky en haut du cadre pendant le
              défilement vertical (fond opaque, au-dessus des pilules z-[2]
              et des poignées z-[3]). */}
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold text-center"
              >
                {d}
              </div>
            ))}
          </div>

          {weeks.map((week) => {
            const keys = week.map(dayKey);
            const segs = segmenterSemaine(keys, plages);
            const geo = GEO[mode];
            const lanesSemaine = Math.max(1, nbLanes(segs));
            const visibles =
              mode === "mois" ? segs.filter((s) => s.lane < geo.lanesMax) : segs;
            const masques =
              mode === "mois"
                ? compterMasques(segs, geo.lanesMax)
                : new Array<number>(7).fill(0);
            const hauteurLanes =
              (mode === "mois" ? geo.lanesMax : lanesSemaine) * geo.lane;
            const minH =
              mode === "mois"
                ? geo.header + hauteurLanes + geo.pied
                : Math.max(300, geo.header + hauteurLanes + 60);

            return (
              <div
                key={keys[0]}
                data-weekdays={keys.join(",")}
                className="relative grid grid-cols-7 select-none"
                style={{ minHeight: minH }}
              >
                {/* Cellules (fond, numéro, événements, + ajouter, +N) */}
                {week.map((d, col) => {
                  const k = keys[col];
                  const inMonth =
                    mode === "semaine" || d.getMonth() === monthIndex;
                  const isToday = k === todayKey;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const dayTaches = tachesByDay.get(k) ?? [];
                  const dayEvents = eventsByDay.get(k) ?? [];
                  const isOver = overKey === k && draggingId !== null;
                  const enCreation =
                    plageSel !== null && k >= plageSel[0] && k <= plageSel[1];
                  // Débordement du jour (vue mois) : pilules au-delà des
                  // lanes visibles + événements au-delà des 2 icônes.
                  const masquesIci = masques[col];
                  const debordement =
                    mode === "mois"
                      ? masquesIci + Math.max(0, dayEvents.length - 2)
                      : 0;

                  return (
                    <div
                      key={k}
                      onPointerDown={(e) => onCellPointerDown(e, k)}
                      className={cn(
                        "relative border-r border-b border-slate-100 dark:border-slate-800 transition-colors",
                        !inMonth && "bg-slate-50/50 dark:bg-slate-900/40",
                        isWeekend &&
                          inMonth &&
                          "bg-slate-50/30 dark:bg-slate-800/20",
                        isToday &&
                          inMonth &&
                          "bg-slate-100/60 dark:bg-slate-800/40",
                        enCreation &&
                          "bg-slate-900/10 dark:bg-slate-100/10",
                        isOver &&
                          "outline outline-2 -outline-offset-2 outline-brand-500 bg-brand-50/60 dark:bg-brand-950/30"
                      )}
                      style={
                        mode === "semaine"
                          ? { paddingTop: geo.header + hauteurLanes }
                          : undefined
                      }
                    >
                      {/* Numéro du jour (pastille encre aujourd'hui).
                          Pas de pointer-events-none : les icônes gardent
                          leur tooltip, et le pointerdown remonte de toute
                          façon jusqu'à la cellule (création par glisser). */}
                      <div
                        className="absolute top-1 left-1 right-1 flex items-center justify-between"
                        style={{ height: 20 }}
                      >
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[11px] font-medium tabular-nums",
                            isToday
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold"
                              : !inMonth
                                ? "text-slate-300 dark:text-slate-600"
                                : "text-slate-600 dark:text-slate-400"
                          )}
                        >
                          {d.getDate()}
                        </span>
                        {mode === "mois" && dayEvents.length > 0 && (
                          <span className="flex items-center gap-0.5">
                            {dayEvents.slice(0, 2).map((e) => {
                              const Icon =
                                e.type === "COMMANDE" ? Package : Truck;
                              return (
                                <span key={e.id} title={e.label}>
                                  <Icon
                                    size={10}
                                    className={
                                      e.type === "COMMANDE"
                                        ? "text-orange-600"
                                        : "text-purple-600"
                                    }
                                    aria-label={e.label}
                                  />
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </div>

                      {/* Vue semaine : événements listés sous les pilules */}
                      {mode === "semaine" && dayEvents.length > 0 && (
                        <ul className="px-1 pt-1 pb-6 space-y-0.5">
                          {dayEvents.map((e) => {
                            const Icon =
                              e.type === "COMMANDE" ? Package : Truck;
                            return (
                              <li
                                key={e.id}
                                className="flex items-center gap-1 text-[10px] leading-tight italic text-slate-600 dark:text-slate-400"
                                title={e.label}
                              >
                                <Icon
                                  size={10}
                                  className={cn(
                                    "shrink-0",
                                    e.type === "COMMANDE"
                                      ? "text-orange-600"
                                      : "text-purple-600"
                                  )}
                                />
                                <span className="truncate">{e.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* « +N autres » : détail du jour (vue mois) */}
                      {mode === "mois" && debordement > 0 && (
                        <button
                          type="button"
                          onClick={() => setDayDetailKey(k)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="absolute bottom-0.5 left-1 right-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 truncate"
                        >
                          +{debordement} autre{debordement > 1 ? "s" : ""}
                        </button>
                      )}

                      {/* Zone « ajouter une tâche » (case vide, chantier
                          sélectionné, droits d'édition) */}
                      {canEdit &&
                        inMonth &&
                        onEmptyCellClick &&
                        defaultChantierId &&
                        chantierNom &&
                        dayTaches.length === 0 &&
                        dayEvents.length === 0 &&
                        debordement === 0 && (
                          <button
                            type="button"
                            onClick={() => onEmptyCellClick(d, chantierNom)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute bottom-0.5 left-1 right-1 text-left text-[10px] text-slate-300 dark:text-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
                            title="Créer une tâche ici"
                          >
                            + ajouter
                          </button>
                        )}
                    </div>
                  );
                })}

                {/* Pilules multi-jours (couche au-dessus des cellules) */}
                {visibles.map((seg) => {
                  const t = tacheById.get(seg.id);
                  if (!t) return null;
                  const done = t.statut === "TERMINEE";
                  const isDragging = draggingId === t.id;
                  const enResize = resizingId === t.id;
                  const poigneesVisibles = selectedId === t.id || enResize;
                  return (
                    <div
                      key={`${t.id}-${keys[0]}`}
                      className="absolute z-[2] px-[2px]"
                      style={{
                        left: `${(seg.startCol / 7) * 100}%`,
                        width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                        top: geo.header + seg.lane * geo.lane,
                        height: geo.pill,
                      }}
                    >
                      <div
                        data-pill="1"
                        onPointerDown={(e) => onPillPointerDown(e, t)}
                        style={canEdit ? { touchAction: "none" } : undefined}
                        title={`${t.nom} : ${t.chantier.nom}${
                          t.equipe ? ` · ${t.equipe.nom}` : ""
                        }${
                          canEdit
                            ? " · glisser pour reprogrammer, tirer une extrémité pour étirer"
                            : ""
                        }`}
                        className={cn(
                          "group/pill relative h-full flex items-center border shadow-sm text-white overflow-hidden",
                          mode === "semaine" ? "text-[11px]" : "text-[10px]",
                          STATUT_PILL[t.statut] ?? STATUT_PILL.A_FAIRE,
                          seg.debutReel ? "rounded-l-md" : "rounded-l-none",
                          seg.finReelle ? "rounded-r-md" : "rounded-r-none",
                          canEdit
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-pointer",
                          done && "opacity-70",
                          isDragging && "opacity-40",
                          savingId === t.id && "animate-pulse",
                          enResize &&
                            "ring-2 ring-slate-900 dark:ring-slate-100",
                          selectedId === t.id &&
                            !enResize &&
                            "ring-1 ring-slate-900/60 dark:ring-slate-100/60"
                        )}
                      >
                        {/* Poignée début (extrémité réelle seulement) */}
                        {canEdit && seg.debutReel && (
                          <span
                            onPointerDown={(e) =>
                              onHandlePointerDown(e, t, "debut")
                            }
                            style={{ touchAction: "none" }}
                            className={cn(
                              "absolute left-0 top-0 bottom-0 z-[3] flex items-center cursor-ew-resize",
                              // Poignées plus larges quand la place le
                              // permet (vue semaine) ; étroites en vue
                              // mois pour laisser le centre des pilules
                              // d'un jour disponible au déplacement.
                              mode === "semaine"
                                ? "w-5"
                                : "w-3 pointer-coarse:w-4",
                              "opacity-0 pointer-events-none transition-opacity",
                              "group-hover/pill:opacity-100 group-hover/pill:pointer-events-auto",
                              poigneesVisibles &&
                                "opacity-100 pointer-events-auto"
                            )}
                            title="Tirer pour changer la date de début"
                            aria-label="Modifier la date de début"
                          >
                            <span className="block w-[3px] h-3 ml-1 rounded-full bg-white/90" />
                          </span>
                        )}

                        {t.priorite <= 2 && (
                          <Flag
                            size={9}
                            className="shrink-0 ml-1.5 fill-white/90 text-white/90"
                            aria-label={`Priorité P${t.priorite}`}
                          />
                        )}
                        <span
                          className={cn(
                            "truncate font-medium pr-1.5",
                            t.priorite <= 2 ? "ml-1" : "ml-1.5",
                            done && "line-through"
                          )}
                        >
                          {t.nom}
                        </span>

                        {/* Poignée fin (extrémité réelle seulement) */}
                        {canEdit && seg.finReelle && (
                          <span
                            onPointerDown={(e) =>
                              onHandlePointerDown(e, t, "fin")
                            }
                            style={{ touchAction: "none" }}
                            className={cn(
                              "absolute right-0 top-0 bottom-0 z-[3] flex items-center justify-end cursor-ew-resize",
                              mode === "semaine"
                                ? "w-5"
                                : "w-3 pointer-coarse:w-4",
                              "opacity-0 pointer-events-none transition-opacity",
                              "group-hover/pill:opacity-100 group-hover/pill:pointer-events-auto",
                              poigneesVisibles &&
                                "opacity-100 pointer-events-auto"
                            )}
                            title="Tirer pour changer la date de fin"
                            aria-label="Modifier la date de fin"
                          >
                            <span className="block w-[3px] h-3 mr-1 rounded-full bg-white/90" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-slate-400" /> À faire
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-blue-500" /> En cours
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-green-500" /> Terminée
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-red-500" /> Bloquée
        </span>
        <span className="flex items-center gap-1">
          <Flag size={10} className="text-slate-500" /> Priorité haute
        </span>
        <span className="flex items-center gap-1">
          <Package size={10} className="text-slate-500" /> Livraison
        </span>
        <span className="flex items-center gap-1">
          <Truck size={10} className="text-slate-500" /> Fin location
        </span>
        {canEdit && (
          <span className="ml-auto text-slate-400 dark:text-slate-500">
            Glisser une pilule = reprogrammer · tirer une extrémité = étirer ·
            cliquer-glisser sur les cases vides (souris) = créer sur la plage
          </span>
        )}
      </div>

      {/* Détail d'un jour (ouvert via « +N autres ») */}
      {dayDetailKey && (
        <DayDetail
          dayKey={dayDetailKey}
          taches={tachesByDay.get(dayDetailKey) ?? []}
          events={eventsByDay.get(dayDetailKey) ?? []}
          onClickTask={onClickTask}
          onClose={() => setDayDetailKey(null)}
        />
      )}
    </div>
  );
}

const dayDetailFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Fenêtre listant toutes les tâches et tous les événements d'un jour. */
function DayDetail({
  dayKey: k,
  taches,
  events,
  onClickTask,
  onClose,
}: {
  dayKey: string;
  taches: Tache[];
  events: Event[];
  onClickTask?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
            {dayDetailFmt.format(parseKey(k))}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {taches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (onClickTask) onClickTask(t.id);
                onClose();
              }}
              className="w-full flex items-center gap-2 text-left text-sm px-2 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span
                className={`shrink-0 w-1.5 h-4 rounded-sm ${
                  PRIO_BAR[t.priorite] ?? PRIO_BAR[4]
                }`}
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-slate-800 dark:text-slate-200">
                  {t.nom}
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {t.chantier.nom}
                  {t.equipe ? ` · ${t.equipe.nom}` : ""}
                </span>
              </span>
            </button>
          ))}
          {events.map((e) => {
            const Icon = e.type === "COMMANDE" ? Package : Truck;
            return (
              <div
                key={e.id}
                className="flex items-center gap-2 text-sm px-2 py-2 text-slate-600 dark:text-slate-400 italic"
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{e.label}</span>
              </div>
            );
          })}
          {taches.length === 0 && events.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
              Rien ce jour.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
