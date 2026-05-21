"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Bandeau discret affiché quand le navigateur détecte qu'on est hors ligne.
 * S'auto-met-à-jour via les events `online` / `offline`.
 * En offline, les pages déjà visitées restent accessibles (cache SW), mais
 * toutes les écritures (server actions, API) échoueront.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium shadow-lg pointer-events-none">
      <WifiOff size={14} />
      Hors ligne — lecture seule
    </div>
  );
}
