"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  deleteChantierMessage,
  toggleMessageClientVisibility,
} from "./actions";

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
};

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
export function ChantierFeed({
  messages,
  currentUserId,
  canEdit,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  canEdit: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Au montage et à chaque ajout/changement, on ramène la vue sur
  // le dernier message (comportement WhatsApp).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400 italic">
        Aucun message. Démarre la conversation avec le composer en bas 👇
      </div>
    );
  }

  // Groupe par jour
  const groups = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const k = dayKey(m.createdAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }

  return (
    <div className="space-y-4 p-3">
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
}: {
  msg: ChatMessage;
  isOwn: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<string | null>(null);
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
              {msg.photos.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="w-20 h-20 rounded overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
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

          {/* Footer : actions */}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
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

      {/* Lightbox simple */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}
