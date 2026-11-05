/**
 * Push notifications for admins (PWA Web Push), e.g. "someone finished today's Wordle" or "new bet in Stavnica".
 * The browser subscribes on the site (menu → 🔔 Obvestila, admins only); subscriptions are kept in Script properties
 * (PUSH_SUBS). Sending goes through the Cloudflare Worker in push-worker/worker.js, because Apps Script can't do the
 * Web Push cryptography itself.
 *
 * One-time setup:
 *   1. Deploy push-worker/worker.js as a Cloudflare Worker and give it a secret PUSH_SECRET (a long random string).
 *   2. Here: Project Settings → Script properties → add
 *        PUSH_WORKER_URL = https://<name>.<account>.workers.dev
 *        PUSH_SECRET     = the same random string as in Cloudflare
 *      optional: PUSH_EVENTS = wordle,stavnica  (comma-separated events that notify; "" = none; default both)
 *   3. Select pushSetup → ▶ Run (creates the VAPID key pair via the Worker and stores it here; grants UrlFetch access).
 *   4. Deploy → Manage deployments → edit → New version.
 *   5. On the site (signed in as admin): menu → 🔔 Obvestila → Vklopi. A test notification arrives right away.
 *
 * doPost {type:'push', action:'key'} → {ok, publicKey}
 *        {type:'push', action:'subscribe', credential, subscription:{endpoint, keys:{p256dh, auth}}, device?, silent?} → {ok, test}
 *          (sends a test notification unless silent – the site re-registers silently once per visit)
 *        {type:'push', action:'unsubscribe', credential, endpoint} → {ok}
 * Other handlers call pushNotify_(event, payload, actorEmail): sends to every admin device except the actor's own.
 * Handy from the editor: pushTest (test notification to all devices), pushList (log devices), pushSetup.
 */
const PUSH_DEFAULT_EVENTS = "wordle,stavnica";
const PUSH_MAX_SUBS = 30;

function pushProps_() { return PropertiesService.getScriptProperties(); }
function pushSubs_() { try { return JSON.parse(pushProps_().getProperty("PUSH_SUBS") || "[]"); } catch (e) { return []; } }
function pushSaveSubs_(subs) { pushProps_().setProperty("PUSH_SUBS", JSON.stringify(subs.slice(-PUSH_MAX_SUBS))); }
function pushIsAdmin_(email) {
  email = String(email || "").toLowerCase();
  return (typeof STATS_ADMINS !== "undefined" && STATS_ADMINS.indexOf(email) >= 0) || siteRole_(email) === "admin";
}

function handlePush(body) {
  try {
    const props = pushProps_();
    if (body.action === "key") {
      const key = props.getProperty("PUSH_VAPID_PUBLIC");
      return json_(key ? { ok: true, publicKey: key } : { ok: false, error: "push_not_configured" });
    }
    const who = tokenInfo_(body.credential); // like visit stats: admins' gmail addresses count too
    if (!pushIsAdmin_(who.email)) return json_({ ok: false, error: "ni dostopa" });

    if (body.action === "subscribe") {
      const s = body.subscription || {}, keys = s.keys || {};
      if (!/^https:\/\/[^\s]{10,1000}$/.test(String(s.endpoint || "")) || !/^[\w-]{80,100}$/.test(String(keys.p256dh || "")) || !/^[\w-]{16,30}$/.test(String(keys.auth || "")))
        return json_({ ok: false, error: "bad_subscription" });
      const sub = { endpoint: String(s.endpoint), keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
        email: who.email, device: String(body.device || "").slice(0, 80), ts: Date.now() };
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try { pushSaveSubs_(pushSubs_().filter((x) => x.endpoint !== sub.endpoint).concat([sub])); } finally { lock.releaseLock(); }
      if (body.silent) return json_({ ok: true });
      const res = pushSend_([sub], { title: "Obvestila so vklopljena ✅", body: "Tako bo videti obvestilo, ko kdo igra Wordle ali stavi v Stavnici.", url: "./#zabava", tag: "push-test" });
      const r = res && res[0];
      return json_({ ok: true, test: r ? r.status : null, testError: r && r.error ? String(r.error).slice(0, 200) : undefined });
    }
    if (body.action === "unsubscribe") {
      const ep = String(body.endpoint || "");
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try { pushSaveSubs_(pushSubs_().filter((x) => x.endpoint !== ep)); } finally { lock.releaseLock(); }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: "bad_action" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Notify every admin device (except the actor's own) about an event; never throws, so the caller's request still succeeds. */
function pushNotify_(event, payload, actorEmail) {
  try {
    const prop = pushProps_().getProperty("PUSH_EVENTS");
    const on = (prop === null ? PUSH_DEFAULT_EVENTS : prop).split(",").map((s) => s.trim()).filter(String);
    if (on.indexOf(event) < 0) return;
    const actor = String(actorEmail || "").toLowerCase();
    const subs = pushSubs_().filter((s) => s.email !== actor);
    if (subs.length) pushSend_(subs, payload);
  } catch (err) {
    console.error("pushNotify_ " + event + ": " + (err && err.message || err));
  }
}

/** Hand the message to the Worker; devices the push service reports as gone (404/410) are removed. */
function pushSend_(subs, payload) {
  const props = pushProps_();
  const url = String(props.getProperty("PUSH_WORKER_URL") || "").replace(/\/+$/, ""), secret = props.getProperty("PUSH_SECRET");
  const pub = props.getProperty("PUSH_VAPID_PUBLIC"), priv = props.getProperty("PUSH_VAPID_PRIVATE");
  if (!url || !secret || !pub || !priv) return null;
  const res = UrlFetchApp.fetch(url + "/send", { method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ secret: secret, vapid: { publicKey: pub, privateKey: priv, subject: "mailto:" + Session.getEffectiveUser().getEmail() },
      subscriptions: subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })), payload: payload }) });
  let out;
  try { out = JSON.parse(res.getContentText()); } catch (e) { out = null; }
  if (!out || !out.ok) { console.error("push worker: HTTP " + res.getResponseCode() + " " + res.getContentText().slice(0, 300)); return null; }
  const gone = out.results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint);
  if (gone.length) pushSaveSubs_(pushSubs_().filter((s) => gone.indexOf(s.endpoint) < 0));
  return out.results;
}

/** Run once from the editor (after setting PUSH_WORKER_URL and PUSH_SECRET): creates and stores the VAPID key pair. */
function pushSetup() {
  const props = pushProps_();
  if (props.getProperty("PUSH_VAPID_PUBLIC")) { Logger.log("Ključi že obstajajo – nič ni spremenjeno. (Za nove ključe najprej izbriši PUSH_VAPID_PUBLIC in PUSH_VAPID_PRIVATE; vse naprave se morajo nato znova prijaviti.)"); return; }
  const url = String(props.getProperty("PUSH_WORKER_URL") || "").replace(/\/+$/, ""), secret = props.getProperty("PUSH_SECRET");
  if (!url || !secret) throw new Error("Najprej nastavi PUSH_WORKER_URL in PUSH_SECRET v Script properties.");
  const res = UrlFetchApp.fetch(url + "/keys", { method: "post", contentType: "application/json", payload: JSON.stringify({ secret: secret }), muteHttpExceptions: true });
  const out = JSON.parse(res.getContentText());
  if (!out.ok) throw new Error("Worker: " + (out.error || res.getResponseCode()));
  props.setProperties({ PUSH_VAPID_PUBLIC: out.publicKey, PUSH_VAPID_PRIVATE: out.privateKey });
  Logger.log("OK – ključi shranjeni. Javni ključ: " + out.publicKey);
}
/** Test notification to every subscribed device. */
function pushTest() {
  const subs = pushSubs_();
  Logger.log(subs.length + " naprav");
  Logger.log(JSON.stringify(pushSend_(subs, { title: "Test 🔔", body: "Testno obvestilo iz Apps Scripta.", url: "./", tag: "push-test" })));
}
function pushList() {
  pushSubs_().forEach((s) => Logger.log(s.email + " · " + s.device + " · " + new Date(s.ts) + " · " + s.endpoint.slice(0, 60) + "…"));
}
