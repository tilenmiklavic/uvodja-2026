/* U Vodja service worker: makes the site installable and keeps it usable offline.
   Network first for this site's own files (so a deploy shows up right away); the last good copy is used only when offline.
   Requests to other hosts (Google sign-in, Apps Script, fonts) are not touched. */
const CACHE = "uvodja-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") { const page = await caches.match("./", { ignoreSearch: true }) || await caches.match("index.html", { ignoreSearch: true }); if (page) return page; }
      throw err;
    }
  })());
});
