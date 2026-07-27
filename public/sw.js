// Service Worker — Nashriyot Master PWA
// Offline sahifani cache qiladi va /quick/* URL larni intercept qiladi.

const CACHE_NAME = "nashriyot-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/quick/sale", "/quick/payment", "/quick/expense", "/quick/transfer"];

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API entry endpointlari — offline bo'lsa network xatosi qaytaradi
  // (client-side offline-queue.ts IndexedDB ga saqlaydi)
  if (url.pathname.startsWith("/api/v1/entry/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ data: null, error: { code: "OFFLINE", message: "Offline" }, meta: null }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    return;
  }

  // /quick/* sahifalari — offline bo'lsa cache dan, yo'q bo'lsa offline sahifasi
  if (url.pathname.startsWith("/quick/")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // Muvaffaqiyatli javobni cache ga saqlash
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(
            (cached) =>
              cached ||
              caches.match(OFFLINE_URL) ||
              new Response("Offline", { status: 503 }),
          ),
        ),
    );
    return;
  }

  // Boshqa so'rovlar — network first, xato bo'lsa cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((cached) => cached || caches.match(OFFLINE_URL))),
  );
});

// ─── Background Sync ────────────────────────────────────────────────────────
self.addEventListener("sync", (e) => {
  if (e.tag === "entry-sync") {
    e.waitUntil(syncEntries());
  }
});

async function syncEntries() {
  // Barcha client larni topib, flush signalini yuborish
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_QUEUE" });
  }
}
