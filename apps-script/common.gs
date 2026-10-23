/**
 * Shared helpers for the site handlers (preverbe, stavnica, ocene, analitika): cached sign-in checks,
 * cached roles and cached/pre-computed results, so most requests skip the slow Google calls.
 *
 * Add a time-driven trigger for refreshSiteCaches (Triggers → Add trigger → refreshSiteCaches →
 * Time-driven → Minutes timer → Every 10 minutes) so the leaderboard and Analitika are always pre-computed.
 */
const SITE_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const SITE_MAILS_ID = "1vVw8vgcIjOjUmsnOIwnxBxTmD-piKkQ9-eap8kB_DDI";
const SITE_ROLE_TTL = 600;        // s – role changes in the mails sheet apply within 10 min
const SITE_RESULT_TTL = 1800;     // s – pre-computed results; the 10-min trigger refreshes them before they expire
const SITE_RESULT_FALLBACK = 600; // s – when computed on demand (no trigger yet)

function siteJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function siteHash_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))); }

/** Verified Google ID token payload ({email, name, …}) or null. Verified tokens are remembered until they expire (max 1 h). */
function siteVerify_(credential) {
  if (!credential) return null;
  const cache = CacheService.getScriptCache(), key = "tok:" + siteHash_(credential);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), { muteHttpExceptions: true });
  const tok = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
  if (!tok || tok.aud !== SITE_CLIENT_ID || String(tok.email_verified) !== "true") return null;
  const ttl = Math.min(3600, Math.floor(Number(tok.exp) - Date.now() / 1000) - 30);
  if (ttl > 30) cache.put(key, JSON.stringify({ email: String(tok.email).toLowerCase(), name: tok.name || "", exp: tok.exp }), ttl);
  return { email: String(tok.email).toLowerCase(), name: tok.name || "", exp: tok.exp };
}

/** Role from the mails sheet (name | mail | role), cached per e-mail. "" when not listed. */
function siteRole_(email) {
  const cache = CacheService.getScriptCache(), key = "role:" + siteHash_(String(email).toLowerCase());
  const hit = cache.get(key);
  if (hit !== null) return hit;
  const rows = SpreadsheetApp.openById(SITE_MAILS_ID).getSheetByName("mails").getDataRange().getDisplayValues();
  const row = rows.find((r) => String(r[1]).trim().toLowerCase() === String(email).toLowerCase());
  const role = row ? String(row[2]).trim().toLowerCase() : "";
  cache.put(key, role, SITE_ROLE_TTL);
  return role;
}

/** Cache helpers that split large values into ≤90 KB chunks (CacheService limit is 100 KB per key). */
function siteCachePut_(key, value, ttl) {
  const cache = CacheService.getScriptCache(), s = JSON.stringify(value), size = 90000, parts = {};
  const n = Math.ceil(s.length / size) || 1;
  for (let i = 0; i < n; i++) parts[key + ":" + i] = s.slice(i * size, (i + 1) * size);
  parts[key] = String(n);
  cache.putAll(parts, ttl);
}
function siteCacheGet_(key) {
  const cache = CacheService.getScriptCache(), n = Number(cache.get(key));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + ":" + i);
  const got = cache.getAll(keys);
  if (keys.some((k) => got[k] == null)) return null;
  try { return JSON.parse(keys.map((k) => got[k]).join("")); } catch (e) { return null; }
}
/** Cached result, computing it on demand (and caching it) when missing. */
function siteCached_(key, compute) {
  const hit = siteCacheGet_(key);
  if (hit) return hit;
  const value = compute();
  siteCachePut_(key, value, SITE_RESULT_FALLBACK);
  return value;
}

/** Time-driven trigger (every 10 min): pre-compute the leaderboard and Analitika so visitors never wait for them. */
function refreshSiteCaches() {
  siteCachePut_("ocene", oceneCompute_(), SITE_RESULT_TTL);
  siteCachePut_("analitika", analitikaCompute_(), SITE_RESULT_TTL);
}
