"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Camera,
  Video,
  X,
  Trash2,
  AlertTriangle,
  Package,
  ShoppingCart,
  FileText,
  Eye,
  EyeOff,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";
import {
  createJournalMessage,
  deleteJournalMessage,
  toggleHiddenFromClient,
} from "./actions";

type Message = {
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
  createdAt: Date | string;
};

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function isAuthored(type: string) {
  return type === "NOTE" || type === "BILAN_JOURNEE";
}

function systemIcon(type: string) {
  switch (type) {
    case "SYSTEM_INCIDENT":
      return AlertTriangle;
    case "SYSTEM_DEMANDE":
      return Package;
    case "SYSTEM_COMMANDE":
      return ShoppingCart;
    case "SYSTEM_RAPPORT":
      return FileText;
    default:
      return FileText;
  }
}

function systemColor(type: string) {
  switch (type) {
    case "SYSTEM_INCIDENT":
      return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400";
    case "SYSTEM_DEMANDE":
      return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400";
    case "SYSTEM_COMMANDE":
      return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400";
    case "SYSTEM_RAPPORT":
      return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400";
    default:
      return "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300";
  }
}

export function JournalTimeline({
  chantierId,
  date,
  messages,
  currentUserId,
  isAdmin,
  isClient,
}: {
  chantierId: string;
  date: string;
  messages: Message[];
  currentUserId: string;
  isAdmin: boolean;
  isClient: boolean;
}) {
  return (
    <div>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-8">
            Aucune activité ce jour. Lance la conversation ↓
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={m.authorId === currentUserId}
              isAdmin={isAdmin}
              isClient={isClient}
            />
          ))
        )}
      </div>

      {/* Zone de saisie (cachée pour client) */}
      {!isClient && (
        <div className="mt-4 sticky bottom-0 bg-slate-50 dark:bg-slate-950 pt-3 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-2 border-t border-slate-200 dark:border-slate-800">
          <ComposeBox chantierId={chantierId} date={date} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message: m,
  isMine,
  isAdmin,
  isClient,
}: {
  message: Message;
  isMine: boolean;
  isAdmin: boolean;
  isClient: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const isSystem = !isAuthored(m.type);
  const isBilan = m.type === "BILAN_JOURNEE";

  // Hide for client if marked hidden
  if (isClient && m.hiddenFromClient) return null;

  function onDelete() {
    if (!confirm("Supprimer ce message ?")) return;
    startTransition(async () => {
      try {
        await deleteJournalMessage(m.id);
        toast.success("Supprimé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function onToggleHidden() {
    startTransition(async () => {
      try {
        await toggleHiddenFromClient(m.id);
        toast.success(
          m.hiddenFromClient
            ? "Message visible par le client"
            : "Message caché du client"
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const ageMs = Date.now() - new Date(m.createdAt).getTime();
  const editable = isMine && ageMs < 5 * 60 * 1000;
  const canDelete = isAdmin || editable;
  const SystemIcon = systemIcon(m.type);

  if (isSystem) {
    return (
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${systemColor(m.type)} ${m.hiddenFromClient ? "opacity-60" : ""}`}
      >
        <div className="flex items-start gap-2">
          <SystemIcon size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="whitespace-pre-wrap break-words">
              {m.texte}
            </div>
            <div className="text-[10px] opacity-70 mt-1 flex items-center gap-2">
              <span>{timeFmt.format(new Date(m.createdAt))}</span>
              {m.incidentId && (
                <Link
                  href={`/incidents/${m.incidentId}`}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  Voir incident <ExternalLink size={10} />
                </Link>
              )}
              {m.demandeId && (
                <Link
                  href={`/demandes/${m.demandeId}`}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  Voir demande <ExternalLink size={10} />
                </Link>
              )}
              {m.commandeId && (
                <Link
                  href={`/commandes/${m.commandeId}`}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  Voir commande <ExternalLink size={10} />
                </Link>
              )}
              {m.hiddenFromClient && (
                <span className="ml-auto text-[10px] italic">caché client</span>
              )}
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleHidden}
              disabled={pending}
              className="opacity-60 hover:opacity-100"
              title={
                m.hiddenFromClient
                  ? "Rendre visible au client"
                  : "Cacher du client"
              }
            >
              {m.hiddenFromClient ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
        </div>
        {m.photos.length > 0 && (
          <PhotoGrid
            photos={m.photos}
            onOpen={(i) => setLightboxIdx(i)}
            small
          />
        )}
      </div>
    );
  }

  // Message NOTE ou BILAN_JOURNEE (auteur)
  return (
    <div
      className={`flex ${isMine ? "flex-row-reverse" : "flex-row"} gap-2`}
    >
      <div className="shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-700 dark:text-slate-300">
        {(m.authorName ?? "?").charAt(0).toUpperCase()}
      </div>
      <div className={`max-w-[80%] ${isMine ? "items-end" : "items-start"}`}>
        <div
          className={`text-[10px] mb-0.5 flex items-center gap-1.5 ${isMine ? "justify-end" : "justify-start"} text-slate-500 dark:text-slate-400`}
        >
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {m.authorName ?? "Anonyme"}
          </span>
          {m.authorRole === "ADMIN" && (
            <span className="text-[9px] px-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
              admin
            </span>
          )}
          <span>{timeFmt.format(new Date(m.createdAt))}</span>
          {isBilan && (
            <span className="text-[9px] px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              bilan
            </span>
          )}
          {m.hiddenFromClient && (
            <span className="text-[9px] italic">caché client</span>
          )}
        </div>
        <div
          className={`rounded-2xl px-3 py-2 text-sm ${isMine ? "bg-brand-500 text-white" : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"} ${m.hiddenFromClient ? "opacity-60" : ""}`}
        >
          {m.texte && (
            <div className="whitespace-pre-wrap break-words">{m.texte}</div>
          )}
          {m.photos.length > 0 && (
            <PhotoGrid
              photos={m.photos}
              onOpen={(i) => setLightboxIdx(i)}
            />
          )}
          {m.videos.length > 0 && (
            <div className="mt-2 space-y-2">
              {m.videos.map((url) => (
                <video
                  key={url}
                  src={url}
                  controls
                  preload="metadata"
                  className="rounded-md max-w-full max-h-80 bg-black"
                />
              ))}
            </div>
          )}
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-2 justify-end">
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleHidden}
              disabled={pending}
              className="hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-0.5"
              title={
                m.hiddenFromClient
                  ? "Rendre visible au client"
                  : "Cacher du client"
              }
            >
              {m.hiddenFromClient ? (
                <EyeOff size={11} />
              ) : (
                <Eye size={11} />
              )}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="hover:text-red-600 inline-flex items-center gap-0.5"
              title="Supprimer"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Lightbox photos */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
          <div className="relative w-full h-full max-w-5xl max-h-[90vh]">
            <Image
              src={m.photos[lightboxIdx]}
              alt={`Photo ${lightboxIdx + 1}`}
              fill
              className="object-contain"
              sizes="90vw"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoGrid({
  photos,
  onOpen,
  small = false,
}: {
  photos: string[];
  onOpen: (idx: number) => void;
  small?: boolean;
}) {
  return (
    <div
      className={`grid gap-1 mt-2 ${
        small
          ? "grid-cols-3 sm:grid-cols-4"
          : photos.length === 1
            ? "grid-cols-1"
            : "grid-cols-2"
      }`}
    >
      {photos.map((url, idx) => (
        <button
          key={url}
          type="button"
          onClick={() => onOpen(idx)}
          className={`relative ${small ? "aspect-square" : "aspect-video"} rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800`}
        >
          <Image
            src={url}
            alt={`Photo ${idx + 1}`}
            fill
            sizes="200px"
            className="object-cover"
          />
        </button>
      ))}
    </div>
  );
}

/** Zone de saisie pour poster un nouveau message (texte + médias). */
function ComposeBox({
  chantierId,
  date,
}: {
  chantierId: string;
  date: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [texte, setTexte] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked]);
    if (e.target) e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(formData: FormData) {
    formData.delete("medias");
    for (const f of files) formData.append("medias", f);
    startTransition(async () => {
      try {
        await createJournalMessage(formData);
        setFiles([]);
        setTexte("");
        formRef.current?.reset();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <input type="hidden" name="chantierId" value={chantierId} />
      <input type="hidden" name="date" value={date} />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="relative w-14 h-14 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center"
            >
              {f.type.startsWith("video/") ? (
                <Video size={18} className="text-slate-500" />
              ) : (
                <Camera size={18} className="text-slate-500" />
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5 flex-wrap">
        {/* Caméra : ouvre direct l'appareil photo (mobile) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
        {/* Galerie : sélection depuis pellicule + multi */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPick}
          className="hidden"
        />
        {/* Vidéo : caméra arrière */}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="shrink-0 p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          title="Prendre une photo"
        >
          <Camera size={16} />
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="shrink-0 p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          title="Choisir depuis la galerie"
        >
          <ImageIcon size={16} />
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="shrink-0 p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          title="Vidéo"
        >
          <Video size={16} />
        </button>
        <Textarea
          name="texte"
          rows={1}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Écrire un message…"
          className="flex-1 min-h-[40px] resize-none"
        />
        <Button
          type="submit"
          size="sm"
          disabled={pending || (!texte && files.length === 0)}
        >
          <Send size={14} />
        </Button>
      </div>
      {pending && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
          Envoi en cours…
        </div>
      )}
    </form>
  );
}
