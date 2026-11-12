"use strict";
/* U Vodja 2026 – site-config API (runs next to the static site on the netcup server).
 *
 * Which pages are visible on which address (https://vodja.miklavic.si, https://tilenmiklavic.github.io/uvodja-2026).
 * No dependencies; state is one JSON file (a Docker volume). Replaces the "which page is on" switches that lived in
 * Apps Script, for the page visibility part – the site falls back to its saved copy / the Apps Script switches
 * when this API cannot be reached.
 *
 *   GET  /api/site-config?host=<hostname>      public → { ok, host, pages: { <page>: true|false }, updatedAt }
 *        true = visible (even when the event-ended lockdown would hide it), false = hidden for everyone but admins,
 *        missing = the site's own default.
 *   POST /api/admin/site-config                admins only, body (JSON, any content type) { credential, action, … }
 *        { action: "get" }                                 → { ok, sites, pages, config, updated, log }
 *        { action: "set", host, page, value: true|false|null } → same as "get" (null = back to default)
 *   GET  /api/healthz
 *
 * "credential" is a Google ID token of the signed-in user (checked with Google's tokeninfo, audience = our client id).
 * Admin = role "admin" in the site's data/access.json (read from the live release) or listed in ADMIN_EMAILS.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || "/data/config.json";
const ACCESS_FILE = process.env.ACCESS_FILE || "/srv/vodja/current/data/access.json";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const TOKENINFO_URL = process.env.TOKENINFO_URL || "https://oauth2.googleapis.com/tokeninfo";
const lower = (s) => String(s || "").trim().toLowerCase();
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(/[\s,;]+/).map(lower).filter(Boolean);

/* The addresses the site is served from. host = location.hostname (what the browser sends as ?host=). */
const SITES = {
  "vodja.miklavic.si": { label: "vodja.miklavic.si", origin: "https://vodja.miklavic.si" },
  "tilenmiklavic.github.io": { label: "tilenmiklavic.github.io/uvodja-2026", origin: "https://tilenmiklavic.github.io" },
};
for (const h of (process.env.DEV_HOSTS || "").split(/[\s,;]+/).filter(Boolean)) SITES[h] = { label: `${h} (dev)`, origin: `http://${h}` }; // local testing only
const ORIGINS = new Set([...Object.values(SITES).map((s) => s.origin), ...(process.env.ALLOWED_ORIGINS || "").split(/[\s,;]+/).filter(Boolean)]);
/* Pages an admin can switch per address (Nadzor itself can never be hidden from admins) */
const PAGES = ["domov", "casovnica", "teme", "gradiva", "ekipa", "os", "uu", "preverbe", "zabava", "trgovina", "opravila", "vprasanja", "analitika"];

/* —— storage: { sites: { host: { pages: { page: bool } } }, updated: { host: { at, by } }, log: [...] } —— */
function load() {
  try { const j = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); if (j && typeof j === "object") return { sites: j.sites || {}, updated: j.updated || {}, log: j.log || [] }; } catch {}
  return { sites: {}, updated: {}, log: [] };
}
let store = load();
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
  fs.renameSync(tmp, DATA_FILE); // atomic
}
const pagesOf = (host) => ({ ...(store.sites[host]?.pages || {}) });

/* —— Google sign-in check (cached for a few minutes per token) —— */
const tokCache = new Map();
async function verify(credential) {
  const cred = String(credential || "");
  if (!cred || cred.length > 4096) return null;
  const key = crypto.createHash("sha256").update(cred).digest("hex"), hit = tokCache.get(key);
  if (hit && hit.until > Date.now()) return hit.who;
  let t;
  try {
    const r = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(cred)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    t = await r.json();
  } catch { return null; }
  if (!t || t.aud !== CLIENT_ID || String(t.email_verified) !== "true" || !(Number(t.exp) * 1000 > Date.now())) return null;
  const who = { email: lower(t.email), name: t.name || "" };
  tokCache.set(key, { who, until: Math.min(Number(t.exp) * 1000, Date.now() + 5 * 60000) });
  if (tokCache.size > 500) for (const [k, v] of tokCache) if (v.until < Date.now()) tokCache.delete(k);
  return who;
}
function isAdmin(email) {
  if (ADMIN_EMAILS.includes(email)) return true;
  try {
    const users = JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8")).users || {};
    return Object.entries(users).some(([k, role]) => lower(k) === email && lower(role) === "admin");
  } catch { return false; }
}

/* —— http —— */
function send(res, code, body, req, extra = {}) {
  const origin = req?.headers.origin, headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra };
  if (origin && ORIGINS.has(origin)) { headers["Access-Control-Allow-Origin"] = origin; headers["Vary"] = "Origin"; }
  res.writeHead(code, headers);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > 8192) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}
const adminView = () => ({ ok: true, sites: Object.entries(SITES).map(([host, s]) => ({ host, label: s.label })), pages: PAGES, config: Object.fromEntries(Object.keys(SITES).map((h) => [h, pagesOf(h)])), updated: store.updated, log: store.log.slice(-20).reverse() });

let queue = Promise.resolve(); // writes one after another
async function adminCall(body) {
  const who = await verify(body.credential);
  if (!who) return [401, { ok: false, error: "prijava ni veljavna" }];
  if (!isAdmin(who.email)) return [403, { ok: false, error: "ni dostopa" }];
  if (body.action === "get") return [200, adminView()];
  if (body.action === "set") {
    const { host, page, value } = body;
    if (!SITES[host]) return [400, { ok: false, error: "neznan naslov" }];
    if (!PAGES.includes(page)) return [400, { ok: false, error: "neznana stran" }];
    if (value !== true && value !== false && value !== null) return [400, { ok: false, error: "neveljavna vrednost" }];
    await (queue = queue.then(() => {
      const site = (store.sites[host] ||= { pages: {} });
      const before = site.pages[page] ?? null;
      if (value === null) delete site.pages[page]; else site.pages[page] = value;
      const at = Date.now();
      store.updated[host] = { at, by: who.email };
      if (before !== value) store.log.push({ at, by: who.email, host, page, from: before, to: value });
      store.log = store.log.slice(-200);
      save();
    }));
    return [200, adminView()];
  }
  return [400, { ok: false, error: "neznano dejanje" }];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") return send(res, 204, "", req, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" });
    if (url.pathname === "/api/healthz") return send(res, 200, { ok: true }, req);
    if (url.pathname === "/api/site-config" && req.method === "GET") {
      const host = lower(url.searchParams.get("host"));
      return send(res, 200, { ok: true, host, pages: SITES[host] ? pagesOf(host) : {}, updatedAt: store.updated[host]?.at || null }, req);
    }
    if (url.pathname === "/api/admin/site-config" && req.method === "POST") {
      const [code, out] = await adminCall(await readBody(req));
      return send(res, code, out, req);
    }
    return send(res, 404, { ok: false, error: "not_found" }, req);
  } catch (err) {
    return send(res, err.message === "too_large" ? 413 : err.message === "bad_json" ? 400 : 500, { ok: false, error: err.message === "too_large" || err.message === "bad_json" ? err.message : "server_error" }, req);
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`site-config API on :${PORT}`));
module.exports = { server };
