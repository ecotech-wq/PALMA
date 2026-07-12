"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Lightbulb, Maximize2, Minus, Plus, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import { computePert, type PertTaskInput, type PertResult } from "@/lib/pert";
import {
  ajouterDependance,
  majPositionPert,
  reinitialiserPositionsPert,
  retirerDependance,
} from "./actions";
import { creeraitUnCycle } from "./gantt/dependances";
import {
  calculerPositionsPert,
  ordonnerNiveauxParBarycentre,
  PERT_NODE_H,
  PERT_NODE_W,
  PERT_PADDING,
} from "./pert/disposition";
import { noeudSousPoint, type NoeudPositionne } from "./pert/hittest";

type TachePert = {
  id: string;
  nom: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  avancement: number;
  statut: string;
  equipe: { nom: string } | null;
  chantier: { id?: string; nom: string };
  dependances: { id: string }[];
  /** Position manuelle partagée (drag façon drawio). NULL = auto. */
  pertX?: number | null;
  pertY?: number | null;
};

/** Override local de position (drag en cours ou en attente du serveur).
 *  `enregistre` : envoyé au serveur, retiré quand les props rattrapent. */
type PositionLocale = { x: number; y: number; enregistre: boolean };

type Vue2D = { k: number; tx: number; ty: number };

type LienEnCours = {
  sourceId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cibleId: string | null;
  invalide: boolean;
};

type Arete = {
  tacheId: string;
  depId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  critique: boolean;
  optimiste: boolean;
};

const K_MIN = 0.15;
const K_MAX = 2.5;

const STATUT_POINT: Record<string, string> = {
  A_FAIRE: "fill-slate-400",
  EN_COURS: "fill-blue-500",
  TERMINEE: "fill-green-500",
  BLOQUEE: "fill-red-500",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function clampK(k: number): number {
  return Math.min(K_MAX, Math.max(K_MIN, k));
}

/** Clé de comparaison chantier (id si présent, sinon nom). */
function cleChantier(c: { id?: string; nom: string }): string {
  return c.id ?? c.nom;
}

/** Courbe de Bézier entre la sortie du prédécesseur et l'entrée du suivant. */
function cheminArete(a: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = (a.x1 + a.x2) / 2;
  return `M ${a.x1} ${a.y1} C ${mx} ${a.y1}, ${mx} ${a.y2}, ${a.x2} ${a.y2}`;
}

/**
 * Réseau PERT interactif : moteur CPM (ES/EF/LS/LF, marges, chemin critique),
 * layout par niveaux décroisé au barycentre, pan/zoom (molette, pincement,
 * boutons, double-tap = ajuster), noeuds cliquables (ouvre la modale
 * d'édition partagée), création de dépendance en tirant depuis le port droit
 * d'une carte, suppression au tap sur une flèche (croix + confirmation).
 * Les cartes se déplacent au doigt façon drawio (seuil 6 px pour distinguer
 * du tap) ; la position est enregistrée en base (pertX/pertY) et partagée
 * par toute l'équipe, « Réorganiser » revient à la disposition automatique.
 * Les ajouts/retraits de flèches et les positions suivent le motif
 * anti-flash du Gantt (override local annoté, purgé au rattrapage).
 */
export function PertChart({
  taches,
  canEdit = false,
  onClickTask,
}: {
  taches: TachePert[];
  canEdit?: boolean;
  /** Tap court sur une carte : ouvre la modale d'édition. */
  onClickTask?: (tacheId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Transform pan/zoom : état pour le rendu, ref miroir pour les gestes
  // (les listeners natifs liraient sinon une valeur périmée).
  const [vue, setVue] = useState<Vue2D>({ k: 1, tx: 0, ty: 0 });
  const vueRef = useRef<Vue2D>(vue);
  const appliquerVue = useCallback((v: Vue2D) => {
    vueRef.current = v;
    setVue(v);
  }, []);

  // Registre des pointeurs actifs (pan à un doigt, pinch à deux).
  const pointeursRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    tx0: number;
    ty0: number;
    bouge: boolean;
    noeudId: string | null;
    t0: number;
    /** Position monde du noeud au début du geste (drag de carte). */
    noeudPos0: { x: number; y: number } | null;
    /** Override local préexistant, restauré sur pointercancel/échec. */
    noeudLocalAvant: PositionLocale | null;
    /** Dernière position monde pendant le drag (sauvée au relâcher). */
    noeudPosCourante: { x: number; y: number } | null;
  } | null>(null);
  const pinchRef = useRef<{
    d0: number;
    k0: number;
    w0: { x: number; y: number };
  } | null>(null);
  const dernierTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  // Garde multi-touch : un seul tirage de lien à la fois.
  const lienActifRef = useRef(false);
  const ajusteFaitRef = useRef(false);

  // Tirage de lien en cours (flèche élastique) et flèche sélectionnée.
  const [lien, setLien] = useState<LienEnCours | null>(null);
  const [selection, setSelection] = useState<{
    tacheId: string;
    depId: string;
  } | null>(null);

  // Flèches affichées avant confirmation serveur (motif anti-flash : un
  // ajout n'est retiré que quand les props le contiennent, un retrait ne
  // réapparaît que si le serveur a échoué).
  const [optimisticDeps, setOptimisticDeps] = useState<
    { tacheId: string; depId: string }[]
  >([]);
  const [removedDeps, setRemovedDeps] = useState<string[]>([]);

  // Positions locales des cartes (drag en cours ou en attente serveur),
  // même motif anti-flash que les flèches. `resetIds` : après un
  // « Réorganiser », les positions manuelles des props sont ignorées
  // tâche par tâche, chaque id étant purgé quand les props rafraîchies
  // l'ont rattrapé (pertX/pertY revenus à NULL). Un drag pendant la
  // fenêtre d'attente reprend la main sur son id (override local).
  const [positionsLocales, setPositionsLocales] = useState<
    Map<string, PositionLocale>
  >(() => new Map());
  const positionsLocalesRef = useRef(positionsLocales);
  positionsLocalesRef.current = positionsLocales;
  const [resetIds, setResetIds] = useState<Set<string>>(() => new Set());

  const tachesParId = useMemo(
    () => new Map(taches.map((t) => [t.id, t])),
    [taches]
  );

  // Moteur CPM. computePert lève une erreur si un cycle existe en base.
  const { pert, erreurPert } = useMemo<{
    pert: PertResult | null;
    erreurPert: string | null;
  }>(() => {
    const inputs: PertTaskInput[] = taches.map((t) => ({
      id: t.id,
      nom: t.nom,
      dateDebut: new Date(t.dateDebut),
      dateFin: new Date(t.dateFin),
      dependances: (t.dependances ?? []).map((d) => d.id),
    }));
    try {
      return { pert: computePert(inputs), erreurPert: null };
    } catch (e) {
      return {
        pert: null,
        erreurPert: e instanceof Error ? e.message : "erreur",
      };
    }
  }, [taches]);

  // Layout : niveaux décroisés au barycentre, colonnes centrées.
  const { positions, largeur, hauteur } = useMemo(() => {
    if (!pert) {
      return {
        positions: new Map<string, { x: number; y: number }>(),
        largeur: 1,
        hauteur: 1,
      };
    }
    const preds = new Map(pert.taches.map((p) => [p.id, p.dependances]));
    const ordre = ordonnerNiveauxParBarycentre(pert.niveaux, preds);
    return calculerPositionsPert(ordre);
  }, [pert]);

  const pertParId = useMemo(
    () => new Map((pert?.taches ?? []).map((p) => [p.id, p])),
    [pert]
  );

  // Positions effectives : disposition automatique, recouverte par les
  // positions manuelles partagées (props pertX/pertY), elles-mêmes
  // recouvertes par les overrides locaux (drag en cours ou pas encore
  // rattrapé). Après « Réorganiser », tout revient à l'automatique.
  const positionsEffectives = useMemo(() => {
    const m = new Map(positions);
    for (const t of taches) {
      if (resetIds.has(t.id)) continue; // « Réorganiser » en attente
      if (t.pertX != null && t.pertY != null && m.has(t.id)) {
        m.set(t.id, { x: t.pertX, y: t.pertY });
      }
    }
    for (const [id, p] of positionsLocales) {
      if (m.has(id)) m.set(id, { x: p.x, y: p.y });
    }
    return m;
  }, [positions, taches, positionsLocales, resetIds]);
  // Miroirs refs : les closures de gestes (listeners window) liraient
  // sinon la valeur du rendu où le geste a commencé.
  const positionsEffectivesRef = useRef(positionsEffectives);
  positionsEffectivesRef.current = positionsEffectives;

  // Noeuds dans l'ordre de RENDU (pert.taches) pour le hit-test : en cas
  // de chevauchement, le dernier rendu est visuellement au-dessus et doit
  // gagner.
  const noeudsOrdonnes = useMemo<NoeudPositionne[]>(
    () =>
      (pert?.taches ?? []).flatMap((p) => {
        const pos = positionsEffectives.get(p.id);
        return pos ? [{ id: p.id, x: pos.x, y: pos.y }] : [];
      }),
    [pert, positionsEffectives]
  );
  const noeudsOrdonnesRef = useRef(noeudsOrdonnes);
  noeudsOrdonnesRef.current = noeudsOrdonnes;

  // Boîte englobante monde (les positions manuelles peuvent être
  // négatives ou déborder du monde automatique) : sert au fit.
  const bornes = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positionsEffectives.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + PERT_NODE_W);
      maxY = Math.max(maxY, p.y + PERT_NODE_H);
    }
    if (!Number.isFinite(minX)) {
      return { x: 0, y: 0, w: largeur, h: hauteur };
    }
    return {
      x: minX - PERT_PADDING,
      y: minY - PERT_PADDING,
      w: maxX - minX + PERT_PADDING * 2,
      h: maxY - minY + PERT_PADDING * 2,
    };
  }, [positionsEffectives, largeur, hauteur]);
  const bornesRef = useRef(bornes);
  bornesRef.current = bornes;

  /** Ajuste le zoom pour voir tout le réseau (fit). */
  const ajuster = useCallback(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const marge = 12;
    const b = bornesRef.current;
    const k = clampK(
      Math.min((rect.width - marge * 2) / b.w, (rect.height - marge * 2) / b.h, 1.2)
    );
    appliquerVue({
      k,
      tx: (rect.width - b.w * k) / 2 - b.x * k,
      ty: (rect.height - b.h * k) / 2 - b.y * k,
    });
  }, [appliquerVue]);

  // Ajustement initial (une seule fois, pour ne pas perdre le cadrage de
  // l'utilisateur à chaque router.refresh).
  useEffect(() => {
    if (ajusteFaitRef.current) return;
    if (!pert || pert.taches.length === 0) return;
    ajusteFaitRef.current = true;
    ajuster();
  }, [pert, ajuster]);

  /** Zoom autour d'un point écran (souris, pincement, boutons). */
  const zoomEn = useCallback(
    (sx: number, sy: number, kCible: number) => {
      const v = vueRef.current;
      const k = clampK(kCible);
      const wx = (sx - v.tx) / v.k;
      const wy = (sy - v.ty) / v.k;
      appliquerVue({ k, tx: sx - wx * k, ty: sy - wy * k });
    },
    [appliquerVue]
  );

  function zoomCentre(facteur: number) {
    const el = conteneurRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomEn(rect.width / 2, rect.height / 2, vueRef.current.k * facteur);
  }

  // Molette = zoom au curseur. Listener natif non passif : React attache
  // wheel en passif et preventDefault y serait ignoré (la page défilerait).
  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const facteur = Math.exp(-e.deltaY * (e.ctrlKey ? 0.004 : 0.0015));
      zoomEn(
        e.clientX - rect.left,
        e.clientY - rect.top,
        vueRef.current.k * facteur
      );
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, [zoomEn]);

  // Purge anti-flash : un ajout optimiste disparaît de la liste locale
  // quand les props le contiennent, un retrait quand elles ne l'ont plus.
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
      const next = prev.filter((cle) => {
        const [tid, did] = cle.split("|");
        const t = taches.find((x) => x.id === tid);
        return !!t?.dependances?.some((d) => d.id === did);
      });
      return next.length === prev.length ? prev : next;
    });
    // Positions : un override enregistré est purgé quand les props
    // rafraîchies portent (à epsilon près) la position sauvée.
    setPositionsLocales((prev) => {
      let modifie = false;
      const next = new Map(prev);
      for (const [id, p] of prev) {
        if (!p.enregistre) continue;
        const t = taches.find((x) => x.id === id);
        if (!t) {
          next.delete(id);
          modifie = true;
          continue;
        }
        if (
          t.pertX != null &&
          t.pertY != null &&
          Math.abs(t.pertX - p.x) < 0.5 &&
          Math.abs(t.pertY - p.y) < 0.5
        ) {
          next.delete(id);
          modifie = true;
        }
      }
      return modifie ? next : prev;
    });
    // « Réorganiser » : un id est purgé quand les props rafraîchies ont
    // rattrapé la remise à zéro (pertX/pertY à NULL) ou que la tâche a
    // disparu de la sélection.
    setResetIds((prev) => {
      if (prev.size === 0) return prev;
      let modifie = false;
      const next = new Set(prev);
      for (const id of prev) {
        const t = taches.find((x) => x.id === id);
        if (!t || (t.pertX == null && t.pertY == null)) {
          next.delete(id);
          modifie = true;
        }
      }
      return modifie ? next : prev;
    });
  }, [taches]);

  /* ---------------- Gestes pan / pinch / tap sur la surface ---------------- */

  /** Annule un drag de carte : retour à la position d'avant le geste
   *  (override local préexistant restauré, sinon retiré). */
  const annulerDragNoeud = useCallback(
    (pan: { noeudId: string | null; noeudLocalAvant: PositionLocale | null }) => {
      const id = pan.noeudId;
      if (!id) return;
      setPositionsLocales((prev) => {
        const next = new Map(prev);
        if (pan.noeudLocalAvant) next.set(id, pan.noeudLocalAvant);
        else next.delete(id);
        return next;
      });
    },
    []
  );

  function surFondPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const cibleEl = e.target as Element | null;
    // Désélectionne la flèche si le toucher ne vise pas une flèche.
    if (!cibleEl?.closest?.("[data-pert-arete]")) setSelection(null);
    if (lienActifRef.current) return;
    e.preventDefault();
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const rect = conteneurRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pointeurs = pointeursRef.current;

    if (pointeurs.size >= 2) return; // 3e doigt : ignoré
    pointeurs.set(e.pointerId, p);

    if (pointeurs.size === 1) {
      // Noeud visé résolu par hit-test MONDE (dernier rendu = dessus),
      // pas par closest("[data-pert-noeud]") : le disque d'accroche
      // invisible du port d'une carte voisine peut peindre AU-DESSUS de
      // la carte visée (positions posées à la main) ; closest remonterait
      // alors à la voisine, pas à la carte que l'utilisateur voit.
      const v = vueRef.current;
      const noeudId = noeudSousPoint(
        noeudsOrdonnesRef.current,
        (p.x - v.tx) / v.k,
        (p.y - v.ty) / v.k
      );
      panRef.current = {
        pointerId: e.pointerId,
        x0: p.x,
        y0: p.y,
        tx0: vueRef.current.tx,
        ty0: vueRef.current.ty,
        bouge: false,
        noeudId,
        t0: Date.now(),
        noeudPos0: noeudId
          ? positionsEffectivesRef.current.get(noeudId) ?? null
          : null,
        noeudLocalAvant: noeudId
          ? positionsLocalesRef.current.get(noeudId) ?? null
          : null,
        noeudPosCourante: null,
      };
    } else {
      // Deux doigts : pincement. Le clic en attente est annulé, et un
      // drag de carte déjà entamé revient à sa position d'avant.
      if (panRef.current) {
        if (canEdit && panRef.current.noeudId && panRef.current.bouge) {
          annulerDragNoeud(panRef.current);
        }
        panRef.current.bouge = true;
        panRef.current.noeudId = null;
      }
      const [a, b] = [...pointeurs.values()];
      const v = vueRef.current;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinchRef.current = {
        d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        k0: v.k,
        w0: { x: (mid.x - v.tx) / v.k, y: (mid.y - v.ty) / v.k },
      };
    }
  }

  function surFondPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pointeurs = pointeursRef.current;
    if (!pointeurs.has(e.pointerId)) return;
    const rect = conteneurRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pointeurs.set(e.pointerId, p);

    if (pinchRef.current && pointeurs.size >= 2) {
      const [a, b] = [...pointeurs.values()];
      const pinch = pinchRef.current;
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const k = clampK(pinch.k0 * (d / pinch.d0));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      appliquerVue({
        k,
        tx: mid.x - pinch.w0.x * k,
        ty: mid.y - pinch.w0.y * k,
      });
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      const dx = p.x - pan.x0;
      const dy = p.y - pan.y0;
      // Seuil 6 px : en deçà, le geste reste un tap (ouvre la modale).
      if (!pan.bouge && Math.hypot(dx, dy) > 6) pan.bouge = true;
      if (!pan.bouge) return;
      if (canEdit && pan.noeudId && pan.noeudPos0) {
        // Drag d'une carte : déplacement en coordonnées MONDE (le delta
        // écran est divisé par le zoom k). Aperçu optimiste immédiat.
        const k = vueRef.current.k;
        const pos = {
          x: pan.noeudPos0.x + dx / k,
          y: pan.noeudPos0.y + dy / k,
        };
        pan.noeudPosCourante = pos;
        const id = pan.noeudId;
        setPositionsLocales((prev) => {
          const next = new Map(prev);
          next.set(id, { x: pos.x, y: pos.y, enregistre: false });
          return next;
        });
      } else {
        // Pan du fond : uniquement quand le geste n'a pas commencé sur
        // une carte (ou en lecture seule, où les cartes ne bougent pas).
        appliquerVue({
          k: vueRef.current.k,
          tx: pan.tx0 + dx,
          ty: pan.ty0 + dy,
        });
      }
    }
  }

  function surFondPointerFin(
    e: React.PointerEvent<SVGSVGElement>,
    annule: boolean
  ) {
    const pointeurs = pointeursRef.current;
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.delete(e.pointerId);

    if (pinchRef.current && pointeurs.size < 2) {
      pinchRef.current = null;
      // Un doigt reste posé : on repart en pan depuis sa position.
      const restant = [...pointeurs.entries()][0];
      if (restant) {
        const v = vueRef.current;
        panRef.current = {
          pointerId: restant[0],
          x0: restant[1].x,
          y0: restant[1].y,
          tx0: v.tx,
          ty0: v.ty,
          bouge: true,
          noeudId: null,
          t0: 0,
          noeudPos0: null,
          noeudLocalAvant: null,
          noeudPosCourante: null,
        };
      } else {
        panRef.current = null;
      }
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      panRef.current = null;
      if (annule) {
        // pointercancel pendant un drag de carte : position d'avant.
        if (canEdit && pan.noeudId && pan.bouge) annulerDragNoeud(pan);
        return;
      }
      const estTap = !pan.bouge && Date.now() - pan.t0 < 600;
      if (!estTap) {
        // Relâcher après un drag de carte : la position est enregistrée
        // pour toute l'équipe. Anti-flash : l'override local (annoté
        // enregistre) reste affiché jusqu'au rattrapage par les props.
        if (canEdit && pan.noeudId && pan.bouge && pan.noeudPosCourante) {
          const id = pan.noeudId;
          const { x, y } = pan.noeudPosCourante;
          setPositionsLocales((prev) => {
            const next = new Map(prev);
            next.set(id, { x, y, enregistre: true });
            return next;
          });
          // L'utilisateur re-pose ce noeud : une éventuelle remise à
          // zéro en attente ne le concerne plus.
          setResetIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          majPositionPert(id, x, y)
            .then(() => {
              router.refresh();
            })
            .catch((err: unknown) => {
              annulerDragNoeud(pan);
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Erreur lors de l'enregistrement de la position"
              );
            });
        }
        return;
      }
      if (pan.noeudId) {
        if (onClickTask) onClickTask(pan.noeudId);
        return;
      }
      // Double-tap sur le fond = ajuster la vue.
      const avant = dernierTapRef.current;
      const maintenant = Date.now();
      if (
        avant &&
        maintenant - avant.t < 350 &&
        Math.hypot(pan.x0 - avant.x, pan.y0 - avant.y) < 40
      ) {
        dernierTapRef.current = null;
        ajuster();
      } else {
        dernierTapRef.current = { t: maintenant, x: pan.x0, y: pan.y0 };
      }
    }
  }

  /* ---------------- Création de dépendance (port -> carte) ---------------- */

  function demarrerLien(source: TachePert, e: React.PointerEvent) {
    if (!canEdit) return;
    if (lienActifRef.current) return;
    if (pointeursRef.current.size > 0) return; // pan ou pinch déjà en cours
    // Le disque d'accroche du port (invisible, rayon constant à l'écran)
    // peut peindre AU-DESSUS d'une carte voisine posée à la main : si le
    // noeud au sommet sous le doigt (hit-test monde, dernier rendu gagne)
    // n'est pas la source, l'utilisateur vise cette autre carte. On ne
    // démarre pas de lien et on laisse l'événement remonter au fond, où
    // surFondPointerDown résout le noeud par le même hit-test (drag/tap
    // de la carte visée). Point dans AUCUN rectangle = zone libre du
    // port : le tirage reste légitime.
    const rectGarde = conteneurRef.current?.getBoundingClientRect();
    if (rectGarde) {
      const v = vueRef.current;
      const idSous = noeudSousPoint(
        noeudsOrdonnesRef.current,
        (e.clientX - rectGarde.left - v.tx) / v.k,
        (e.clientY - rectGarde.top - v.ty) / v.k
      );
      if (idSous !== null && idSous !== source.id) return;
    }
    lienActifRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* indisponible : on continue sans */
    }
    const pointerId = e.pointerId;
    const pos = positionsEffectivesRef.current.get(source.id);
    if (!pos) {
      lienActifRef.current = false;
      return;
    }
    const x0 = pos.x + PERT_NODE_W;
    const y0 = pos.y + PERT_NODE_H / 2;
    // Cible courante suivie en closure (l'état ne sert qu'au rendu).
    let cibleId: string | null = null;
    let cibleInvalide = false;

    setSelection(null);
    setLien({ sourceId: source.id, x0, y0, x1: x0, y1: y0, cibleId: null, invalide: false });

    function versMonde(ev: PointerEvent) {
      const rect = conteneurRef.current?.getBoundingClientRect();
      const v = vueRef.current;
      if (!rect) return { x: x0, y: y0 };
      return {
        x: (ev.clientX - rect.left - v.tx) / v.k,
        y: (ev.clientY - rect.top - v.ty) / v.k,
      };
    }

    function surMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const p = versMonde(ev);
      // Cible = le noeud dont le RECTANGLE (repère monde) contient le
      // pointeur, hors source. Pas de repli à distance : hors de toute
      // carte, pas de cible. L'ancien elementFromPoint retenait la
      // mauvaise carte à faible zoom (les grands ports invisibles des
      // voisines passaient au-dessus de la carte visée).
      const id = noeudSousPoint(noeudsOrdonnesRef.current, p.x, p.y, source.id);
      if (id) {
        const t = tachesParId.get(id);
        cibleId = t ? id : null;
        cibleInvalide =
          !!t && cleChantier(t.chantier) !== cleChantier(source.chantier);
      } else {
        cibleId = null;
        cibleInvalide = false;
      }
      setLien({
        sourceId: source.id,
        x0,
        y0,
        x1: p.x,
        y1: p.y,
        cibleId,
        invalide: cibleInvalide,
      });
    }

    function fin() {
      window.removeEventListener("pointermove", surMove);
      window.removeEventListener("pointerup", surUp);
      window.removeEventListener("pointercancel", surCancel);
      lienActifRef.current = false;
      setLien(null);
    }

    function surCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      fin();
    }

    function surUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      fin();
      if (!cibleId) return;
      if (cibleInvalide) {
        toast.error(
          "Impossible : les deux tâches doivent appartenir au même chantier."
        );
        return;
      }
      // La cible dépendra de la source (fin de la source -> début de la cible).
      const tacheId = cibleId;
      const depId = source.id;
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
        .then(() => {
          toast.success("Dépendance créée.");
          router.refresh();
        })
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

    window.addEventListener("pointermove", surMove);
    window.addEventListener("pointerup", surUp);
    window.addEventListener("pointercancel", surCancel);
  }

  /** Suppression de la flèche sélectionnée (croix + confirmation). */
  function supprimerArete(tacheId: string, depId: string) {
    if (!window.confirm("Supprimer cette dépendance ?")) return;
    const cle = `${tacheId}|${depId}`;
    setSelection(null);
    // Anti-flash inversé : la flèche disparaît tout de suite ; elle ne
    // réapparaît que si le serveur échoue.
    setRemovedDeps((prev) => [...prev, cle]);
    setOptimisticDeps((prev) =>
      prev.filter((x) => !(x.tacheId === tacheId && x.depId === depId))
    );
    retirerDependance(tacheId, depId)
      .then(() => {
        toast.success("Dépendance supprimée.");
        router.refresh();
      })
      .catch((err: unknown) => {
        setRemovedDeps((prev) => prev.filter((k) => k !== cle));
        toast.error(
          err instanceof Error
            ? err.message
            : "Erreur lors de la suppression de la dépendance"
        );
      });
  }

  /** Bouton « Réorganiser » : efface les positions manuelles (partagées)
   *  et revient à la disposition automatique par niveaux. Portée : les
   *  chantiers RÉELLEMENT affichés dans la vue (jamais tout le périmètre
   *  accessible), revalidés côté serveur contre l'espace. La remise à
   *  zéro couvre toutes les tâches de ces chantiers, y compris celles
   *  masquées par un filtre équipe/ouvrier : la confirmation l'annonce. */
  function reorganiser() {
    if (!canEdit || resetIds.size > 0) return;
    const chantierIds = [
      ...new Set(
        taches.flatMap((t) => (t.chantier.id ? [t.chantier.id] : []))
      ),
    ];
    if (chantierIds.length === 0) {
      toast.error(
        "Impossible d'identifier les chantiers affichés : réorganisation annulée."
      );
      return;
    }
    const perimetre =
      chantierIds.length === 1
        ? "toutes les tâches du chantier affiché"
        : `toutes les tâches des ${chantierIds.length} chantiers affichés`;
    if (
      !window.confirm(
        `Réorganiser automatiquement le réseau ? Les positions posées à la main de ${perimetre} (y compris les tâches masquées par les filtres) seront effacées pour toute l'équipe.`
      )
    ) {
      return;
    }
    // Anti-flash : chaque carte passe tout de suite en automatique, son
    // id restant annoté jusqu'au rattrapage par les props (pertX à NULL).
    // Seules les tâches d'un chantier identifié sont annotées : les
    // autres ne seront pas remises à zéro par le serveur, leur annotation
    // ne serait jamais purgée (bouton bloqué).
    const idsAffiches = taches
      .filter((t) => t.chantier.id != null)
      .map((t) => t.id);
    setResetIds(new Set(idsAffiches));
    setPositionsLocales(new Map());
    reinitialiserPositionsPert(chantierIds)
      .then(() => {
        toast.success("Disposition automatique restaurée.");
        router.refresh();
      })
      .catch((err: unknown) => {
        setResetIds(new Set());
        toast.error(
          err instanceof Error
            ? err.message
            : "Erreur lors de la réorganisation"
        );
      });
    // Recadre sur la disposition automatique dès qu'elle est affichée.
    requestAnimationFrame(() => ajuster());
  }

  /* ------------------------------- Rendu ------------------------------- */

  if (taches.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-500">
        Aucune tâche. Crée des tâches avec leurs dépendances pour visualiser le
        diagramme PERT.
      </div>
    );
  }

  if (erreurPert || !pert) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-900 p-6 text-center text-sm text-red-700 dark:text-red-400">
        Impossible de calculer le PERT : {erreurPert ?? "erreur"}. Vérifie les
        dépendances (cycle possible).
      </div>
    );
  }

  const totalDeps = taches.reduce(
    (s, t) => s + (t.dependances?.length ?? 0),
    0
  );
  const sansDependance = totalDeps === 0 && taches.length >= 2;

  // Flèches : dépendances des props (hors retraits optimistes) + ajouts
  // optimistes pas encore rattrapés par les props.
  const aretes: Arete[] = [];
  const pousserArete = (tacheId: string, depId: string, optimiste: boolean) => {
    const de = positionsEffectives.get(depId);
    const vers = positionsEffectives.get(tacheId);
    if (!de || !vers) return;
    const pDep = pertParId.get(depId);
    const pT = pertParId.get(tacheId);
    // Arête critique : les deux extrémités sont critiques ET l'enchaînement
    // est tendu (EF du prédécesseur = ES du suivant), définition CPM.
    const critique =
      !optimiste &&
      !!pDep &&
      !!pT &&
      pDep.critical &&
      pT.critical &&
      pDep.EF.getTime() === pT.ES.getTime();
    aretes.push({
      tacheId,
      depId,
      x1: de.x + PERT_NODE_W,
      y1: de.y + PERT_NODE_H / 2,
      x2: vers.x - 6,
      y2: vers.y + PERT_NODE_H / 2,
      critique,
      optimiste,
    });
  };
  for (const p of pert.taches) {
    for (const depId of p.dependances) {
      if (removedDeps.includes(`${p.id}|${depId}`)) continue;
      pousserArete(p.id, depId, false);
    }
  }
  for (const od of optimisticDeps) {
    if (removedDeps.includes(`${od.tacheId}|${od.depId}`)) continue;
    const deja = taches
      .find((x) => x.id === od.tacheId)
      ?.dependances?.some((d) => d.id === od.depId);
    if (!deja) pousserArete(od.tacheId, od.depId, true);
  }

  const areteSel = selection
    ? aretes.find(
        (a) =>
          a.tacheId === selection.tacheId && a.depId === selection.depId
      ) ?? null
    : null;

  // Rayon d'accroche des ports : constant à l'écran (>= 44 px de diamètre)
  // tant que le zoom le permet, MAIS plafonné en unités monde. Sans
  // plafond, à faible zoom le disque invisible d'une carte débordait sur
  // les cartes voisines et volait leur pointerdown : le tirage partait
  // alors d'une autre carte que celle visée (moitié du bug de connexion).
  const rayonPort = Math.min(45, 26 / vue.k);

  return (
    <div className="space-y-3">
      {sansDependance && (
        <div className="rounded-xl border border-accent-200 dark:border-accent-800 bg-accent-50 dark:bg-accent-900/30 px-4 py-3 text-sm text-accent-800 dark:text-accent-200 flex items-start gap-3">
          <Lightbulb size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              Aucune dépendance définie entre tes tâches.
            </p>
            <p className="text-accent-700 dark:text-accent-300 mt-0.5">
              Le diagramme PERT révèle ses chemins critiques quand les tâches
              sont enchaînées.
              {canEdit
                ? " Tire une flèche depuis le rond à droite d'une carte vers une autre carte, ou ouvre une tâche (un tap sur sa carte) et indique ses dépendances."
                : " Les dépendances se définissent depuis la fiche de chaque tâche."}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div
          ref={conteneurRef}
          className="relative w-full overflow-hidden select-none bg-slate-50/50 dark:bg-slate-950/40"
          style={{ height: "75vh", touchAction: "none" }}
        >
          <svg
            ref={svgRef}
            className="block w-full h-full"
            role="application"
            aria-label="Réseau PERT des tâches (pan, zoom, dépendances)"
            onPointerDown={surFondPointerDown}
            onPointerMove={surFondPointerMove}
            onPointerUp={(e) => surFondPointerFin(e, false)}
            onPointerCancel={(e) => surFondPointerFin(e, true)}
            style={{ cursor: "grab" }}
          >
            <defs>
              <marker
                id="pert-fleche"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  className="fill-slate-400 dark:fill-slate-500"
                />
              </marker>
              <marker
                id="pert-fleche-critique"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-red-600" />
              </marker>
              <marker
                id="pert-fleche-selection"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  className="fill-slate-900 dark:fill-slate-100"
                />
              </marker>
              <marker
                id="pert-fleche-lien"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
              </marker>
              <marker
                id="pert-fleche-lien-invalide"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-red-500" />
              </marker>
            </defs>

            <g transform={`translate(${vue.tx}, ${vue.ty}) scale(${vue.k})`}>
              {/* Arêtes (dessous) */}
              {aretes.map((a) => {
                const cle = `${a.tacheId}|${a.depId}`;
                const sel =
                  !!selection &&
                  selection.tacheId === a.tacheId &&
                  selection.depId === a.depId;
                const d = cheminArete(a);
                return (
                  <g key={cle}>
                    {canEdit && (
                      /* Zone de clic élargie, invisible : sélection au doigt
                         comme à la souris (largeur constante à l'écran). */
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(16, 28 / vue.k)}
                        data-pert-arete="1"
                        style={{
                          pointerEvents: lien ? "none" : "stroke",
                          cursor: "pointer",
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelection({ tacheId: a.tacheId, depId: a.depId });
                        }}
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      className={
                        sel
                          ? "stroke-slate-900 dark:stroke-slate-100"
                          : a.critique
                            ? "stroke-red-600"
                            : "stroke-slate-400 dark:stroke-slate-500"
                      }
                      strokeWidth={sel ? 3.5 : a.critique ? 2.5 : 1.5}
                      strokeDasharray={a.optimiste ? "5 4" : undefined}
                      opacity={a.optimiste ? 0.6 : sel ? 1 : a.critique ? 0.95 : 0.7}
                      markerEnd={`url(#${
                        sel
                          ? "pert-fleche-selection"
                          : a.critique
                            ? "pert-fleche-critique"
                            : "pert-fleche"
                      })`}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })}

              {/* Cartes */}
              {pert.taches.map((p) => {
                const pos = positionsEffectives.get(p.id);
                if (!pos) return null;
                const meta = tachesParId.get(p.id);
                const estCritique = p.critical;
                const estCibleLien = lien?.cibleId === p.id;
                return (
                  <g
                    key={p.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    data-pert-noeud={p.id}
                    style={{
                      cursor: canEdit
                        ? "grab"
                        : onClickTask
                          ? "pointer"
                          : "grab",
                    }}
                  >
                    <title>
                      {p.nom}
                      {meta ? ` (${meta.chantier.nom})` : ""}
                      {onClickTask ? " : toucher pour modifier" : ""}
                    </title>

                    {/* Surbrillance de cible pendant le tirage d'un lien */}
                    {estCibleLien && (
                      <rect
                        x={-5}
                        y={-5}
                        width={PERT_NODE_W + 10}
                        height={PERT_NODE_H + 10}
                        rx={11}
                        fill="none"
                        strokeWidth={3}
                        className={
                          lien?.invalide ? "stroke-red-500" : "stroke-amber-500"
                        }
                        strokeDasharray={lien?.invalide ? "6 4" : undefined}
                      />
                    )}

                    <rect
                      x={0}
                      y={0}
                      width={PERT_NODE_W}
                      height={PERT_NODE_H}
                      rx={8}
                      className={cn(
                        "fill-white dark:fill-slate-900",
                        estCritique
                          ? "stroke-red-600"
                          : "stroke-slate-300 dark:stroke-slate-600"
                      )}
                      strokeWidth={estCritique ? 3 : 1.5}
                    />
                    {/* Bandeau titre */}
                    <rect
                      x={0}
                      y={0}
                      width={PERT_NODE_W}
                      height={28}
                      rx={8}
                      className={
                        estCritique
                          ? "fill-red-100 dark:fill-red-950"
                          : "fill-slate-100 dark:fill-slate-800"
                      }
                    />
                    <rect
                      x={0}
                      y={20}
                      width={PERT_NODE_W}
                      height={8}
                      className={
                        estCritique
                          ? "fill-red-100 dark:fill-red-950"
                          : "fill-slate-100 dark:fill-slate-800"
                      }
                    />
                    {/* Pastille statut */}
                    <circle
                      cx={12}
                      cy={14}
                      r={4}
                      className={
                        STATUT_POINT[meta?.statut ?? ""] ?? "fill-slate-400"
                      }
                    />
                    <text
                      x={PERT_NODE_W / 2 + 6}
                      y={18}
                      textAnchor="middle"
                      className="fill-slate-900 dark:fill-slate-100"
                      style={{ fontSize: 13, fontWeight: 600 }}
                    >
                      {p.nom.length > 22 ? p.nom.slice(0, 20) + "…" : p.nom}
                    </text>

                    {/* Ligne ES / EF (dates au plus tôt) */}
                    <text
                      x={10}
                      y={48}
                      className="fill-slate-500 dark:fill-slate-400"
                      style={{ fontSize: 10 }}
                    >
                      ES {fmtDate(p.ES)}
                    </text>
                    <text
                      x={PERT_NODE_W - 10}
                      y={48}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400"
                      style={{ fontSize: 10 }}
                    >
                      EF {fmtDate(p.EF)}
                    </text>

                    {/* Durée au centre */}
                    <text
                      x={PERT_NODE_W / 2}
                      y={70}
                      textAnchor="middle"
                      className="fill-slate-700 dark:fill-slate-200"
                      style={{ fontSize: 14, fontWeight: 600 }}
                    >
                      {p.dureeJours} j
                    </text>

                    {/* Équipe */}
                    {meta?.equipe && (
                      <text
                        x={PERT_NODE_W / 2}
                        y={86}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400"
                        style={{ fontSize: 10 }}
                      >
                        {meta.equipe.nom.length > 22
                          ? meta.equipe.nom.slice(0, 20) + "…"
                          : meta.equipe.nom}
                      </text>
                    )}

                    {/* Ligne LS / marge / LF (dates au plus tard) */}
                    <text
                      x={10}
                      y={PERT_NODE_H - 8}
                      className="fill-slate-400 dark:fill-slate-500"
                      style={{ fontSize: 10 }}
                    >
                      LS {fmtDate(p.LS)}
                    </text>
                    <text
                      x={PERT_NODE_W / 2}
                      y={PERT_NODE_H - 8}
                      textAnchor="middle"
                      className={
                        estCritique
                          ? "fill-red-600 dark:fill-red-400"
                          : "fill-green-600 dark:fill-green-400"
                      }
                      style={{ fontSize: 10, fontWeight: 600 }}
                    >
                      marge {p.slack}j
                    </text>
                    <text
                      x={PERT_NODE_W - 10}
                      y={PERT_NODE_H - 8}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500"
                      style={{ fontSize: 10 }}
                    >
                      LF {fmtDate(p.LF)}
                    </text>

                    {/* Port de sortie (droite) : tirer vers une autre carte
                        pour créer une dépendance */}
                    {canEdit && meta && (
                      <g
                        data-pert-port="1"
                        onPointerDown={(e) => demarrerLien(meta, e)}
                        style={{ touchAction: "none", cursor: "crosshair" }}
                      >
                        <circle
                          cx={PERT_NODE_W}
                          cy={PERT_NODE_H / 2}
                          r={rayonPort}
                          fill="transparent"
                          style={{ pointerEvents: "all" }}
                        />
                        <circle
                          cx={PERT_NODE_W}
                          cy={PERT_NODE_H / 2}
                          r={7}
                          strokeWidth={1.5}
                          className={cn(
                            lien?.sourceId === p.id
                              ? "fill-amber-500 stroke-amber-600"
                              : "fill-white dark:fill-slate-900 stroke-slate-400 dark:stroke-slate-500"
                          )}
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Flèche élastique pendant la création d'une dépendance */}
              {lien && (
                <path
                  d={`M ${lien.x0} ${lien.y0} L ${lien.x1} ${lien.y1}`}
                  fill="none"
                  className={lien.invalide ? "stroke-red-500" : "stroke-amber-500"}
                  strokeWidth={2.5}
                  strokeDasharray="6 5"
                  markerEnd={`url(#${
                    lien.invalide
                      ? "pert-fleche-lien-invalide"
                      : "pert-fleche-lien"
                  })`}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </g>
          </svg>

          {/* Barre d'outils zoom */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => zoomCentre(1.3)}
              aria-label="Zoom avant"
              title="Zoom avant"
              className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              onClick={() => zoomCentre(1 / 1.3)}
              aria-label="Zoom arrière"
              title="Zoom arrière"
              className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={ajuster}
              aria-label="Ajuster la vue au réseau"
              title="Ajuster la vue (double-tap sur le fond)"
              className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Maximize2 size={16} />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={reorganiser}
                disabled={resetIds.size > 0}
                aria-label="Réorganiser le réseau (disposition automatique)"
                title="Réorganiser : efface les positions posées à la main"
                className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <LayoutGrid size={16} />
              </button>
            )}
          </div>

          {/* Croix flottante : supprime la flèche sélectionnée */}
          {areteSel && canEdit && (
            <button
              type="button"
              data-pert-arete="1"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => supprimerArete(areteSel.tacheId, areteSel.depId)}
              className="absolute z-10 w-11 h-11 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              style={{
                left: ((areteSel.x1 + areteSel.x2) / 2) * vue.k + vue.tx,
                top: ((areteSel.y1 + areteSel.y2) / 2) * vue.k + vue.ty,
              }}
              title="Supprimer cette dépendance"
              aria-label="Supprimer la dépendance sélectionnée"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Légende */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border-2 border-red-600" />
            Tâche sur le chemin critique
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border border-slate-300 dark:border-slate-600" />
            Tâche avec marge
          </span>
          {pert.finProjet && (
            <span className="ml-auto text-slate-700 dark:text-slate-300 font-medium">
              Fin projet : {pert.finProjet.toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>

        <div className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 leading-relaxed">
          Les tâches sans dépendance commencent à leur date de début ; les
          dépendances décalent le démarrage au plus tôt. La marge (slack)
          indique de combien de jours une tâche peut glisser sans impacter la
          fin du projet. Glisser le fond pour se déplacer, molette ou pincement
          à deux doigts pour zoomer, double-tap pour recadrer.
          {canEdit &&
            " Un tap sur une carte ouvre la fiche de la tâche ; glisser une carte la pose où tu veux (position partagée avec l'équipe, bouton Réorganiser pour revenir à la disposition automatique). Tirer depuis le rond à droite d'une carte vers une autre crée une dépendance ; toucher une flèche puis la croix la supprime."}
        </div>
      </div>
    </div>
  );
}
