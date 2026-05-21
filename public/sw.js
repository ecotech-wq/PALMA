/* Service Worker Autonhome — PWA installable + offline read-only.
 *
 *   Stratégies :
 *     /icons/*, /brand/*, /manifest        → cache-first (assets de coquille)
 *     /uploads/*                            → cache-first (photos déjà uploadées)
 *     pages /(app)/*  (sauf API, RSC, _next/data)  → network-first + cache fallback
 *     tout le reste                         → network, fallback offline générique
 *
 *   IMPORTANT : on ne met JAMAIS en cache de POST (server actions, API
 *   d'écriture). En offline, les écritures échouent — c'est intentionnel.
 *
 *   Bump CACHE_VERSION quand tu changes la stratégie pour forcer un purge.
 */

const CACHE_VERSION = "v2";
const SHELL_CACHE  = `autonhome-shell-${CACHE_VERSION}`;
const PAGES_CACHE  = `autonhome-pages-${CACHE_VERSION}`;
const UPLOADS_CACHE = `autonhome-uploads-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, PAGES_CACHE, UPLOADS_CACHE];

const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/brand/logo-icon.webp",
];

// Limite de taille du cache pages — évite de remplir l'IDB
const PAGES_MAX_ENTRIES = 30;
// Cache des photos : limite plus généreuse pour le mode offline
const UPLOADS_MAX_ENTRIES = 200;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {
        /* ignore individual failures */
      })
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* -----------------------------------------------------------------------
 *  Web Push : réception d'une notification push + click handler.
 *  Le payload est un JSON { title, body, url, tag } envoyé par le serveur.
 * --------------------------------------------------------------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Autonhome", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Autonhome";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (_) {}
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

/* -----------------------------------------------------------------------
 *  Helpers cache
 * --------------------------------------------------------------------- */

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // Suppression FIFO : on enlève les plus anciennes (= les premières)
  const toRemove = keys.length - maxEntries;
  for (let i = 0; i < toRemove; i++) {
    await cache.delete(keys[i]);
  }
}

function offlineHtmlResponse() {
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Hors ligne</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
  .card { max-width: 24rem; text-align: center; background: #1e293b; padding: 2rem; border-radius: 0.75rem;
          border: 1px solid #334155; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #94a3b8; font-size: 0.875rem; margin: 0.5rem 0; }
  button { margin-top: 1rem; padding: 0.5rem 1rem; background: #2dd4bf; color: #0f172a;
           border: 0; border-radius: 0.375rem; font-weight: 600; cursor: pointer; }
  button:hover { background: #14b8a6; }
</style></head>
<body><div class="card">
  <h1>📡 Hors ligne</h1>
  <p>Cette page n'a pas encore été consultée — pas de version en cache.</p>
  <p>Reconnecte-toi à internet pour la charger.</p>
  <button onclick="location.reload()">Réessayer</button>
</div></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 503,
  });
}

/* -----------------------------------------------------------------------
 *  Fetch handler
 * --------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1) Assets de coquille : cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // 2) Photos uploadées : cache-first + fallback réseau
  //    (les photos sont stables : un fois servies, le nom de fichier ne change pas)
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(UPLOADS_CACHE).then(async (c) => {
                await c.put(req, copy);
                trimCache(UPLOADS_CACHE, UPLOADS_MAX_ENTRIES);
              });
            }
            return res;
          })
      )
    );
    return;
  }

  // 3) Routes API / data fetch RSC / endpoints d'écriture : pas de cache.
  //    Network-only avec fallback erreur (en offline les écritures échouent
  //    et le user voit le toast d'erreur normal).
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.searchParams.has("_rsc")
  ) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ ok: false, error: "Hors ligne" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 503,
          }
        )
      )
    );
    return;
  }

  // 4) Pages HTML : network-first + fallback cache + offline page
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const copy = fresh.clone();
            caches.open(PAGES_CACHE).then(async (c) => {
              await c.put(req, copy);
              trimCache(PAGES_CACHE, PAGES_MAX_ENTRIES);
            });
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return offlineHtmlResponse();
        }
      })()
    );
    return;
  }

  // 5) Bundles JS/CSS Next.js : network-first + cache fallback
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 6) Tout le reste : network avec fallback générique
  event.respondWith(
    fetch(req).catch(() => offlineHtmlResponse())
  );
});
