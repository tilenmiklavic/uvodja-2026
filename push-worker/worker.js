/**
 * U Vodja 2026 – Web Push sender (Cloudflare Worker).
 *
 * Apps Script can't do the cryptography Web Push needs (ECDSA P-256 for VAPID, ECDH + AES-128-GCM for the payload),
 * so it hands each notification to this Worker. The Worker keeps no data: Apps Script sends the subscriptions, the
 * message and its own VAPID keys with every request; the Worker signs, encrypts and posts to the browser's push
 * service (Google / Apple / Mozilla) and reports each subscription's status (404/410 = gone, Apps Script removes it).
 *
 * Setup (Cloudflare dashboard → Workers & Pages → Create → Worker → "Hello world" → Edit code → paste this file → Deploy),
 * then Settings → Variables and Secrets → Add → type Secret, name PUSH_SECRET, value = a long random string
 * (the same value goes into Apps Script's Script properties as PUSH_SECRET). See apps-script/push.gs.
 *
 * POST /keys  {secret}                                       → {ok, publicKey, privateKey}  (new VAPID key pair, base64url)
 * POST /send  {secret, vapid:{publicKey, privateKey, subject},
 *              subscriptions:[{endpoint, keys:{p256dh, auth}}], payload:{…}, ttl?} → {ok, results:[{endpoint, status}]}
 */
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ ok: true, service: "uvodja-push" });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
    if (!env.PUSH_SECRET || !(await sameSecret(String(body.secret || ""), env.PUSH_SECRET))) return json({ ok: false, error: "forbidden" }, 403);
    const path = new URL(request.url).pathname;
    try {
      if (path === "/keys") return json({ ok: true, ...(await newVapidKeys()) });
      if (path === "/send") return json({ ok: true, results: await sendAll(body) });
      return json({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) }, 500);
    }
  },
};

const enc = new TextEncoder();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

async function sameSecret(a, b) { // constant-time compare via hashes
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = await crypto.subtle.exportKey("raw", kp.publicKey), jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64u(raw), privateKey: jwk.d };
}

/* VAPID (RFC 8292): ES256-signed JWT for the push service's origin */
async function vapidAuth(endpoint, vapid) {
  const pub = unb64u(vapid.publicKey);
  if (pub.length !== 65) throw new Error("bad_vapid_public_key");
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: vapid.privateKey, ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject || "mailto:admin@example.com" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)); // raw r||s, as JWT wants
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/* Message encryption (RFC 8291, aes128gcm content coding, one record) */
export async function encryptPayload(sub, plaintext, test = {}) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const as = test.keyPair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const data = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2])); // 0x02 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, data));
  const rs = 4096, header = new Uint8Array(21);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, rs); header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

async function sendOne(sub, body, payload) {
  if (!sub || !/^https:\/\//.test(sub.endpoint || "") || !sub.keys?.p256dh || !sub.keys?.auth) return { endpoint: sub?.endpoint || "", status: 0, error: "bad_subscription" };
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuth(sub.endpoint, body.vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(Math.max(0, Math.min(Number(body.ttl) || 86400, 2419200))),
        Urgency: "normal",
      },
      body: await encryptPayload(sub, payload),
    });
    return { endpoint: sub.endpoint, status: res.status, ...(res.ok ? {} : { error: (await res.text()).slice(0, 300) }) };
  } catch (err) {
    return { endpoint: sub.endpoint, status: 0, error: String(err && err.message || err) };
  }
}
async function sendAll(body) {
  if (!body.vapid?.publicKey || !body.vapid?.privateKey) throw new Error("missing_vapid");
  const subs = Array.isArray(body.subscriptions) ? body.subscriptions.slice(0, 50) : [];
  const payload = JSON.stringify(body.payload || {});
  if (enc.encode(payload).length > 3000) throw new Error("payload_too_large");
  return Promise.all(subs.map((s) => sendOne(s, body, payload)));
}
