"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Square,
  AlertTriangle,
  Package,
  ShoppingCart,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { toggleMessageIncluded } from "./actions";
import {
  toggleHiddenFromClient,
} from "@/app/(app)/journal/actions";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  type: string;
  texte: string | null;
  photos: string[];
  videos: string[];
  hiddenFromClient: boolean;
  date: Date | string;
  createdAt: Date | string;
  authorName: string | null;
  incidentId: string | null;
  demandeId: string | null;
  commandeId: string | null;
};

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function typeIcon(type: string) {
  switch (type) {
    case "SYSTEM_INCIDENT":
      return AlertTriangle;
    case "SYSTEM_DEMANDE":
      return Package;
    case "SYSTEM_COMMANDE":
      return ShoppingCart;
    case "SYSTEM_RAPPORT":
    case "BILAN_JOURNEE":
      return FileText;
    default:
      return FileText;
  }
}

export function HebdoMessageRow({
  chantierId,
  semaineDebutStr,
  message: m,
  excluded,
  isAdmin,
  isClient,
}: {
  chantierId: string;
  semaineDebutStr: string;
  message: Message;
  excluded: boolean;
  isAdmin: boolean;
  isClient: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // Visible client = pas hiddenFromClient ET pas dans hiddenMessageIds
  const isVisibleForClient = !m.hiddenFromClient && !excluded;

  function onToggleIncluded() {
    startTransition(async () => {
      try {
        await toggleMessageIncluded(chantierId, semaineDebutStr, m.id);
        toast.success(
          excluded
            ? "Inclus dans le rapport"
            : "Exclu du rapport (non visible client)"
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function onTogglePermanentHidden() {
    startTransition(async () => {
      try {
        await toggleHiddenFromClient(m.id);
        toast.success(
          m.hiddenFromClient
            ? "Visible client (toujours)"
            : "Caché client (toujours)"
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const Icon = typeIcon(m.type);

  return (
    <li
      className={cn(
        "px-3 sm:px-4 py-3 flex gap-3",
        !isVisibleForClient &&
          isAdmin &&
          "bg-slate-50 dark:bg-slate-800/50 opacity-70"
      )}
    >
      {/* Checkbox d'inclusion (admin uniquement) */}
      {isAdmin && (
        <button
          type="button"
          onClick={onToggleIncluded}
          disabled={pending || m.hiddenFromClient}
          className={cn(
            "shrink-0 mt-0.5",
            isVisibleForClient
              ? "text-green-600 hover:text-green-700"
              : "text-slate-400 hover:text-slate-600",
            m.hiddenFromClient && "opacity-50 cursor-not-allowed"
          )}
          title={
            m.hiddenFromClient
              ? "Caché de manière permanente (depuis le journal)"
              : isVisibleForClient
                ? "Inclus — clic pour exclure"
                : "Exclu — clic pour inclure"
          }
        >
          {isVisibleForClient ? (
            <CheckSquare size={18} />
          ) : (
            <Square size={18} />
          )}
        </button>
      )}

      {/* Icône type */}
      <div className="shrink-0 mt-0.5 text-slate-400">
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-2 flex-wrap">
          <span>{dateTimeFmt.format(new Date(m.createdAt))}</span>
          {m.authorName && (
            <>
              <span>·</span>
              <span>{m.authorName}</span>
            </>
          )}
          {m.hiddenFromClient && isAdmin && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px] uppercase tracking-wider font-medium">
              Caché toujours
            </span>
          )}
          {!isVisibleForClient && isAdmin && !m.hiddenFromClient && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wider font-medium">
              Exclu cette semaine
            </span>
          )}
        </div>
        {m.texte && (
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
            {m.texte}
          </div>
        )}
        {m.photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-2">
            {m.photos.map((url, idx) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-square rounded overflow-hidden bg-slate-100 dark:bg-slate-800"
              >
                <Image
                  src={url}
                  alt={`Photo ${idx + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {m.videos.length > 0 && !isClient && (
          <div className="mt-2 space-y-2">
            {m.videos.map((url) => (
              <video
                key={url}
                src={url}
                controls
                preload="metadata"
                className="w-full max-h-64 rounded-md bg-black"
              />
            ))}
          </div>
        )}
        {/* Pour le client, on cache les vidéos uniquement si on a décidé que les vidéos étaient internes — pour l'instant on les laisse */}
        {m.videos.length > 0 && isClient && (
          <div className="mt-2 space-y-2">
            {m.videos.map((url) => (
              <video
                key={url}
                src={url}
                controls
                preload="metadata"
                className="w-full max-h-64 rounded-md bg-black"
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {m.incidentId && (
            <Link
              href={`/incidents/${m.incidentId}`}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Voir incident <ExternalLink size={10} />
            </Link>
          )}
          {m.demandeId && !isClient && (
            <Link
              href={`/demandes/${m.demandeId}`}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Voir demande <ExternalLink size={10} />
            </Link>
          )}
          {m.commandeId && !isClient && (
            <Link
              href={`/commandes/${m.commandeId}`}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Voir commande <ExternalLink size={10} />
            </Link>
          )}
        </div>
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={onTogglePermanentHidden}
          disabled={pending}
          className="shrink-0 self-start text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
          title="Cacher ce message DÉFINITIVEMENT (toutes semaines, pas juste celle-ci)"
        >
          {m.hiddenFromClient ? "Réafficher def." : "Cacher def."}
        </button>
      )}
    </li>
  );
}
