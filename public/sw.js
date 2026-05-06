/* Service Worker minimaliste pour rendre l'app installable (PWA).
   Strategy: network-first pour tout, avec un cache statique léger pour
   les assets de coquille (icônes, manifest, fonts). On évite de mettre en
   cache les pages dynamiques pour ne pas servir de données obsolètes. */

const CACHE_NAME = "autonhome-shell-v1";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/brand/logo-icon.webp",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
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
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Statique : cache-first
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
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Pages et API : network-first, fallback offline simple
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(
          "<h1>Hors ligne</h1><p>Reconnecte-toi à internet pour utiliser l'app.</p>",
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 503,
          }
        )
    )
  );
});
