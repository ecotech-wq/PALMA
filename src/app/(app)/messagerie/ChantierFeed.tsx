"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { TAILLE_PAGE_MESSAGES } from "@/features/messaging/core/pagination";
import { PhotoVignette } from "@/components/PhotoVignette";
import { AudiosMessage, DocumentsMessage } from "@/components/MediasMessage";
import type { DocumentMessage } from "@/lib/pieces-jointes";

/* -----------------------------------------------------------------------
 *  Hook de polling live sur un fil (chantier ou affaire). Toutes les
 *  `intervalMs`, on interroge l'API du fil (`apiBase`/poll) ; si elle
 *  renvoie de nouveaux messages, on déclenche router.refresh(). Pause
 *  automatique quand l'onglet n'est pas visible.
 * --------------------------------------------------------------------- */
function useMessagerieLivePoll(apiBase: string, intervalMs = 8000) {
  const router = useRouter();
  const lastSeenRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let aborted = false;

    async function tick() {
      if (aborted) return;
      // Pause si l'onglet n'est pas visible (économie batterie/serveur)
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule();
        return;
      }
      try {
        const res = await fetch(
          `${apiBase}/poll?since=${encodeURIComponent(lastSeenRef.current)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as { count: number; latest?: string };
          if (data.count > 0) {
            lastSeenRef.current = data.latest ?? new Date().toISOString();
            router.refresh();
          }
        }
      } catch {
        /* silent — réseau ou auth, on retentera au prochain tick */
      }
      schedule();
    }

    function schedule() {
      if (aborted) return;
      timer = setTimeout(tick, intervalMs);
    }

    schedule();
    return () => {
      aborted = true;
      if (timer) clearTimeout(timer);
    };
  }, [apiBase, intervalMs, router]);
}
import Link from "next/link";
import {
  AlertTriangle,
  Package,
  FileText,
  PackageOpen,
  PackageCheck,
  ShoppingCart,
  Trash2,
  EyeOff,
  Eye,
  ExternalLink,
  History,
  Search,
  X as XIcon,
  CheckCircle2,
  Truck,
  Flag,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import {
  deleteChantierMessage,
  toggleMessageClientVisibility,
  quickApproveDemandeToCommande,
  quickRefuseDemande,
  toggleMessageReaction,
} from "./actions";
import { SmilePlus } from "lucide-react";
import { Check, X } from "lucide-react";
import { Lightbox, type PhotoMeta } from "@/components/Lightbox";
import {
  MapPin,
  CalendarCheck,
  ClipboardList,
  MessageSquare,
  LayoutList,
} from "lucide-react";
import {
  TagPicker,
  TagChip,
  canApplyTag,
  listTagsForRole,
  type Role as TagRole,
  type TagCode,
} from "@/features/tags";
import { applyTagToMessage } from "./tag-actions";

type ChatMessage = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  type: string;
  texte: string | null;
  photos: string[];
  videos: string[];
  // Optionnels : messages antérieurs aux colonnes audios/documents ou
  // renvoyés par une API pas encore à jour
  audios?: string[];
  documents?: DocumentMessage[];
  hiddenFromClient: boolean;
  incidentId: string | null;
  demandeId: string | null;
  commandeId: string | null;
  sortieId: string | null;
  rapportId: string | null;
  // v4.2 : fiches créées par tag (optionnels : l'API de recherche
  // historique peut renvoyer des messages antérieurs à ces colonnes)
  tacheId?: string | null;
  reserveId?: string | null;
  createdAt: Date | string;
  reactions?: { emoji: string; userId: string }[];
  // v4.2 : tags déjà posés sur ce message (codes du catalogue)
  tags?: string[];
};

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👏", "🔥", "😂", "😮", "😢", "🙏"];

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function dayKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Filtres rapides — chaque entrée mappe vers une liste de types JournalMessage. */
const FILTERS: {
  key: string;
  label: string;
  Icon: typeof AlertTriangle;
  types: string[];
}[] = [
  { key: "ALL", label: "Tout", Icon: LayoutList, types: [] },
  { key: "NOTE", label: "Messages", Icon: MessageSquare, types: ["NOTE"] },
  {
    key: "INCIDENT",
    label: "Incidents",
    Icon: AlertTriangle,
    types: ["SYSTEM_INCIDENT", "SYSTEM_INCIDENT_RESOLU"],
  },
  { key: "TACHE", label: "Tâches", Icon: CalendarCheck, types: ["SYSTEM_TACHE"] },
  {
    key: "RESERVE",
    label: "Réserves",
    Icon: ClipboardList,
    types: ["SYSTEM_RESERVE"],
  },
  { key: "DEMANDE", label: "Demandes", Icon: Package, types: ["SYSTEM_DEMANDE"] },
  {
    key: "COMMANDE",
    label: "Commandes",
    Icon: ShoppingCart,
    types: ["SYSTEM_COMMANDE", "SYSTEM_COMMANDE_LIVREE"],
  },
  { key: "RAPPORT", label: "Rapports", Icon: FileText, types: ["SYSTEM_RAPPORT"] },
  {
    key: "MATERIEL",
    label: "Matériel",
    Icon: PackageOpen,
    types: ["SYSTEM_SORTIE", "SYSTEM_RETOUR"],
  },
  {
    key: "LOCATION",
    label: "Locations",
    Icon: Truck,
    types: ["SYSTEM_LOCATION", "SYSTEM_LOCATION_FIN"],
  },
  { key: "PLAN", label: "Plans", Icon: ImageIcon, types: ["SYSTEM_PLAN"] },
];

const TYPE_META: Record<
  string,
  {
    Icon: typeof AlertTriangle;
    label: string;
    bg: string;
    text: string;
    href?: (m: ChatMessage, chantierId: string) => string | null;
  }
> = {
  NOTE: { Icon: AlertTriangle, label: "", bg: "", text: "" }, // pas de badge
  SYSTEM_INCIDENT: {
    Icon: AlertTriangle,
    label: "Incident",
    bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
    text: "text-red-700 dark:text-red-300",
    href: (m) => (m.incidentId ? `/incidents/${m.incidentId}` : null),
  },
  SYSTEM_DEMANDE: {
    Icon: Package,
    label: "Demande matériel",
    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
    text: "text-blue-700 dark:text-blue-300",
    href: (m) => (m.demandeId ? `/demandes/${m.demandeId}` : null),
  },
  SYSTEM_COMMANDE: {
    Icon: ShoppingCart,
    label: "Commande",
    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
    text: "text-amber-700 dark:text-amber-300",
    href: (m) => (m.commandeId ? `/commandes/${m.commandeId}` : null),
  },
  SYSTEM_RAPPORT: {
    Icon: FileText,
    label: "Rapport quotidien",
    bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
    href: () => "/rapports",
  },
  SYSTEM_SORTIE: {
    Icon: PackageOpen,
    label: "Sortie matériel",
    bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900",
    text: "text-orange-700 dark:text-orange-300",
    href: () => "/sorties",
  },
  SYSTEM_RETOUR: {
    Icon: PackageCheck,
    label: "Retour matériel",
    bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900",
    text: "text-purple-700 dark:text-purple-300",
    href: () => "/sorties",
  },
  SYSTEM_INCIDENT_RESOLU: {
    Icon: CheckCircle2,
    label: "Incident résolu",
    bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900",
    text: "text-green-700 dark:text-green-300",
    href: (m) => (m.incidentId ? `/incidents/${m.incidentId}` : null),
  },
  SYSTEM_COMMANDE_LIVREE: {
    Icon: PackageCheck,
    label: "Commande livrée",
    bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
    href: (m) => (m.commandeId ? `/commandes/${m.commandeId}` : null),
  },
  SYSTEM_LOCATION: {
    Icon: Truck,
    label: "Location",
    bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
    href: () => "/locations",
  },
  SYSTEM_LOCATION_FIN: {
    Icon: Flag,
    label: "Location restituée",
    bg: "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    href: () => "/locations",
  },
  SYSTEM_PLAN: {
    Icon: ImageIcon,
    label: "Plan ajouté",
    bg: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
    href: () => null,
  },
  SYSTEM_TACHE: {
    Icon: CalendarCheck,
    label: "Tâche planifiée",
    bg: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900",
    text: "text-sky-700 dark:text-sky-300",
    href: (_m, chantierId) => `/planning?chantier=${chantierId}`,
  },
  SYSTEM_RESERVE: {
    Icon: ClipboardList,
    label: "Réserve",
    bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
    text: "text-rose-700 dark:text-rose-300",
    href: () => "/pv-reception",
  },
  BILAN_JOURNEE: {
    Icon: FileText,
    label: "Bilan",
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
  },
};

/**
 * Affiche un fil de messages groupés par jour, style WhatsApp. Chaque
 * message est aligné à gauche (sauf le sien à droite). Les messages
 * typés (incident/demande/...) ont un badge couleur et un lien vers
 * l'entité.
 */
type DemandeInfo = {
  statut: string;
  description: string;
  quantite: number;
  unite: string | null;
};

/** Premier ancêtre défilable (le CardBody overflow-y-auto de la page). */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = window.getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function ChantierFeed({
  chantierId,
  affaireId = null,
  canalId,
  canalGeneral,
  hasOlder = false,
  messages,
  currentUserId,
  viewerRole,
  canEdit,
  canPilotDemandes = false,
  demandeInfo = {},
  photoMeta = {},
}: {
  chantierId: string;
  /** Contexte AFFAIRE (CRM) : le fil est celui du canal d'une affaire
   *  (chantierId vide). Les API passent par /api/messagerie/affaire/... et
   *  les gestes propres aux chantiers (réactions, tags, visibilité client)
   *  sont masqués : le fil d'affaire est interne aux pilotes. */
  affaireId?: string | null;
  canalId: string;
  canalGeneral: boolean;
  hasOlder?: boolean;
  messages: ChatMessage[];
  currentUserId: string;
  viewerRole: TagRole;
  canEdit: boolean;
  canPilotDemandes?: boolean;
  demandeInfo?: Record<string, DemandeInfo>;
  photoMeta?: Record<string, PhotoMeta>;
}) {
  // Base des routes API du fil : chantier ou affaire (mêmes formes de
  // réponse, gardes propres à chaque contexte côté serveur).
  const apiBase = affaireId
    ? `/api/messagerie/affaire/${encodeURIComponent(affaireId)}`
    : `/api/messagerie/${encodeURIComponent(chantierId)}`;
  // Polling live : refresh auto quand un nouveau message arrive
  useMessagerieLivePoll(apiBase);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  // Recherche repliée par défaut : l'écran appartient aux messages.
  const [searchOpen, setSearchOpen] = useState(false);
  // Résultats étendus chargés via API (au-delà de la première page)
  const [extendedResults, setExtendedResults] = useState<ChatMessage[]>([]);
  const [extendedSearching, setExtendedSearching] = useState(false);
  const lastExtendedQueryRef = useRef<string>("");

  /* ----- Pagination vers le passé (« Messages précédents ») ----------- */
  // Pages plus anciennes chargées à la demande, en ordre ascendant.
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState(hasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Métadonnées EXIF des photos des pages anciennes (celles de la première
  // page arrivent par la prop photoMeta)
  const [extraPhotoMeta, setExtraPhotoMeta] = useState<
    Record<string, PhotoMeta>
  >({});
  // Ancre de défilement : posée avant l'insertion d'une page ancienne,
  // consommée juste après le rendu pour que le fil ne saute pas.
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const prevMessagesRef = useRef<ChatMessage[]>(messages);

  const isFiltering = query.trim() !== "" || filter !== "ALL";

  // Quand le polling rafraîchit la page, la fenêtre « 30 plus récents »
  // glisse : les messages qui en sortent par le bas sont conservés côté
  // client pour que le fil déjà lu ne se troue pas. Un message SUPPRIMÉ,
  // lui, reste dans la fenêtre temporelle : il n'est pas conservé.
  // Comparaison LARGE (<=) : un message créé dans la même milliseconde
  // que la borne basse de la fenêtre peut en sortir lui aussi (ordre
  // composite createdAt puis id) ; le strict le perdrait de l'affichage.
  useEffect(() => {
    const prev = prevMessagesRef.current;
    if (prev === messages) return;
    prevMessagesRef.current = messages;
    if (messages.length < TAILLE_PAGE_MESSAGES) return; // fenêtre non pleine
    const oldestNew =
      messages.length > 0
        ? new Date(messages[0].createdAt).getTime()
        : Infinity;
    const newIds = new Set(messages.map((m) => m.id));
    const dropped = prev.filter(
      (m) =>
        !newIds.has(m.id) && new Date(m.createdAt).getTime() <= oldestNew
    );
    if (dropped.length === 0) return;
    setOlderMessages((cur) => {
      const curIds = new Set(cur.map((m) => m.id));
      const add = dropped.filter((m) => !curIds.has(m.id));
      if (add.length === 0) return cur;
      // Tri composite (createdAt puis id) : stable même quand deux
      // messages partagent la même milliseconde.
      return [...cur, ...add].sort((a, b) => {
        const d =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (d !== 0) return d;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    });
  }, [messages]);

  async function chargerMessagesPrecedents() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = olderMessages[0] ?? messages[0];
      const before = oldest
        ? new Date(oldest.createdAt).toISOString()
        : new Date().toISOString();
      // Curseur composite (createdAt, id) : sans beforeId, deux messages
      // créés dans la même milliseconde à la frontière d'une page
      // pourraient être sautés ou dupliqués.
      const beforeId = oldest ? `&beforeId=${encodeURIComponent(oldest.id)}` : "";
      const container = getScrollParent(rootRef.current);
      scrollAnchorRef.current = container
        ? { height: container.scrollHeight, top: container.scrollTop }
        : null;
      const res = await fetch(
        `${apiBase}/history?before=${encodeURIComponent(
          before
        )}${beforeId}&canal=${encodeURIComponent(canalId)}&general=${canalGeneral ? "1" : "0"}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          messages: ChatMessage[];
          hasMore: boolean;
          photoMeta: Record<string, PhotoMeta>;
        };
        setOlderMessages((cur) => {
          const curIds = new Set(cur.map((m) => m.id));
          const add = data.messages.filter((m) => !curIds.has(m.id));
          return [...add, ...cur];
        });
        setOlderHasMore(data.hasMore);
        setExtraPhotoMeta((cur) => ({ ...cur, ...data.photoMeta }));
      }
    } catch {
      // silencieux : l'utilisateur peut réessayer
    } finally {
      setLoadingOlder(false);
    }
  }

  // Restaure la position de lecture après l'insertion d'une page ancienne
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;
    scrollAnchorRef.current = null;
    const container = getScrollParent(rootRef.current);
    if (container) {
      container.scrollTop = container.scrollHeight - anchor.height + anchor.top;
    }
  }, [olderMessages]);

  // Fil complet affiché : pages anciennes + fenêtre serveur (dédupliquée)
  const olderIds = new Set(olderMessages.map((m) => m.id));
  const allMessages =
    olderMessages.length > 0
      ? [...olderMessages, ...messages.filter((m) => !olderIds.has(m.id))]
      : messages;

  // Métadonnées photos : première page (prop) + pages anciennes (état)
  const metaCombinee = { ...photoMeta, ...extraPhotoMeta };

  // Reset des résultats étendus quand la query change
  useEffect(() => {
    if (query !== lastExtendedQueryRef.current) {
      setExtendedResults([]);
      lastExtendedQueryRef.current = "";
    }
  }, [query]);

  async function loadExtendedHistory() {
    if (query.trim().length < 2) return;
    setExtendedSearching(true);
    try {
      // Cherche STRICTEMENT plus ancien que le plus vieux message déjà chargé
      // (pages précédentes comprises) pour ne pas doublonner
      const oldest = olderMessages[0] ?? messages[0];
      const before = oldest
        ? new Date(oldest.createdAt).toISOString()
        : new Date().toISOString();
      const res = await fetch(
        `${apiBase}/search?q=${encodeURIComponent(
          query.trim()
        )}&before=${encodeURIComponent(before)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessage[] };
        setExtendedResults(data.messages);
        lastExtendedQueryRef.current = query;
      }
    } catch {
      // silencieux — l'utilisateur peut réessayer
    } finally {
      setExtendedSearching(false);
    }
  }

  // Filtrage côté client (volume modeste : les pages chargées)
  const visibleMessages = allMessages.filter((m) => {
    if (filter !== "ALL") {
      const inFilter = FILTERS.find((f) => f.key === filter)?.types.includes(
        m.type
      );
      if (!inFilter) return false;
    }
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      const hay = `${m.texte ?? ""} ${m.authorName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Auto-scroll sur le dernier message : au montage et quand un NOUVEAU
  // message arrive en bas du fil. Clé : l'id du dernier message, pas la
  // longueur, pour que le chargement de pages anciennes (en haut) ne
  // renvoie pas l'utilisateur en bas. Pas de saut en mode filtre/recherche.
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const lastSeenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isFiltering) return;
    if (lastSeenIdRef.current === lastId) return;
    lastSeenIdRef.current = lastId;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [lastId, isFiltering]);

  if (allMessages.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400 italic">
        Aucun message sur ce canal pour l&apos;instant. Écris le premier
        message ci-dessous.
      </div>
    );
  }

  // Groupe par jour (sur les messages filtrés)
  const groups = new Map<string, ChatMessage[]>();
  for (const m of visibleMessages) {
    const k = dayKey(m.createdAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }

  function fermerRecherche() {
    setSearchOpen(false);
    setQuery("");
    setFilter("ALL");
  }

  return (
    <div ref={rootRef} className="space-y-4 p-3">
      {/* Recherche repliée : une loupe flottante qui suit le défilement,
          sans prendre une ligne au fil. Dépliée : champ + filtres + X. */}
      {!searchOpen ? (
        <div className="sticky top-1.5 z-10 !mt-0 flex h-0 justify-end overflow-visible">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Rechercher et filtrer le fil"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 shadow-sm backdrop-blur transition-colors hover:text-slate-800 dark:hover:text-slate-200"
          >
            <Search size={14} />
          </button>
        </div>
      ) : (
        <div className="sticky top-0 z-10 -m-3 mb-0 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher dans le fil…"
                className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Effacer la recherche"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={fermerRecherche}
              aria-label="Fermer la recherche"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <XIcon size={16} />
            </button>
          </div>
          {/* Une seule ligne défilante : au téléphone, l'empilement de
              3 rangées de filtres mangeait le fil */}
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition ${
                  filter === f.key
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <f.Icon size={11} />
                {f.label}
              </button>
            ))}
          </div>
          {isFiltering && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
              <span>
                {visibleMessages.length} résultat
                {visibleMessages.length > 1 ? "s" : ""} parmi les messages
                chargés
              </span>
              {query.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={loadExtendedHistory}
                  disabled={extendedSearching}
                  className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
                >
                  {extendedSearching
                    ? "Recherche…"
                    : lastExtendedQueryRef.current === query &&
                        extendedResults.length > 0
                      ? `${extendedResults.length} résultat${extendedResults.length > 1 ? "s" : ""} plus anciens`
                      : "Chercher dans tout l'historique"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Charger l'historique : une page de 30 de plus vers le passé.
          Masqué en mode recherche (le lien « Chercher dans tout
          l'historique » couvre ce besoin). */}
      {olderHasMore && !isFiltering && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={chargerMessagesPrecedents}
            disabled={loadingOlder}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <History size={12} />
            {loadingOlder ? "Chargement…" : "Messages précédents"}
          </button>
        </div>
      )}

      {visibleMessages.length === 0 && isFiltering && extendedResults.length === 0 && (
        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400 italic">
          Aucun message ne correspond à ces critères.
        </div>
      )}

      {/* Résultats étendus (au-delà des 14 derniers jours) */}
      {extendedResults.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-amber-300 dark:bg-amber-800" />
            <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
              Anciens résultats — {extendedResults.length}
            </span>
            <div className="flex-1 h-px bg-amber-300 dark:bg-amber-800" />
          </div>
          <ul className="space-y-2">
            {extendedResults.map((m) => (
              <MessageBubble
                key={`ext-${m.id}`}
                chantierId={chantierId}
                enAffaire={!!affaireId}
                msg={m}
                isOwn={m.authorId === currentUserId}
                canEdit={canEdit}
                canPilotDemandes={canPilotDemandes}
                demandeInfo={m.demandeId ? demandeInfo[m.demandeId] : undefined}
                currentUserId={currentUserId}
                viewerRole={viewerRole}
                photoMeta={metaCombinee}
              />
            ))}
          </ul>
        </div>
      )}
      {[...groups.entries()].map(([dk, msgs]) => (
        <div key={dk}>
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
              {dayFmt.format(new Date(dk + "T12:00:00.000Z"))}
            </span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>
          <ul className="space-y-2">
            {msgs.map((m) => (
              <MessageBubble
                key={m.id}
                chantierId={chantierId}
                enAffaire={!!affaireId}
                msg={m}
                isOwn={m.authorId === currentUserId}
                canEdit={canEdit}
                canPilotDemandes={canPilotDemandes}
                demandeInfo={m.demandeId ? demandeInfo[m.demandeId] : undefined}
                currentUserId={currentUserId}
                viewerRole={viewerRole}
                photoMeta={metaCombinee}
              />
            ))}
          </ul>
        </div>
      ))}
      {/* Sentinel pour le scroll auto vers le bas */}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({
  chantierId,
  enAffaire,
  msg,
  isOwn,
  canEdit,
  canPilotDemandes,
  demandeInfo,
  currentUserId,
  viewerRole,
  photoMeta,
}: {
  chantierId: string;
  /** Fil d'affaire (CRM) : pas de réactions, de tags ni de visibilité
   *  client, ces gestes appartiennent aux fils de chantier. */
  enAffaire: boolean;
  msg: ChatMessage;
  isOwn: boolean;
  canEdit: boolean;
  canPilotDemandes: boolean;
  demandeInfo: DemandeInfo | undefined;
  currentUserId: string;
  viewerRole: TagRole;
  photoMeta: Record<string, PhotoMeta>;
}) {
  // Groupage des réactions par emoji
  const reactions = msg.reactions ?? [];
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = grouped.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === currentUserId) cur.mine = true;
    grouped.set(r.emoji, cur);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const panneau = usePanneauOpaque();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const tags = msg.tags ?? [];

  function handleApplyTag(code: TagCode) {
    startTransition(async () => {
      try {
        const res = await applyTagToMessage(msg.id, code);
        toast.success(`${res.resume}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }
  const meta = TYPE_META[msg.type] ?? TYPE_META.NOTE;
  const linkedHref = meta.href?.(msg, chantierId) ?? null;
  const isTyped = msg.type !== "NOTE";
  // Un tag se pose sur un vrai message (NOTE) d'un fil de CHANTIER, pas
  // sur une trace système ni dans un fil d'affaire, par un rôle qui en a
  // le droit, et si le message n'a pas déjà ce tag.
  const canTagThis =
    !enAffaire &&
    !isTyped &&
    listTagsForRole(viewerRole).some(
      (d) => !tags.includes(d.code) && canApplyTag(viewerRole, d.code)
    );

  function handleDelete() {
    if (!confirm("Supprimer ce message ?")) return;
    startTransition(async () => {
      try {
        await deleteChantierMessage(msg.id);
        toast.success("Supprimé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleApproveDemande() {
    if (!msg.demandeId) return;
    if (!confirm("Approuver cette demande et créer la commande ?")) return;
    startTransition(async () => {
      try {
        await quickApproveDemandeToCommande(msg.demandeId!);
        toast.success("Demande approuvée et commande créée");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleRefuseDemande() {
    if (!msg.demandeId) return;
    const motif = window.prompt("Motif du refus ?");
    if (!motif || !motif.trim()) return;
    startTransition(async () => {
      try {
        await quickRefuseDemande(msg.demandeId!, motif.trim());
        toast.success("Demande refusée");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleReact(emoji: string) {
    startTransition(async () => {
      try {
        await toggleMessageReaction(msg.id, emoji);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function handleToggleClient() {
    startTransition(async () => {
      try {
        const hidden = await toggleMessageClientVisibility(msg.id);
        toast.success(
          hidden ? "Caché du client" : "Visible client"
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <>
      <li
        className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}
      >
        <div
          className={`max-w-[85%] sm:max-w-[75%] rounded-lg border px-3 py-2 ${
            isTyped
              ? meta.bg
              : isOwn
                ? "bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          } ${msg.hiddenFromClient ? "opacity-70" : ""}`}
        >
          {/* En-tête : auteur + heure + badge type */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-1">
            {isTyped && (
              <span
                className={`inline-flex items-center gap-1 font-semibold ${meta.text}`}
              >
                <meta.Icon size={11} />
                {meta.label}
              </span>
            )}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {msg.authorName ?? "Système"}
            </span>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <span className="text-slate-400 dark:text-slate-500">
              {timeFmt.format(new Date(msg.createdAt))}
            </span>
            {msg.hiddenFromClient && (
              <span
                className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400 italic"
                title="Ce message ne sera pas envoyé au client"
              >
                <EyeOff size={10} /> interne
              </span>
            )}
          </div>

          {/* Texte */}
          {msg.texte && (
            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-snug">
              {msg.texte}
            </p>
          )}

          {/* Tags posés (v4.2) : chaque tag renvoie à la fiche créée.
              La puce « Taguer » est TOUJOURS visible (pas de survol :
              l'app se pilote au pouce sur téléphone). */}
          {(tags.length > 0 || canTagThis) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {tags.map((code) => (
                <TagChip key={code} code={code} />
              ))}
              {canTagThis && (
                <TagPicker
                  role={viewerRole}
                  onSelect={handleApplyTag}
                  disabled={pending}
                  label="Taguer"
                  compact
                  direction="up"
                />
              )}
            </div>
          )}

          {/* Photos */}
          {msg.photos.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {msg.photos.map((url, i) => {
                const m = photoMeta[url];
                const geo =
                  m?.gpsLat !== null &&
                  m?.gpsLat !== undefined &&
                  m?.gpsLng !== null &&
                  m?.gpsLng !== undefined;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="relative w-20 h-20 rounded overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 group/photo"
                    title={geo ? "Photo géolocalisée — clic pour voir + carte" : "Voir en plus grand"}
                  >
                    <PhotoVignette
                      url={url}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {geo && (
                      <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/90 text-white">
                        <MapPin size={9} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Vidéos (servies telles quelles, sans transcodage) */}
          {msg.videos.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {msg.videos.map((url, i) => (
                <video
                  key={i}
                  src={url}
                  controls
                  preload="metadata"
                  className="w-44 h-32 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 object-cover"
                />
              ))}
            </div>
          )}

          {/* Mémos vocaux */}
          <AudiosMessage audios={msg.audios ?? []} />

          {/* Pièces jointes documentaires */}
          <DocumentsMessage documents={msg.documents ?? []} />

          {/* Réactions existantes + bouton ajout */}
          {(grouped.size > 0 || pickerOpen) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 relative">
              {[...grouped.entries()].map(([em, info]) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleReact(em)}
                  disabled={pending}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition ${
                    info.mine
                      ? "bg-brand-100 dark:bg-brand-950/40 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                  title={info.mine ? "Retirer ma réaction" : "Réagir"}
                >
                  <span>{em}</span>
                  <span className="tabular-nums">{info.count}</span>
                </button>
              ))}
              {pickerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setPickerOpen(false)}
                  />
                  <div
                    className="absolute bottom-full left-0 mb-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1 flex gap-0.5 flex-wrap max-w-[240px]"
                    style={panneau}
                  >
                    {REACTION_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          setPickerOpen(false);
                          handleReact(em);
                        }}
                        className="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Boutons rapides pour les demandes matériel (statut DEMANDEE) */}
          {msg.type === "SYSTEM_DEMANDE" &&
            msg.demandeId &&
            demandeInfo &&
            demandeInfo.statut === "DEMANDEE" &&
            canPilotDemandes && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleApproveDemande}
                  disabled={pending}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                  title="Approuver et créer la commande"
                >
                  <Check size={12} /> Valider et commander
                </button>
                <button
                  type="button"
                  onClick={handleRefuseDemande}
                  disabled={pending}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 text-xs hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                  title="Refuser cette demande"
                >
                  <X size={12} /> Refuser
                </button>
              </div>
            )}

          {/* Statut de la demande (info, lecture seule) */}
          {msg.type === "SYSTEM_DEMANDE" && demandeInfo && (
            <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              Statut :{" "}
              <span
                className={
                  demandeInfo.statut === "COMMANDEE"
                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                    : demandeInfo.statut === "REFUSEE"
                      ? "text-red-700 dark:text-red-400 font-medium"
                      : demandeInfo.statut === "APPROUVEE"
                        ? "text-blue-700 dark:text-blue-400 font-medium"
                        : "text-amber-700 dark:text-amber-400 font-medium"
                }
              >
                {demandeInfo.statut === "DEMANDEE"
                  ? "en attente"
                  : demandeInfo.statut === "APPROUVEE"
                    ? "approuvée"
                    : demandeInfo.statut === "COMMANDEE"
                      ? "commandée"
                      : "refusée"}
              </span>
            </div>
          )}

          {/* Footer : actions. Visible en permanence sur écran tactile ;
              sur un poste avec souris, n'apparaît qu'au survol. */}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
            {!enAffaire && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 hover:text-brand-600 dark:hover:text-brand-400"
                title="Ajouter une réaction"
              >
                <SmilePlus size={11} /> Réagir
              </button>
            )}
            {linkedHref && (
              <Link
                href={linkedHref}
                className="inline-flex items-center gap-0.5 hover:text-brand-600 dark:hover:text-brand-400"
              >
                <ExternalLink size={10} /> Voir le détail
              </Link>
            )}
            {canEdit && (
              <>
                {/* Visibilité client : sans objet dans un fil d'affaire
                    (toujours interne aux pilotes). */}
                {!enAffaire && (
                  <button
                    type="button"
                    onClick={handleToggleClient}
                    disabled={pending}
                    className="inline-flex items-center gap-0.5 hover:text-amber-700 dark:hover:text-amber-400"
                    title={
                      msg.hiddenFromClient
                        ? "Re-rendre visible au client"
                        : "Cacher du client"
                    }
                  >
                    {msg.hiddenFromClient ? <Eye size={10} /> : <EyeOff size={10} />}
                    {msg.hiddenFromClient ? "Re-publier" : "Cacher client"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="inline-flex items-center gap-0.5 hover:text-red-600"
                  title="Supprimer ce message"
                >
                  <Trash2 size={10} /> Suppr
                </button>
              </>
            )}
          </div>
        </div>
      </li>

      {/* Lightbox avec navigation + métadonnées EXIF */}
      {lightboxIndex !== null && msg.photos.length > 0 && (
        <Lightbox
          images={msg.photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          metadata={photoMeta}
        />
      )}
    </>
  );
}
