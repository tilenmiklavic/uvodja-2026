/**
 * Vprašanja (admin): answers to "Kaj te še zanima o tej temi?" from the tema feedback responses
 * (Drive Preverbe/Preverbe tem/"0_Vsi odgovori preverb", one tab per tema). Responses are anonymous;
 * only the timestamp and the answer text are returned, placeholder answers ("/", "-", "nič" …) are skipped.
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
    return out(Object.assign({ ok: true }, siteCached_("vprasanja", vprasanjaCompute_)));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/** Per responses tab: [{ ts, text }] from the "zanima" column (also pre-computed by refreshSiteCaches). */
function vprasanjaCompute_() {
  const skip = /^(\/+|-+|\.+|x|ne|nič|nic|nimam|ne vem|nevem|nič posebnega|nic posebnega|zaenkrat nič|zaenkrat nic|\?+)\.?$/i;
  const tabs = SpreadsheetApp.openById(OCENE_SHEET_ID).getSheets().map((sh) => {
    const v = sh.getDataRange().getValues();
    const head = (v.shift() || []).map((h) => String(h).toLowerCase());
    const c = head.findIndex((h) => h.indexOf("zanima") >= 0);
    const items = c < 0 ? [] : v.map((r) => ({ ts: r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]) || null, text: String(r[c] || "").trim() }))
      .filter((x) => x.text && !skip.test(x.text));
    return { name: sh.getName(), items: items };
  });
  return { tabs: tabs, computedAt: Date.now() };
}
