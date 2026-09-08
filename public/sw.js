const CACHE = "ginder-static-v13";
const TELEGRAM_BRIDGE = "https://telegram.org/js/telegram-web-app.js?63";
const CORE = [
  "/map",
  "/festival-map-original.png?v=4",
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
        .filter((value) => value.startsWith("/_next/static/") || value.startsWith("/festival-") || value.startsWith("/ginder-")),
    );
    await Promise.all([...assetUrls].map((url) => cacheOne(cache, url)));
  } catch {
    // Explicit core files still leave the built-in festival map usable offline.
  }
}

function isFestivalMapImage(url) {
  return url.origin === self.location.origin && /^\/api\/festivals\/[^/]+\/map-image$/.test(url.pathname);
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

  const festivalMapImage = isFestivalMapImage(url);
  if (isSameOrigin && url.pathname.startsWith("/api/") && !festivalMapImage) return;

  // User-created festival maps are proxied through an API route. Keep that
  // one image route network-first so a replaced map refreshes online while
  // the most recently viewed copy remains available when festival reception dies.
  if (festivalMapImage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }

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
