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

/* Admin push notifications (apps-script/push.gs → push-worker): payload {title, body, url, tag} */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "U Vodja 2026", {
    body: d.body || "", icon: "assets/logos/icon-192.png", badge: "assets/logos/favicon-32.png",
    ...(d.tag ? { tag: d.tag, renotify: true } : {}), data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      try { await win.navigate(url); } catch {}
      return;
    }
    await self.clients.openWindow(url);
  })());
});
