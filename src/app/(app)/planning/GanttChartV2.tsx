"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Flag,
  Info,
  Link2,
  Package,
  Truck,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import {
  ajouterDependance,
  decalerTacheAvecSuccesseurs,
  deplacerEvenement,
  deplacerTache,
  retirerDependance,
} from "./actions";
import { addDays, daysBetween, ONE_DAY, startOfDay } from "./gantt/dates";
import {
  construireEchelle,
  DAY_WIDTH,
  ECHELLES,
  MARGES,
  type Echelle,
} from "./gantt/echelle";
import {
  construireSuccesseurs,
  creeraitUnCycle,
  successeursTransitifs,
} from "./gantt/dependances";
import {
  CoucheDependances,
  pointMilieuFleche,
  type FlecheDep,
  type LienElastique,
} from "./gantt/CoucheDependances";

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  priorite: number;
  parentId: string | null;
  equipe: { nom: string } | null;
  chantier: { id?: string; nom: string };
  /** IDs des prédécesseurs (la tâche dépend d'eux). */
  dependances?: { id: string }[];
};

type ExtraEvent = {
  /** id composé "cmd-XYZ" / "loc-XYZ" pour la key React */
  id: string;
  /** id réel sous-jacent (Commande.id ou LocationPret.id) pour les mutations */
  realId: string;
  type: "COMMANDE" | "LOCATION";
  label: string;
  date: Date | string;
};

const statutBgColor: Record<string, string> = {
  A_FAIRE: "bg-slate-400",
  EN_COURS: "bg-blue-500",
  TERMINEE: "bg-green-500",
  BLOQUEE: "bg-red-500",
};

const statutBorderColor: Record<string, string> = {
  A_FAIRE: "border-slate-500",
  EN_COURS: "border-blue-600",
  TERMINEE: "border-green-600",
  BLOQUEE: "border-red-600",
};

const PRIO_FLAG: Record<number, string> = {
  1: "fill-red-500 stroke-red-600 text-red-600",
  2: "fill-orange-500 stroke-orange-600 text-orange-600",
  3: "fill-blue-400 stroke-blue-500 text-blue-500",
  4: "fill-transparent stroke-slate-400 text-slate-400",
};

// Hauteur d'une ligne Gantt (doit matcher le style height: 44 des cellules)
const ROW_H = 44;

// Largeur de la zone tactile d'une poignée EXTERNE (barres étroites).
// Le grip visible ne fait que ~3 px, mais la zone de prise s'étend sur
// 24 px vers l'extérieur de la barre. Pour ne pas confisquer le
// clic-création sur la case vide voisine, cette zone élargie n'est
// active (pointer-events) que lorsque la ligne est survolée (desktop,
// variante group-hover limitée aux appareils à survol par Tailwind v4)
// ou que la barre est épinglée par un tap (mobile, portsPinnedId),
// exactement comme les ports de dépendance. Compromis résiduel : sur
// desktop la ligne est forcément survolée au moment du clic, le couloir
// reste donc réservé aux poignées et aux ports, mais grips et ports y
// sont alors visibles et le curseur signale la zone ; au doigt, le
// clic-création fonctionne désormais jusqu'au bord de la barre, et le
// redimensionnement d'une barre étroite passe par l'épinglage (tap sur
// la barre), le geste déjà requis pour les ports.
const EXT_HANDLE_W = 24;

// Persistance locale du réglage « Entraîner les successeurs »
const LS_ENTRAINER = "lynx.gantt.entrainerSuccesseurs";

/** Clé de comparaison chantier (id si présent, sinon nom). */
function chantierKey(c: { id?: string; nom: string }): string {
  return c.id ?? c.nom;
}

/**
 * Gantt interactif façon Monday.com :
 *  - Drag du milieu de la barre = déplacer (et, si le réglage
 *    « Entraîner les successeurs » est actif, décaler du même delta
 *    toutes les tâches qui en dépendent, directement ou non)
 *  - Drag des bords = redimensionner (resize start/end)
 *  - Ports circulaires aux extrémités : tirer une flèche élastique vers
 *    une autre barre pour créer une dépendance (détection de cycle)
 *  - Clic sur une flèche = sélection, bouton croix pour la supprimer
 *  - Liseré rouge : tâche non terminée dont la fin est passée (retard)
 *  - Snap au jour, sauvegarde en BDD au pointerup
 *  - Ligne « aujourd'hui » rouge + bouton pour la recentrer
 *  - Échelles jour / semaine / mois / trimestre
 */
export function GanttChartV2({
  taches,
  events,
  canEdit,
  onClickTask,
  onEmptyCellClick,
}: {
  taches: Tache[];
  events: ExtraEvent[];
  canEdit: boolean;
  /** Click court sur une barre (sans drag) : ouvre l'édition. */
  onClickTask?: (tacheId: string) => void;
  /** Click sur une case vide d'une ligne tâche : crée une nouvelle
   *  tâche à cette date dans le même chantier. */
  onEmptyCellClick?: (date: Date, chantierNom: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  // Garde multi-touch : un seul geste (barre, poignée, port, événement)
  // à la fois. Un second doigt est ignoré tant que le premier est actif.
  const activeDragRef = useRef(false);

  // Position temporaire pendant le drag ; apres sauvegarde, `cible` note les
  // dates envoyees au serveur : l'override n'est retire que quand les props
  // rafraichies les ont rattrapees (sinon la barre revenait un instant a sa
  // position d'origine, flash signale par Youssoufou).
  const [overrides, setOverrides] = useState<
    Record<
      string,
      { offset: number; duration: number; cible?: { debut: number; fin: number } }
    >
  >({});
  // Override visuel pour le drag d'un event (livraison/restitution),
  // meme principe de cible que les barres.
  const [eventOverrides, setEventOverrides] = useState<
    Record<string, { offset: number; cible?: number }>
  >({});

  // UI : échelle temporelle + visibilité des events
  const [scale, setScale] = useState<Echelle>("jour");
  const [showEvents, setShowEvents] = useState(false);

  // « Entraîner les successeurs » (mode flexible de Monday) : actif par
  // défaut, persisté en localStorage. Lu en effet (pas au premier rendu)
  // pour éviter tout écart d'hydratation SSR/client.
  const [entrainerSuccesseurs, setEntrainerSuccesseurs] = useState(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_ENTRAINER);
      if (v !== null) setEntrainerSuccesseurs(v === "1");
    } catch {
      /* stockage indisponible : on garde le défaut */
    }
  }, []);
  function toggleEntrainer() {
    const next = !entrainerSuccesseurs;
    setEntrainerSuccesseurs(next);
    try {
      window.localStorage.setItem(LS_ENTRAINER, next ? "1" : "0");
    } catch {
      /* stockage indisponible : réglage non persisté */
    }
  }

  // Dépendances : ports épinglés (tap mobile), tirage de lien en cours,
  // flèche sélectionnée, ajouts/retraits optimistes (anti-flash).
  const [portsPinnedId, setPortsPinnedId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkLine, setLinkLine] = useState<LienElastique | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [selectedDep, setSelectedDep] = useState<
    { tacheId: string; depId: string } | null
  >(null);
  // Flèches affichées avant confirmation serveur (clé anti-flash : on ne
  // retire l'ajout que quand les props le contiennent, et on ne réaffiche
  // un retrait que si le serveur a échoué).
  const [optimisticDeps, setOptimisticDeps] = useState<
    { tacheId: string; depId: string }[]
  >([]);
  const [removedDeps, setRemovedDeps] = useState<string[]>([]);

  // Largeur d'un jour selon l'échelle
  const dayWidth = DAY_WIDTH[scale];

  // Events filtrés (cachés par défaut, encombrent souvent la vue)
  const visibleEvents = useMemo(
    () => (showEvents ? events : []),
    [showEvents, events]
  );

  // -- Calcul de l'échelle temporelle ---------------------------------------
  const { minDate, totalDays, labelWidth, days, months, weeks } = useMemo(() => {
    const allDates: Date[] = [];
    taches.forEach((t) => {
      allDates.push(new Date(t.dateDebut), new Date(t.dateFin));
    });
    visibleEvents.forEach((e) => allDates.push(new Date(e.date)));
    return construireEchelle(allDates, scale);
  }, [taches, visibleEvents, scale]);

  // Segments mois avec index de départ (bandeau + traits du mode trimestre)
  const monthSegs = useMemo(() => {
    let acc = 0;
    return months.map((m) => {
      const seg = { ...m, startIdx: acc };
      acc += m.daysCount;
      return seg;
    });
  }, [months]);

  // Graphe des successeurs (id -> tâches qui dépendent de id), pour
  // entraîner visuellement les successeurs pendant le drag.
  const successeursMap = useMemo(() => construireSuccesseurs(taches), [taches]);

  // Retire les overrides sauvegardes une fois les props a jour (anti-flash).
  useEffect(() => {
    setOverrides((prev) => {
      let change = false;
      const next = { ...prev };
      for (const [id, ov] of Object.entries(prev)) {
        if (!ov.cible) continue; // drag encore en cours
        const t = taches.find((x) => x.id === id);
        const rattrape =
          t &&
          startOfDay(new Date(t.dateDebut)).getTime() === ov.cible.debut &&
          startOfDay(new Date(t.dateFin)).getTime() === ov.cible.fin;
        if (!t || rattrape) {
          delete next[id];
          change = true;
        }
      }
      return change ? next : prev;
    });
  }, [taches]);

  useEffect(() => {
    setEventOverrides((prev) => {
      let change = false;
      const next = { ...prev };
      for (const [id, ov] of Object.entries(prev)) {
        if (ov.cible === undefined) continue;
        const evt = events.find((x) => x.id === id);
        const rattrape =
          evt && startOfDay(new Date(evt.date)).getTime() === ov.cible;
        if (!evt || rattrape) {
          delete next[id];
          change = true;
        }
      }
      return change ? next : prev;
    });
  }, [events]);

  // Purge des dépendances optimistes rattrapées par les props (anti-flash) :
  // un ajout disparaît de la liste locale quand les props le contiennent,
  // un retrait quand les props ne le contiennent plus.
  useEffect(() => {
    setOptimisticDeps((prev) => {
      const next = prev.filter((od) => {
        const t = taches.find((x) => x.id === od.tacheId);
        if (!t) return false;
        return !t.dependances?.some((d) => d.id === od.depId);
      });
      return next.length === prev.length ? prev : next;
    });
    setRemovedDeps((prev) => {
      const next = prev.filter((key) => {
        const [tid, did] = key.split("|");
        const t = taches.find((x) => x.id === tid);
        return !!t?.dependances?.some((d) => d.id === did);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [taches]);

  if (taches.length === 0 && events.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
        Aucune tâche planifiée. Ajoute des tâches pour visualiser le Gantt.
      </div>
    );
  }

  function offsetFor(t: Tache) {
    const o = overrides[t.id]?.offset;
    return typeof o === "number"
      ? o
      : daysBetween(minDate, new Date(t.dateDebut));
  }
  function durationFor(t: Tache) {
    const o = overrides[t.id]?.duration;
    return typeof o === "number"
      ? o
      : Math.max(
          1,
          daysBetween(new Date(t.dateDebut), new Date(t.dateFin)) + 1
        );
  }

  /** Démarre un drag sur une barre.
   *  mode: "move" = déplacer entier, "left" = redim début, "right" = redim fin
   *
   *  Click vs drag :
   *  - Si le pointer ne bouge pas de plus de 5 px ET que pointerup
   *    intervient en moins de 600 ms → c'est un CLIC, on ouvre l'édition.
   *  - Sinon → drag, on sauvegarde les nouvelles dates au pointerup.
   *
   *  En mode "move" avec « Entraîner les successeurs » actif, toutes les
   *  tâches qui dépendent (transitivement) de la barre suivent le même
   *  delta, à l'écran pendant le drag et en base au relâcher (action
   *  decalerTacheAvecSuccesseurs, transactionnelle).
   */
  function startDrag(
    tache: Tache,
    mode: "move" | "left" | "right",
    e: React.PointerEvent
  ) {
    if (!canEdit) return;
    // Garde multi-touch : un seul geste à la fois.
    if (activeDragRef.current) return;
    activeDragRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    // Tap sur une barre : fait apparaître les ports de dépendance (mobile),
    // et désélectionne une éventuelle flèche.
    setPortsPinnedId(tache.id);
    setSelectedDep(null);
    // Capture du pointeur : fiable au tactile (le doigt peut sortir de la
    // barre sans perdre le drag). Voir CalendarMonth pour le meme motif.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;

    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    const initOffset = offsetFor(tache);
    const initDuration = durationFor(tache);
    let moved = false;
    // On suit la position courante via closure pour ne pas dépendre
    // d'une lecture du state à l'intérieur d'un updater.
    let lastOffset = initOffset;
    let lastDuration = initDuration;
    let lastDelta = 0;

    // Successeurs entraînés (mode move + réglage actif) : positions de
    // départ figées au début du geste.
    const entrainer = mode === "move" && entrainerSuccesseurs;
    const succInit: { id: string; offset: number; duration: number }[] = [];
    if (entrainer) {
      for (const id of successeursTransitifs(tache.id, successeursMap)) {
        const s = taches.find((x) => x.id === id);
        if (s) succInit.push({ id, offset: offsetFor(s), duration: durationFor(s) });
      }
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 5) {
        moved = true;
      }
      if (!moved) return;

      const scroller = scrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const EDGE = 60;
        if (ev.clientX > rect.right - EDGE) {
          scroller.scrollLeft += 8;
        } else if (ev.clientX < rect.left + EDGE) {
          scroller.scrollLeft -= 8;
        }
      }

      const deltaDays = Math.round(dx / dayWidth);
      let nextOffset = initOffset;
      let nextDuration = initDuration;
      if (mode === "move") {
        nextOffset = initOffset + deltaDays;
      } else if (mode === "left") {
        nextOffset = initOffset + deltaDays;
        nextDuration = initDuration - deltaDays;
        if (nextDuration < 1) {
          const adjust = 1 - nextDuration;
          nextOffset -= adjust;
          nextDuration = 1;
        }
      } else if (mode === "right") {
        nextDuration = initDuration + deltaDays;
        if (nextDuration < 1) nextDuration = 1;
      }
      // Bornage à la grille visible : une barre ne doit jamais sortir de
      // l'écran (bug « les barres partent hors cadre »). On garde toujours
      // au moins un jour visible.
      if (mode === "move") {
        nextOffset = Math.max(0, Math.min(nextOffset, totalDays - nextDuration));
      } else if (mode === "left") {
        if (nextOffset < 0) {
          // Garde le bord droit fixe : réduit la durée du débordement.
          nextDuration += nextOffset;
          nextOffset = 0;
          if (nextDuration < 1) nextDuration = 1;
        }
      } else if (mode === "right") {
        if (nextOffset + nextDuration > totalDays) {
          nextDuration = totalDays - nextOffset;
        }
        if (nextDuration < 1) nextDuration = 1;
      }
      lastOffset = nextOffset;
      lastDuration = nextDuration;
      lastDelta = mode === "move" ? nextOffset - initOffset : 0;
      setOverrides((prev) => {
        const next = {
          ...prev,
          [tache.id]: { offset: nextOffset, duration: nextDuration },
        };
        // Entraîne visuellement les successeurs du même delta (bornés à
        // la grille pour l'affichage ; le serveur reçoit le delta exact).
        for (const s of succInit) {
          next[s.id] = {
            offset: Math.max(
              0,
              Math.min(s.offset + lastDelta, totalDays - s.duration)
            ),
            duration: s.duration,
          };
        }
        return next;
      });
    }

    function clearOverride() {
      setOverrides((p) => {
        const n = { ...p };
        delete n[tache.id];
        for (const s of succInit) delete n[s.id];
        return n;
      });
    }

    function onCancel(ev: PointerEvent) {
      // Interruption (2e doigt, notification, geste systeme) : on annule
      // sans sauvegarder.
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      activeDragRef.current = false;
      clearOverride();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      activeDragRef.current = false;

      const elapsed = Date.now() - startTime;

      // Cas CLIC : pas de mouvement (ou très peu) ET click rapide
      if (!moved && elapsed < 600) {
        if (mode === "move" && onClickTask) {
          onClickTask(tache.id);
        }
        return;
      }

      // Cas DRAG : sauvegarde si les dates ont changé.
      // L'appel server action est HORS de tout updater pour éviter le
      // warning React "Cannot update a component while rendering a
      // different component".
      const newStart = addDays(minDate, lastOffset);
      const newEnd = addDays(newStart, lastDuration - 1);
      const origStart = new Date(tache.dateDebut);
      const origEnd = new Date(tache.dateFin);
      if (
        newStart.getTime() === startOfDay(origStart).getTime() &&
        newEnd.getTime() === startOfDay(origEnd).getTime()
      ) {
        clearOverride();
        return;
      }

      // Anti-flash : on garde les overrides à l'écran, annotés de leur
      // cible ; l'effet les retirera quand les props auront rattrapé.
      function poserCibles() {
        setOverrides((prev) => {
          const next = { ...prev };
          next[tache.id] = {
            offset: lastOffset,
            duration: lastDuration,
            cible: { debut: newStart.getTime(), fin: newEnd.getTime() },
          };
          for (const s of succInit) {
            const sDebut = addDays(minDate, s.offset + lastDelta);
            const sFin = addDays(sDebut, s.duration - 1);
            next[s.id] = {
              offset: Math.max(
                0,
                Math.min(s.offset + lastDelta, totalDays - s.duration)
              ),
              duration: s.duration,
              cible: { debut: sDebut.getTime(), fin: sFin.getTime() },
            };
          }
          return next;
        });
      }

      const sauvegarde =
        mode === "move"
          ? decalerTacheAvecSuccesseurs(
              tache.id,
              newStart,
              newEnd,
              entrainerSuccesseurs
            )
          : deplacerTache(tache.id, newStart, newEnd);

      sauvegarde
        .then(() => {
          poserCibles();
          router.refresh();
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "Erreur de déplacement"
          );
          clearOverride();
        });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Drag d'un event (livraison commande / fin location). Plus simple
   *  qu'une tâche : pas de resize, juste shift de la date. */
  function startEventDrag(ev: ExtraEvent, e: React.PointerEvent) {
    if (!canEdit) return;
    if (activeDragRef.current) return;
    activeDragRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const initOffset = daysBetween(minDate, new Date(ev.date));
    let moved = false;
    // On suit la position courante via closure plutôt qu'en lisant le
    // state : évite d'appeler router.refresh() depuis un updater.
    let lastOffset = initOffset;

    function onMove(mv: PointerEvent) {
      if (mv.pointerId !== pointerId) return;
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 5) moved = true;
      if (!moved) return;
      const scroller = scrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const EDGE = 60;
        if (mv.clientX > rect.right - EDGE) scroller.scrollLeft += 8;
        else if (mv.clientX < rect.left + EDGE) scroller.scrollLeft -= 8;
      }
      const deltaDays = Math.round(dx / dayWidth);
      // Bornage à la grille visible (comme les barres de tâches).
      lastOffset = Math.max(0, Math.min(initOffset + deltaDays, totalDays - 1));
      setEventOverrides((prev) => ({ ...prev, [ev.id]: { offset: lastOffset } }));
    }

    function clearOverride() {
      setEventOverrides((p) => {
        const n = { ...p };
        delete n[ev.id];
        return n;
      });
    }

    function onCancel(cv: PointerEvent) {
      if (cv.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      activeDragRef.current = false;
      clearOverride();
    }

    function onUp(uv: PointerEvent) {
      if (uv.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      activeDragRef.current = false;
      if (!moved) return;

      const newDate = addDays(minDate, lastOffset);
      const origDate = startOfDay(new Date(ev.date));
      if (newDate.getTime() === origDate.getTime()) {
        clearOverride();
        return;
      }
      // Fallback : si realId manque (cache stale), on envoie l'id préfixé,
      // l'action server le strip côté serveur.
      // L'appel est HORS de tout updater pour éviter le warning React
      // "Cannot update a component while rendering a different component".
      deplacerEvenement(ev.type, ev.realId ?? ev.id, newDate)
        .then(() => {
          setEventOverrides((prev) => ({
            ...prev,
            [ev.id]: { offset: lastOffset, cible: newDate.getTime() },
          }));
          router.refresh();
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "Erreur de déplacement"
          );
          clearOverride();
        });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /**
   * Tirage d'un lien de dépendance depuis un port (rond aux extrémités
   * d'une barre) vers une autre barre. Port droit : la cible dépendra de
   * la source (fin -> début). Port gauche : la source dépendra de la cible.
   */
  function startLinkDrag(
    source: Tache,
    side: "gauche" | "droite",
    rowIndex: number,
    e: React.PointerEvent
  ) {
    if (!canEdit) return;
    if (activeDragRef.current) return;
    activeDragRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;
    const barLeft = offsetFor(source) * dayWidth;
    const barWidth = Math.max(8, durationFor(source) * dayWidth - 4);
    const x0 = side === "droite" ? barLeft + barWidth : barLeft;
    const y0 = rowIndex * ROW_H + ROW_H / 2;
    // Cible courante suivie en closure (l'état ne sert qu'au rendu).
    let cibleId: string | null = null;
    let cibleInvalide = false;

    setLinkSourceId(source.id);
    setPortsPinnedId(source.id);
    setSelectedDep(null);
    setLinkLine({ x0, y0, x1: x0, y1: y0 });

    function coords(ev: PointerEvent) {
      const rows = rowsRef.current;
      if (!rows) return { x: x0, y: y0 };
      const rect = rows.getBoundingClientRect();
      return { x: ev.clientX - rect.left - labelWidth, y: ev.clientY - rect.top };
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const scroller = scrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const EDGE = 60;
        if (ev.clientX > rect.right - EDGE) scroller.scrollLeft += 8;
        else if (ev.clientX < rect.left + EDGE) scroller.scrollLeft -= 8;
      }
      // Ligne cible sous le doigt (même motif que CalendarMonth :
      // elementFromPoint + closest sur un data-attribute).
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest?.("[data-lienrow]") as HTMLElement | null;
      const id = row?.dataset.lienrow ?? null;
      if (id && id !== source.id) {
        const t = taches.find((x) => x.id === id);
        cibleId = t ? id : null;
        cibleInvalide =
          !!t && chantierKey(t.chantier) !== chantierKey(source.chantier);
      } else {
        cibleId = null;
        cibleInvalide = false;
      }
      const p = coords(ev);
      setLinkLine({ x0, y0, x1: p.x, y1: p.y });
      setLinkTargetId(cibleId);
      setLinkInvalid(cibleInvalide);
    }

    function fin() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      activeDragRef.current = false;
      setLinkLine(null);
      setLinkTargetId(null);
      setLinkInvalid(false);
      setLinkSourceId(null);
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      fin();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      fin();
      if (!cibleId) return;
      const cible = taches.find((x) => x.id === cibleId);
      if (!cible) return;
      if (cibleInvalide) {
        toast.error(
          "Impossible : les deux tâches doivent appartenir au même chantier."
        );
        return;
      }
      // Port droit : la cible dépend de la source. Port gauche : l'inverse.
      const tacheId = side === "droite" ? cible.id : source.id;
      const depId = side === "droite" ? source.id : cible.id;
      const dejaProps = taches
        .find((x) => x.id === tacheId)
        ?.dependances?.some((d) => d.id === depId);
      const dejaOptimiste = optimisticDeps.some(
        (x) => x.tacheId === tacheId && x.depId === depId
      );
      if (dejaProps || dejaOptimiste) {
        toast.info("Cette dépendance existe déjà.");
        return;
      }
      // Pré-contrôle client du cycle (le serveur refait la vérification
      // en base, qui reste l'autorité).
      if (creeraitUnCycle(tacheId, depId, taches)) {
        toast.error("Impossible : cela créerait un cycle de dépendances.");
        return;
      }
      // Anti-flash : la flèche apparaît tout de suite et n'est retirée
      // que quand les props rafraîchies la contiennent (ou sur erreur).
      setOptimisticDeps((prev) => [...prev, { tacheId, depId }]);
      ajouterDependance(tacheId, depId)
        .then(() => router.refresh())
        .catch((err: unknown) => {
          setOptimisticDeps((prev) =>
            prev.filter((x) => !(x.tacheId === tacheId && x.depId === depId))
          );
          toast.error(
            err instanceof Error
              ? err.message
              : "Erreur lors de la création de la dépendance"
          );
        });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Suppression d'une flèche sélectionnée (bouton croix + confirmation). */
  function supprimerDependance(tacheId: string, depId: string) {
    if (!window.confirm("Supprimer cette dépendance ?")) return;
    const key = `${tacheId}|${depId}`;
    setSelectedDep(null);
    // Anti-flash inversé : la flèche disparaît tout de suite ; elle ne
    // réapparaît que si le serveur échoue.
    setRemovedDeps((prev) => [...prev, key]);
    setOptimisticDeps((prev) =>
      prev.filter((x) => !(x.tacheId === tacheId && x.depId === depId))
    );
    retirerDependance(tacheId, depId)
      .then(() => router.refresh())
      .catch((err: unknown) => {
        setRemovedDeps((prev) => prev.filter((k) => k !== key));
        toast.error(
          err instanceof Error
            ? err.message
            : "Erreur lors de la suppression de la dépendance"
        );
      });
  }

  const todayStart = startOfDay(new Date());
  const todayOffset = daysBetween(minDate, todayStart);
  const todayLeft =
    todayOffset >= 0 && todayOffset < totalDays
      ? todayOffset * dayWidth + dayWidth / 2
      : null;

  /** Recentre la vue sur la ligne « aujourd'hui ». */
  function scrollToToday() {
    const el = scrollRef.current;
    if (!el || todayLeft === null) return;
    el.scrollTo({
      left: Math.max(0, labelWidth + todayLeft - el.clientWidth / 2),
      behavior: "smooth",
    });
  }

  // Index par id pour résoudre les dépendances (numéro de ligne)
  const taskRowIndex = new Map(taches.map((t, i) => [t.id, i]));

  // Construit les flèches : dépendances des props (hors retraits
  // optimistes) + ajouts optimistes pas encore rattrapés par les props.
  const fleches: FlecheDep[] = [];
  function pousserFleche(tacheId: string, depId: string, optimiste: boolean) {
    const ti = taskRowIndex.get(tacheId);
    const di = taskRowIndex.get(depId);
    if (ti === undefined || di === undefined) return;
    const t = taches[ti];
    const d = taches[di];
    // "Bloquante" si la dep n'est pas terminée ET sa fin (affichée) est
    // après le début de t : timing impossible. Basé sur les offsets pour
    // suivre les barres en direct pendant un drag.
    const bloquante =
      d.statut !== "TERMINEE" &&
      offsetFor(d) + durationFor(d) - 1 > offsetFor(t);
    fleches.push({
      tacheId,
      depId,
      fromX: (offsetFor(d) + durationFor(d)) * dayWidth - 2,
      fromY: di * ROW_H + ROW_H / 2,
      toX: offsetFor(t) * dayWidth,
      toY: ti * ROW_H + ROW_H / 2,
      bloquante,
      optimiste,
    });
  }
  taches.forEach((t) => {
    for (const dep of t.dependances ?? []) {
      if (removedDeps.includes(`${t.id}|${dep.id}`)) continue;
      pousserFleche(t.id, dep.id, false);
    }
  });
  for (const od of optimisticDeps) {
    if (removedDeps.includes(`${od.tacheId}|${od.depId}`)) continue;
    const deja = taches
      .find((x) => x.id === od.tacheId)
      ?.dependances?.some((d) => d.id === od.depId);
    if (!deja) pousserFleche(od.tacheId, od.depId, true);
  }
  const flecheSelectionnee = selectedDep
    ? fleches.find(
        (a) =>
          a.tacheId === selectedDep.tacheId && a.depId === selectedDep.depId
      ) ?? null
    : null;

  // Scroll horizontal molette (Shift+wheel ou trackpad horizontal)
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    // Si l'utilisateur a un trackpad → deltaX peut être non-nul
    // Si shift maintenu → on convertit deltaY en deltaX
    if (e.shiftKey && e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    } else if (e.deltaX !== 0) {
      el.scrollLeft += e.deltaX;
    }
  }

  /** Clic sur le fond : désélectionne la flèche et dépingle les ports
   *  (les gestes sur barres/ports/flèches stoppent la propagation). */
  function onFondPointerDown(e: React.PointerEvent) {
    const el = e.target as Element | null;
    if (!el) return;
    if (!el.closest?.("[data-arrow-ui]")) setSelectedDep(null);
    if (!el.closest?.("[data-port]") && !el.closest?.("[data-barre]")) {
      setPortsPinnedId(null);
    }
  }

  /** Choisit la plus grande echelle (px/jour) dont l'etendue des donnees
   *  tient dans la largeur visible, puis cale la vue au debut du planning. */
  function ajusterEchelle() {
    const el = scrollRef.current;
    if (!el) return;
    const dispo = Math.max(200, el.clientWidth - labelWidth);
    const dates: number[] = [];
    taches.forEach((t) => {
      dates.push(
        startOfDay(new Date(t.dateDebut)).getTime(),
        startOfDay(new Date(t.dateFin)).getTime()
      );
    });
    visibleEvents.forEach((e) => dates.push(startOfDay(new Date(e.date)).getTime()));
    if (dates.length === 0) return;
    const etendue =
      Math.round((Math.max(...dates) - Math.min(...dates)) / ONE_DAY) + 3;
    const choix =
      ECHELLES.find((s) => etendue * DAY_WIDTH[s] <= dispo) ??
      ECHELLES[ECHELLES.length - 1];
    setScale(choix);
    // Cale la vue sur le debut des donnees (apres recalcul de la grille).
    requestAnimationFrame(() => {
      const sc = scrollRef.current;
      if (!sc) return;
      sc.scrollLeft = Math.max(0, MARGES[choix].avant * DAY_WIDTH[choix] - 16);
      sc.scrollTop = 0;
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Toolbar : échelle + aujourd'hui + successeurs + visibilité events */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex-wrap">
        <div className="inline-flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-700 text-xs">
          {ECHELLES.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              className={`px-3 py-1 capitalize transition ${
                i > 0 ? "border-l border-slate-300 dark:border-slate-700" : ""
              } ${
                scale === s
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={ajusterEchelle}
          title="Choisir automatiquement l'échelle qui affiche tout le planning d'un coup"
          className="px-3 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Ajuster
        </button>
        <button
          type="button"
          onClick={scrollToToday}
          disabled={todayLeft === null}
          title="Recentrer la vue sur la ligne rouge (aujourd'hui)"
          className="px-3 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Aujourd&apos;hui
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={toggleEntrainer}
            aria-pressed={entrainerSuccesseurs}
            title="Quand une barre est déplacée, décaler du même nombre de jours toutes les tâches qui en dépendent (directement ou non)"
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border transition",
              entrainerSuccesseurs
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 font-medium"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Link2 size={13} className="shrink-0" />
            Entraîner les successeurs
          </button>
        )}
        {events.length > 0 && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => setShowEvents(e.target.checked)}
            />
            Afficher livraisons &amp; fins de location ({events.length})
          </label>
        )}
      </div>

      {/* Empty state explicite quand 0 tâches mais des events visibles */}
      {taches.length === 0 && visibleEvents.length > 0 && (
        <div className="px-3 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            Aucune <strong>tâche</strong> planifiée : seules les livraisons et
            fins de location sont affichées. Décoche la case ci-dessus pour les
            masquer, ou crée une tâche via la barre de saisie rapide.
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        onPointerDown={onFondPointerDown}
        className="overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", maxHeight: "72vh" }}
      >
        <div style={{ minWidth: `max(100%, ${labelWidth + totalDays * dayWidth}px)` }}>
          {/* Header */}
          <div className="flex sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div
              className="shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-20 bg-slate-50 dark:bg-slate-900"
              style={{ width: labelWidth }}
            >
              Tâche
            </div>
            <div className="flex-1 relative">
              {/* Toujours : bandeau mois */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                {monthSegs.map((m, i) => (
                  <div
                    key={i}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400 capitalize px-2 py-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 truncate"
                    style={{ width: m.daysCount * dayWidth }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* 2e bandeau : jours (jour) / semaines (semaine) /
                  rien (mois, trimestre : le bandeau mois fait office) */}
              {scale === "jour" && (
                <div className="flex">
                  {days.map((d, i) => {
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const today = todayStart.getTime() === d.getTime();
                    return (
                      <div
                        key={i}
                        className={cn(
                          "text-[10px] text-center text-slate-500 py-1 border-r border-slate-100 dark:border-slate-800 last:border-r-0",
                          isWeekend && "bg-slate-100 dark:bg-slate-800/40",
                          today &&
                            "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 font-semibold"
                        )}
                        style={{ width: dayWidth }}
                      >
                        {d.getDate()}
                      </div>
                    );
                  })}
                </div>
              )}
              {scale === "semaine" && (
                <div className="flex">
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="text-[10px] text-center text-slate-500 py-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 truncate"
                      style={{ width: w.daysCount * dayWidth }}
                    >
                      {w.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tasks */}
          <div ref={rowsRef} className="relative">
            {/* Ligne "aujourd'hui" verticale */}
            {todayLeft !== null && (
              <div
                className="absolute top-0 bottom-0 z-[5] pointer-events-none"
                style={{ left: labelWidth + todayLeft }}
              >
                <div className="w-px h-full bg-red-400/70" />
              </div>
            )}

            {/* SVG overlay : flèches de dépendances + lien élastique */}
            {(fleches.length > 0 || linkLine) && (
              <CoucheDependances
                fleches={fleches}
                left={labelWidth}
                width={totalDays * dayWidth}
                height={taches.length * ROW_H}
                selection={
                  selectedDep ? `${selectedDep.tacheId}|${selectedDep.depId}` : null
                }
                onSelect={
                  canEdit
                    ? (a) => setSelectedDep({ tacheId: a.tacheId, depId: a.depId })
                    : undefined
                }
                clicsDesactives={linkLine !== null}
                lien={linkLine}
                lienInvalide={linkInvalid}
              />
            )}

            {/* Bouton flottant de suppression de la flèche sélectionnée */}
            {flecheSelectionnee && (
              <button
                type="button"
                data-arrow-ui="1"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  supprimerDependance(
                    flecheSelectionnee.tacheId,
                    flecheSelectionnee.depId
                  )
                }
                className="absolute z-[7] w-9 h-9 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                style={{
                  left: labelWidth + pointMilieuFleche(flecheSelectionnee).x,
                  top: pointMilieuFleche(flecheSelectionnee).y,
                }}
                title="Supprimer cette dépendance"
                aria-label="Supprimer la dépendance sélectionnée"
              >
                <X size={15} />
              </button>
            )}

            {taches.map((t, ti) => {
              const offset = offsetFor(t);
              const duration = durationFor(t);
              const left = offset * dayWidth;
              // Largeur mini 8 px : à l'échelle « mois » (4 px/jour) une tâche
              // d'un jour devenait invisible (0 px).
              const width = Math.max(8, duration * dayWidth - 4);
              const done = t.statut === "TERMINEE";
              const isSubtask = !!t.parentId;
              // Poignées INTERNES seulement si la barre est assez large pour
              // les porter (2 x 12 px + une zone de déplacement). Sur une
              // barre étroite elles se chevauchaient : on croyait tirer un
              // bout et on déplaçait l'autre (constat Youssoufou en échelle
              // mois). Barre étroite : poignées EXTERNES accolées aux bords
              // (une tâche d'1-2 jours restait sinon impossible à agrandir,
              // constat Youssoufou 2026-07-11).
              // Le choix interne/externe se fonde sur la largeur AVANT le
              // geste (props), pas sur la largeur vivante : sinon la
              // poignée en cours d'utilisation serait démontée dès que la
              // barre franchit le seuil de 44 px pendant le drag (l'élément
              // qui capture le pointeur disparaîtrait du DOM, ce qui casse
              // le geste au tactile). Les POSITIONS, elles, suivent la
              // barre en direct (left / width).
              const durProps = Math.max(
                1,
                daysBetween(new Date(t.dateDebut), new Date(t.dateFin)) + 1
              );
              const widthProps = Math.max(8, durProps * dayWidth - 4);
              const showHandles = canEdit && widthProps >= 44;
              const showExtHandles = canEdit && widthProps < 44;
              // Ports de dépendance décalés au-delà des poignées externes
              // pour qu'aucune zone ne se chevauche (le même 2 px de
              // recouvrement « au baiser » que sur une barre large).
              const portGaucheX =
                left - 34 - (showExtHandles ? EXT_HANDLE_W : 0);
              const portDroitX =
                left + width - 2 + (showExtHandles ? EXT_HANDLE_W : 0);
              // Retard : non terminée et fin (affichée) déjà passée.
              const enRetard =
                !done &&
                addDays(minDate, offset + duration - 1).getTime() <
                  todayStart.getTime();
              // Ports de dépendance : visibles au survol (desktop, via
              // group-hover) ou épinglés après un tap sur la barre (mobile).
              const portsVisibles =
                portsPinnedId === t.id || linkSourceId === t.id;
              const cibleDeLien = linkTargetId === t.id;
              return (
                <div
                  key={t.id}
                  className="group flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition"
                >
                  <div
                    onClick={() => onClickTask?.(t.id)}
                    className={`shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-800 min-w-0 flex items-start gap-1.5 sticky left-0 z-[6] bg-white dark:bg-slate-900 ${
                      onClickTask ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" : ""
                    }`}
                    style={{ width: labelWidth }}
                    title={onClickTask ? "Cliquer pour modifier" : undefined}
                  >
                    {t.priorite < 4 && (
                      <Flag
                        size={12}
                        className={`shrink-0 mt-0.5 ${PRIO_FLAG[t.priorite]}`}
                      />
                    )}
                    <div className={isSubtask ? "pl-3 min-w-0" : "min-w-0"}>
                      <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {isSubtask && (
                          <span className="text-slate-400 mr-1">↳</span>
                        )}
                        {t.nom}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {t.chantier.nom}
                        {t.equipe && ` · ${t.equipe.nom}`}
                      </div>
                    </div>
                  </div>
                  <div
                    data-lienrow={t.id}
                    className="relative flex-1"
                    style={{ height: ROW_H, width: totalDays * dayWidth }}
                    onClick={(e) => {
                      // Click sur empty cell : crée une tâche à la date cliquée.
                      // On ne déclenche que si le clic est direct sur ce
                      // conteneur (donc PAS sur une barre / poignée / port).
                      if (e.target !== e.currentTarget) return;
                      if (!canEdit || !onEmptyCellClick) return;
                      const rect =
                        e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const dayIndex = Math.floor(x / dayWidth);
                      if (dayIndex < 0 || dayIndex >= totalDays) return;
                      onEmptyCellClick(
                        addDays(minDate, dayIndex),
                        t.chantier.nom
                      );
                    }}
                  >
                    {scale === "trimestre"
                      ? // À 2 px/jour, des traits par jour seraient illisibles
                        // (et très lourds en DOM) : traits aux frontières de mois.
                        monthSegs.map((m, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800/50 pointer-events-none"
                            style={{
                              left: m.startIdx * dayWidth,
                              width: m.daysCount * dayWidth,
                            }}
                          />
                        ))
                      : days.map((d, i) => {
                          const dow = d.getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          return (
                            <div
                              key={i}
                              className={cn(
                                "absolute top-0 bottom-0 border-r border-slate-100 dark:border-slate-800/50 pointer-events-none",
                                isWeekend && "bg-slate-50 dark:bg-slate-800/20"
                              )}
                              style={{ left: i * dayWidth, width: dayWidth }}
                            />
                          );
                        })}
                    <div
                      data-barre="1"
                      onPointerDown={(e) => startDrag(t, "move", e)}
                      className={cn(
                        "absolute top-2 bottom-2 rounded-md shadow-sm overflow-hidden flex items-center text-xs select-none",
                        statutBgColor[t.statut] ?? "bg-slate-400",
                        statutBorderColor[t.statut],
                        "border",
                        canEdit ? "cursor-grab active:cursor-grabbing" : "",
                        done && "opacity-70",
                        // Retard : liseré terracotta, lisible sur fond
                        // clair comme sombre.
                        enRetard && "ring-2 ring-red-600 dark:ring-red-400",
                        // Cible d'un lien de dépendance en cours de tirage.
                        cibleDeLien &&
                          (linkInvalid
                            ? "ring-2 ring-red-500"
                            : "ring-2 ring-brand-500")
                      )}
                      style={{
                        left,
                        width,
                        touchAction: "none",
                      }}
                      title={`${t.nom} · ${t.avancement}%${enRetard ? " · EN RETARD" : ""} · cliquer pour modifier · glisser les bords pour redimensionner`}
                    >
                      {/* Poignée gauche (resize start) : large, visible */}
                      {showHandles && (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "left", e);
                          }}
                          className="absolute left-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-ew-resize bg-black/15 hover:bg-black/30 transition-colors"
                          style={{ touchAction: "none" }}
                          title="Glisser pour modifier la date de début"
                        >
                          <span className="block w-[2px] h-3 bg-white/80 rounded-full" />
                        </div>
                      )}
                      {/* Poignée droite (resize end) : large, visible */}
                      {showHandles && (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "right", e);
                          }}
                          className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-ew-resize bg-black/15 hover:bg-black/30 transition-colors"
                          style={{ touchAction: "none" }}
                          title="Glisser pour modifier la date de fin"
                        >
                          <span className="block w-[2px] h-3 bg-white/80 rounded-full" />
                        </div>
                      )}
                      {/* Avancement (overlay sombre) */}
                      <div
                        className="absolute inset-y-0 left-0 bg-black/20 pointer-events-none"
                        style={{ width: `${t.avancement}%` }}
                      />
                      {/* Icône retard (si la barre est assez large) */}
                      {enRetard && width >= 56 && (
                        <AlertTriangle
                          size={12}
                          className="relative ml-1.5 shrink-0 text-white/95 pointer-events-none"
                          aria-label="Tâche en retard"
                        />
                      )}
                      {/* Texte centré */}
                      <span className="relative px-2 text-white truncate font-medium pointer-events-none">
                        {duration >= 3
                          ? t.avancement > 0
                            ? `${t.avancement}%`
                            : ""
                          : ""}
                      </span>
                    </div>

                    {/* Poignées EXTERNES (barre trop étroite pour des
                        poignées internes) : petit grip vertical discret
                        accolé à chaque bord, zone tactile de 24 px vers
                        l'extérieur. Rendues HORS de la barre : celle-ci
                        est en overflow-hidden. La zone élargie est en
                        pointer-events none par défaut : le clic-création
                        (garde e.target === e.currentTarget du conteneur
                        de ligne) reste alors joignable au plus près de
                        la barre. Elle ne devient cliquable qu'au survol
                        de la ligne (desktop) ou barre épinglée (tap
                        mobile), comme les ports. Voir EXT_HANDLE_W pour
                        le compromis complet. */}
                    {showExtHandles && (
                      <>
                        <div
                          data-barre="1"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "left", e);
                          }}
                          className={cn(
                            "absolute top-0 bottom-0 z-[6] flex items-center justify-end cursor-ew-resize group/ext",
                            "pointer-events-none group-hover:pointer-events-auto",
                            portsVisibles && "pointer-events-auto"
                          )}
                          style={{
                            left: left - EXT_HANDLE_W,
                            width: EXT_HANDLE_W,
                            touchAction: "none",
                          }}
                          title="Glisser pour modifier la date de début"
                        >
                          <span className="block w-[3px] h-3.5 mr-[2px] rounded-full bg-slate-400/90 dark:bg-slate-500 shadow-sm group-hover/ext:bg-slate-600 dark:group-hover/ext:bg-slate-300 transition-colors" />
                        </div>
                        <div
                          data-barre="1"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startDrag(t, "right", e);
                          }}
                          className={cn(
                            "absolute top-0 bottom-0 z-[6] flex items-center justify-start cursor-ew-resize group/ext",
                            "pointer-events-none group-hover:pointer-events-auto",
                            portsVisibles && "pointer-events-auto"
                          )}
                          style={{
                            left: left + width,
                            width: EXT_HANDLE_W,
                            touchAction: "none",
                          }}
                          title="Glisser pour modifier la date de fin"
                        >
                          <span className="block w-[3px] h-3.5 ml-[2px] rounded-full bg-slate-400/90 dark:bg-slate-500 shadow-sm group-hover/ext:bg-slate-600 dark:group-hover/ext:bg-slate-300 transition-colors" />
                        </div>
                      </>
                    )}

                    {/* Ports de dépendance (ronds aux extrémités) : tirer
                        vers une autre barre pour créer une dépendance.
                        Positionnés hors de la barre pour ne pas gêner les
                        poignées de redimensionnement. */}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          data-port="1"
                          aria-label={`Créer une dépendance vers « ${t.nom} » (la tâche dépendra de la cible)`}
                          onPointerDown={(e) =>
                            startLinkDrag(t, "gauche", ti, e)
                          }
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 z-[6] w-9 h-9 flex items-center justify-center rounded-full",
                            "opacity-0 pointer-events-none transition-opacity",
                            "group-hover:opacity-100 group-hover:pointer-events-auto",
                            portsVisibles && "opacity-100 pointer-events-auto"
                          )}
                          style={{ left: portGaucheX, touchAction: "none" }}
                          title="Tirer vers une autre barre : cette tâche dépendra de la barre visée"
                        >
                          <span className="block w-3.5 h-3.5 rounded-full border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-slate-900 shadow-sm" />
                        </button>
                        <button
                          type="button"
                          data-port="1"
                          aria-label={`Créer une dépendance depuis « ${t.nom} » (la cible dépendra de cette tâche)`}
                          onPointerDown={(e) =>
                            startLinkDrag(t, "droite", ti, e)
                          }
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 z-[6] w-9 h-9 flex items-center justify-center rounded-full",
                            "opacity-0 pointer-events-none transition-opacity",
                            "group-hover:opacity-100 group-hover:pointer-events-auto",
                            portsVisibles && "opacity-100 pointer-events-auto"
                          )}
                          style={{ left: portDroitX, touchAction: "none" }}
                          title="Tirer vers une autre barre : la barre visée dépendra de cette tâche"
                        >
                          <span className="block w-3.5 h-3.5 rounded-full border-2 border-slate-500 dark:border-slate-300 bg-white dark:bg-slate-900 shadow-sm" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Event markers (draggables si canEdit), filtrés par showEvents */}
            {visibleEvents.map((ev) => {
              const ov = eventOverrides[ev.id];
              const offset =
                ov !== undefined
                  ? ov.offset
                  : daysBetween(minDate, new Date(ev.date));
              const left = offset * dayWidth;
              const isDragging = ov !== undefined && ov.cible === undefined;
              return (
                <div
                  key={ev.id}
                  className="flex border-b border-slate-100 dark:border-slate-800"
                >
                  <div
                    className="shrink-0 px-3 py-2 border-r border-slate-200 dark:border-slate-800 sticky left-0 z-[6] bg-white dark:bg-slate-900"
                    style={{ width: labelWidth }}
                  >
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      {ev.type === "COMMANDE" ? (
                        <Package size={10} />
                      ) : (
                        <Truck size={10} />
                      )}
                      {ev.type === "COMMANDE" ? "Livraison" : "Restitution"}
                    </div>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {ev.label}
                    </div>
                  </div>
                  <div
                    className="relative flex-1"
                    style={{ height: 36, width: totalDays * dayWidth }}
                  >
                    <div
                      onPointerDown={(e) => startEventDrag(ev, e)}
                      className={cn(
                        "absolute top-1 bottom-1 w-3 rounded-sm flex items-center justify-center text-white text-[10px] font-bold shadow-sm",
                        ev.type === "COMMANDE"
                          ? "bg-orange-500"
                          : "bg-purple-500",
                        canEdit
                          ? "cursor-grab active:cursor-grabbing hover:w-4 transition-all"
                          : "cursor-help",
                        isDragging && "scale-125"
                      )}
                      style={{ left, touchAction: "none" }}
                      title={
                        canEdit
                          ? `${ev.type === "COMMANDE" ? "Livraison prévue" : "Fin de location"} : ${ev.label}\nGlisser pour replanifier.`
                          : `${ev.type === "COMMANDE" ? "Livraison prévue" : "Fin de location"} : ${ev.label}`
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 px-3 py-2 border-t border-slate-100 dark:border-slate-800 italic leading-relaxed">
          Tâches : cliquer = modifier · glisser barre = déplacer (avec ses
          successeurs si le réglage est actif) · glisser{" "}
          <strong>poignées sombres</strong> aux extrémités = ajuster la durée
          d&apos;un seul côté (sur une barre étroite, les poignées sont les{" "}
          <strong>petits traits gris</strong> accolés à ses bords) · clic sur
          case vide = créer à cette date.
          Dépendances : survoler ou toucher une barre fait apparaître les{" "}
          <strong>ronds</strong> à ses extrémités ; tirer un rond vers une
          autre barre crée la dépendance ; cliquer une flèche = la
          sélectionner puis la supprimer via la croix. Liseré rouge = tâche en
          retard. Ligne rouge = aujourd&apos;hui (bouton « Aujourd&apos;hui »
          pour la recentrer). Scroll horizontal :{" "}
          <kbd className="px-1 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
            Shift
          </kbd>{" "}
          + molette.
        </div>
      )}
    </div>
  );
}
