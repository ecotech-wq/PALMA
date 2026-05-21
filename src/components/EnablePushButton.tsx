"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------
 *  Bouton « Activer / Désactiver les notifications navigateur ».
 *
 *  Logique :
 *   - Si le navigateur ne supporte pas Push API → message d'info, bouton désactivé
 *   - Si la clé VAPID publique n'est pas configurée → bouton désactivé
 *   - Sinon : permet de s'abonner / se désabonner
 *   - L'état (subscribed / not / blocked) est détecté au montage
 * ----------------------------------------------------------------------- */

type Status = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export function EnablePushButton({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (!vapidPublicKey) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(sub ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function handleEnable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        toast.error("Permission refusée");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Si déjà abonné, on désabonne d'abord (clé peut avoir changé)
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      });
      const j = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: j.endpoint,
          keys: j.keys,
        }),
      });
      if (!res.ok) throw new Error("Échec de l'enregistrement");
      setStatus("on");
      toast.success("Notifications activées sur ce navigateur");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      toast.success("Notifications désactivées");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 opacity-60"
      >
        <Bell size={14} /> Notifications…
      </button>
    );
  }

  if (status === "unsupported") {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
        <BellOff size={14} /> Notifications non supportées sur ce navigateur
      </span>
    );
  }

  if (status === "denied") {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 dark:border-amber-900 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40">
        <BellOff size={14} /> Notifications bloquées — autorisez-les dans les
        paramètres du navigateur
      </span>
    );
  }

  if (status === "off") {
    return (
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-50"
      >
        <Bell size={14} /> Activer les notifications
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDisable}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm hover:bg-emerald-100 dark:hover:bg-emerald-950 disabled:opacity-50"
    >
      <Bell size={14} /> Notifications activées · cliquez pour désactiver
    </button>
  );
}
