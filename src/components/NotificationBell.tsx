"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  X,
  FileText,
  AlertTriangle,
  Package,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  Banknote,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
} from "@/app/(app)/notifications/actions";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date | string;
};

const iconMap: Record<string, typeof Bell> = {
  RAPPORT_CREE: FileText,
  INCIDENT_OUVERT: AlertTriangle,
  INCIDENT_RESOLU: CheckCircle2,
  DEMANDE_CREEE: Package,
  DEMANDE_APPROUVEE: CheckCircle2,
  DEMANDE_REFUSEE: XCircle,
  DEMANDE_COMMANDEE: ShoppingCart,
  PAIEMENT_GENERE: Banknote,
  USER_PENDING: UserPlus,
};

const dateRel = (d: Date | string): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
};

export function NotificationBell({
  notifications: initial,
  unreadCount: initialUnread,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const unread = initial.filter((n) => !n.read).length;
  // Préfère le compte serveur s'il diverge (cas où la liste est tronquée)
  const badgeCount = Math.max(unread, initialUnread);

  // Ferme le panel quand on clique à l'extérieur
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-notif-panel]")) return;
      if (target?.closest("[data-notif-bell]")) return;
      setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  function onItemClick(n: Notification) {
    if (!n.read) {
      startTransition(async () => {
        await markNotificationRead(n.id);
      });
    }
    setOpen(false);
  }

  function onMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function onClear() {
    startTransition(async () => {
      await clearReadNotifications();
      router.refresh();
    });
  }

  function onDeleteOne(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await deleteNotification(id);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-notif-bell
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {badgeCount > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-bold px-1 py-px rounded-full leading-none min-w-[1rem] text-center">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-notif-panel
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50"
        >
          <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </h3>
            <div className="flex items-center gap-2 text-xs">
              {badgeCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={pending}
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Tout lu
                </button>
              )}
              {initial.some((n) => n.read) && (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={pending}
                  className="text-slate-500 dark:text-slate-400 hover:underline"
                >
                  Effacer lus
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {initial.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune notification
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {initial.map((n) => {
                  const Icon = iconMap[n.type] ?? Bell;
                  const content = (
                    <>
                      <div
                        className={cn(
                          "shrink-0 p-2 rounded-full",
                          n.read
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                            : "bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400"
                        )}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={cn(
                              "text-sm truncate",
                              n.read
                                ? "text-slate-600 dark:text-slate-400"
                                : "font-medium text-slate-900 dark:text-slate-100"
                            )}
                          >
                            {n.title}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => onDeleteOne(n.id, e)}
                            className="text-slate-300 dark:text-slate-600 hover:text-red-500 shrink-0"
                            aria-label="Supprimer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {n.message && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 block">
                          {dateRel(n.createdAt)}
                        </span>
                      </div>
                      {!n.read && (
                        <span
                          className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-2"
                          aria-label="non lue"
                        />
                      )}
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => onItemClick(n)}
                          className={cn(
                            "flex items-start gap-2.5 p-3 transition",
                            n.read
                              ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              : "bg-brand-50/40 dark:bg-brand-900/10 hover:bg-brand-50/80 dark:hover:bg-brand-900/30"
                          )}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onItemClick(n)}
                          className={cn(
                            "w-full text-left flex items-start gap-2.5 p-3 transition",
                            n.read
                              ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              : "bg-brand-50/40 dark:bg-brand-900/10"
                          )}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
