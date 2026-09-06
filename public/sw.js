const CACHE = "space-safari-static-v6";
const TELEGRAM_BRIDGE = "https://telegram.org/js/telegram-web-app.js?63";
const CORE = [
  "/map",
  "/hastiere-offline.webp?v=2",
  "/festival-map.jpg?v=4",
  TELEGRAM_BRIDGE,
];

async function cacheOne(cache, request) {
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
    return response.ok || response.type === "opaque" ? response : null;
  } catch {
    return null;
  }
}

async function precacheMapShell(cache) {
  const response = await cacheOne(cache, "/map");
  if (!response) return;

  try {
    const html = await response.clone().text();
    const assetUrls = new Set(
      [...html.matchAll(/(?:src|href)="([^"#?]+(?:\?[^"#]*)?)"/g)]
        .map((match) => match[1])
        .filter((value) => value.startsWith("/_next/static/") || value.startsWith("/festival-")),
    );
    await Promise.all([...assetUrls].map((url) => cacheOne(cache, url)));
  } catch {
    // Explicit core files still leave a usable festival map offline.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.filter((url) => url !== "/map").map((url) => cacheOne(cache, url)));
    await precacheMapShell(cache);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  const isSameOrigin = url.origin === self.location.origin;
  const isTelegramBridge = event.request.url === TELEGRAM_BRIDGE;
  if (!isSameOrigin && !isTelegramBridge) return;
  if (isSameOrigin && url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const clone = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      } catch {
        return (await caches.match(event.request)) || (await caches.match("/map")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        const clone = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
