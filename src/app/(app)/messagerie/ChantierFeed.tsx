"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* -----------------------------------------------------------------------
 *  Hook de polling live sur un chantier. Toutes les `intervalMs`, on
 *  interroge l'API ; si elle renvoie de nouveaux messages, on déclenche
 *  router.refresh(). Pause automatique quand l'onglet n'est pas visible.
 * --------------------------------------------------------------------- */
function useMessagerieLivePoll(chantierId: string, intervalMs = 8000) {
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
          `/api/messagerie/${encodeURIComponent(chantierId)}/poll?since=${encodeURIComponent(lastSeenRef.current)}`,
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
  }, [chantierId, intervalMs, router]);
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
  Search,
  X as XIcon,
  CheckCircle2,
  Truck,
  Flag,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";
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
import { MapPin } from "lucide-react";

type ChatMessage = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  type: string;
  texte: string | null;
  photos: string[];
  videos: string[];
  hiddenFromClient: boolean;
  incidentId: string | null;
  demandeId: string | null;
  commandeId: string | null;
  sortieId: string | null;
  rapportId: string | null;
  createdAt: Date | string;
  reactions?: { emoji: string; userId: string }[];
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
const FILTERS: { key: string; label: string; types: string[] }[] = [
  { key: "ALL", label: "Tout", types: [] },
  { key: "NOTE", label: "💬 Messages", types: ["NOTE"] },
  {
    key: "INCIDENT",
    label: "⚠️ Incidents",
    types: ["SYSTEM_INCIDENT", "SYSTEM_INCIDENT_RESOLU"],
  },
  { key: "DEMANDE", label: "📦 Demandes", types: ["SYSTEM_DEMANDE"] },
  {
    key: "COMMANDE",
    label: "🛒 Commandes",
    types: ["SYSTEM_COMMANDE", "SYSTEM_COMMANDE_LIVREE"],
  },
  { key: "RAPPORT", label: "📝 Rapports", types: ["SYSTEM_RAPPORT"] },
  { key: "MATERIEL", label: "🧰 Matériel", types: ["SYSTEM_SORTIE", "SYSTEM_RETOUR"] },
  {
    key: "LOCATION",
    label: "🚚 Locations",
    types: ["SYSTEM_LOCATION", "SYSTEM_LOCATION_FIN"],
  },
  { key: "PLAN", label: "📐 Plans", types: ["SYSTEM_PLAN"] },
];

const TYPE_META: Record<
  string,
  { Icon: typeof AlertTriangle; label: string; bg: string; text: string; href?: (m: ChatMessage) => string | null }
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

export function ChantierFeed({
  chantierId,
  messages,
  currentUserId,
  canEdit,
  canPilotDemandes = false,
  demandeInfo = {},
  photoMeta = {},
}: {
  chantierId: string;
  messages: ChatMessage[];
  currentUserId: string;
  canEdit: boolean;
  canPilotDemandes?: boolean;
  demandeInfo?: Record<string, DemandeInfo>;
  photoMeta?: Record<string, PhotoMeta>;
}) {
  // Polling live : refresh auto quand un nouveau message arrive
  useMessagerieLivePoll(chantierId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  // Résultats étendus chargés via API (au-delà des 14 jours)
  const [extendedResults, setExtendedResults] = useState<ChatMessage[]>([]);
  const [extendedSearching, setExtendedSearching] = useState(false);
  const lastExtendedQueryRef = useRef<string>("");

  const isFiltering = query.trim() !== "" || filter !== "ALL";

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
      // pour ne pas doublonner
      const before =
        messages.length > 0
          ? new Date(messages[0].createdAt).toISOString()
          : new Date().toISOString();
      const res = await fetch(
        `/api/messagerie/${encodeURIComponent(chantierId)}/search?q=${encodeURIComponent(
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

  // Filtrage côté client (volume modeste, 14 derniers jours)
  const visibleMessages = messages.filter((m) => {
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

  // Auto-scroll sur le dernier message — sauf en mode filtre/recherche
  // (on laisse l'utilisateur lire ses résultats sans saut surprise)
  useEffect(() => {
    if (isFiltering) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, isFiltering]);

  if (messages.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400 italic">
        Aucun message. Démarre la conversation avec le composer en bas 👇
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

  return (
    <div className="space-y-4 p-3">
      {/* Barre recherche + filtres rapides (sticky en haut du feed) */}
      <div className="sticky top-0 z-10 -m-3 mb-0 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
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
        <div className="mt-2 flex flex-wrap gap-1 overflow-x-auto">
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
              {f.label}
            </button>
          ))}
        </div>
        {isFiltering && (
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span>
              {visibleMessages.length} résultat
              {visibleMessages.length > 1 ? "s" : ""} sur les 14 derniers jours
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
                msg={m}
                isOwn={m.authorId === currentUserId}
                canEdit={canEdit}
                canPilotDemandes={canPilotDemandes}
                demandeInfo={m.demandeId ? demandeInfo[m.demandeId] : undefined}
                currentUserId={currentUserId}
                photoMeta={photoMeta}
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
                msg={m}
                isOwn={m.authorId === currentUserId}
                canEdit={canEdit}
                canPilotDemandes={canPilotDemandes}
                demandeInfo={m.demandeId ? demandeInfo[m.demandeId] : undefined}
                currentUserId={currentUserId}
                photoMeta={photoMeta}
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
  msg,
  isOwn,
  canEdit,
  canPilotDemandes,
  demandeInfo,
  currentUserId,
  photoMeta,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  canEdit: boolean;
  canPilotDemandes: boolean;
  demandeInfo: DemandeInfo | undefined;
  currentUserId: string;
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
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const meta = TYPE_META[msg.type] ?? TYPE_META.NOTE;
  const linkedHref = meta.href?.(msg) ?? null;
  const isTyped = msg.type !== "NOTE";

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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      loading="lazy"
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

          {/* Vidéos */}
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
                  <div className="absolute bottom-full left-0 mb-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1 flex gap-0.5 flex-wrap max-w-[240px]">
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                  title="Approuver et créer la commande"
                >
                  <Check size={12} /> Approuver &amp; commander
                </button>
                <button
                  type="button"
                  onClick={handleRefuseDemande}
                  disabled={pending}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 text-xs hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
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

          {/* Footer : actions */}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 hover:text-brand-600 dark:hover:text-brand-400"
              title="Ajouter une réaction"
            >
              <SmilePlus size={11} /> Réagir
            </button>
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
