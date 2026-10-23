/**
 * Ekipa → "Lestvica ocen tem": grade statistics from the tema feedback responses.
 * Reads Drive Preverbe/Preverbe tem/"0_Vsi odgovori preverb" (one tab per tema, column "Oceni temo:" with 1–5)
 * and returns per tab only the count, sum, average and distribution — never the comments.
 * Only SVOD / admin accounts (Drive 09_Arhiv/trop/mails, tab "mails") get an answer.
 *
 * Hook it into doPost (before the Wordle-specific code):
 *
 *   if (body.type === 'ocene') return handleOcene(body);
 *

 * Needs common.gs (shared sign-in check and caching) in the same project.
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
const OCENE_SHEET_ID = "1k61q_UzISMNetiDMhLwZ1hN_D6r2BgT1EaiYw3pv9uk";
const OCENE_ROLES = ["svod", "admin"];

function handleOcene(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const tok = siteVerify_(body.credential); // cached (common.gs)
    if (!tok) return out({ ok: false, error: "prijava ni veljavna" });
    if (OCENE_ROLES.indexOf(siteRole_(tok.email)) < 0) return out({ ok: false, error: "ni dostopa" });
    return out(Object.assign({ ok: true }, siteCached_("ocene", oceneCompute_)));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/** Grade stats per responses tab (also pre-computed by refreshSiteCaches in common.gs). */
function oceneCompute_() {
  const tabs = SpreadsheetApp.openById(OCENE_SHEET_ID).getSheets().map((sh) => {
    const v = sh.getDataRange().getValues();
    const head = (v.shift() || []).map((h) => String(h).toLowerCase());
    let c = head.findIndex((h) => h.indexOf("ocen") >= 0);
    if (c < 0) c = 1;
    const grades = v.map((r) => Number(r[c])).filter((n) => n >= 1 && n <= 5);
    const dist = [0, 0, 0, 0, 0];
    grades.forEach((g) => dist[Math.round(g) - 1]++);
    const sum = grades.reduce((a, b) => a + b, 0);
    return { name: sh.getName(), n: grades.length, sum: sum, avg: grades.length ? sum / grades.length : null, dist: dist };
  });
  return { tabs: tabs, computedAt: Date.now() };
}
