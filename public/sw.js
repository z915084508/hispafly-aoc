/* Only these public, identity-free files may enter Cache Storage.
 * Bump VERSION whenever an allowlisted file or this worker changes.
 * Business HTML, RSC, chunks, APIs, PDFs and writes are NEVER cached. */
const VERSION = "v1";
const CACHE_PREFIX = "hispafly-aoc-static-";
const CACHE_NAME = CACHE_PREFIX + VERSION;
const STATIC_FILES = new Map([
  ["/offline.html", "text/html"],
  ["/icons/icon-192.png", "image/png"],
  ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-maskable-512.png", "image/png"],
  ["/icons/apple-touch-icon.png", "image/png"],
  ["/favicon.ico", "image/"],
]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Validate every response before writing, so a login redirect cannot enter the cache.
    const entries = await Promise.all([...STATIC_FILES].map(async ([path, mime]) => {
      const response = await fetch(path, { credentials: "omit", cache: "reload", redirect: "error" });
      if (!response.ok || response.redirected || response.type === "opaque" ||
          !(response.headers.get("Content-Type") || "").startsWith(mime) ||
          /private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
        throw new Error("Unsafe PWA static response: " + path);
      }
      return [path, response];
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(entries.map(([path, response]) => cache.put(path, response)));
    // Updates wait for an explicit user action or for all old windows to close.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys())
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "AOC_ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname.startsWith("/api/") || request.headers.has("RSC") ||
      request.headers.has("Next-Action") || request.headers.has("Next-Router-Prefetch")) return;

  if (STATIC_FILES.has(url.pathname) && !url.search && !request.headers.has("Range")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Always use the network, including when the browser's HTTP cache has old HTML.
        return await fetch(request, { cache: "no-store" });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const offline = await cache.match("/offline.html");
        return new Response(offline ? await offline.text() : "HISPAFLY AOC requires a connection.", {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    })());
  }
});
