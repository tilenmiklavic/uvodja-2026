/**
 * Vprašanja (admin): answers to "Kaj te še zanima o tej temi?" from the tema feedback responses
 * (Drive Preverbe/Preverbe tem/"0_Vsi odgovori preverb", one tab per tema). Responses are anonymous;
 * only the timestamp and the answer text are returned, placeholder answers ("/", "-", "nič" …) are skipped.
 * Admins can tick questions as answered (action "mark"); ticks are shared and stored in the script properties.
 *
 * Needs common.gs and ocene.gs (OCENE_SHEET_ID) in the same project. Hook it into doPost:
 *
 *   if (body.type === 'vprasanja') return handleVprasanja(body);
 *
 * then Deploy → Manage deployments → edit → New version.
 */
function handleVprasanja(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const tok = siteVerify_(body.credential); // cached (common.gs)
    if (!tok) return out({ ok: false, error: "prijava ni veljavna" });
    if (siteRole_(tok.email) !== "admin") return out({ ok: false, error: "ni dostopa" });
    if (body.action === "mark") {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const done = vprasanjaDone_(), id = String(body.id || "").slice(0, 40);
        if (!id) return out({ ok: false, error: "manjka id" });
        if (body.done) done[id] = Date.now(); else delete done[id];
        PropertiesService.getScriptProperties().setProperty("vq_done", JSON.stringify(done));
        return out({ ok: true, done: done });
      } finally { lock.releaseLock(); }
    }
    return out(Object.assign({ ok: true, done: vprasanjaDone_() }, siteCached_("vprasanja", vprasanjaCompute_)));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/** Ticked ("answered") question ids → time ticked */
function vprasanjaDone_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("vq_done") || "{}"); } catch (e) { return {}; }
}

/** Per responses tab: [{ id, ts, text }] from the "zanima" column (also pre-computed by refreshSiteCaches). */
function vprasanjaCompute_() {
  const skip = /^(\/+|-+|\.+|x|ne|nič|nic|nimam|ne vem|nevem|nič posebnega|nic posebnega|zaenkrat nič|zaenkrat nic|\?+)\.?$/i;
  const tabs = SpreadsheetApp.openById(OCENE_SHEET_ID).getSheets().map((sh) => {
    const v = sh.getDataRange().getValues();
    const head = (v.shift() || []).map((h) => String(h).toLowerCase());
    const c = head.findIndex((h) => h.indexOf("zanima") >= 0);
    const items = c < 0 ? [] : v.map((r) => ({ ts: r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]) || null, text: String(r[c] || "").trim() }))
      .filter((x) => x.text && !skip.test(x.text))
      .map((x) => Object.assign({ id: siteHash_(sh.getName() + "|" + x.ts + "|" + x.text).slice(0, 16) }, x)); // stable id for ticks
    return { name: sh.getName(), items: items };
  });
  return { tabs: tabs, computedAt: Date.now() };
}
