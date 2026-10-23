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
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
const OCENE_SHEET_ID = "1k61q_UzISMNetiDMhLwZ1hN_D6r2BgT1EaiYw3pv9uk";
const OCENE_MAILS_ID = "1vVw8vgcIjOjUmsnOIwnxBxTmD-piKkQ9-eap8kB_DDI";
const OCENE_ROLES = ["svod", "admin"];
const OCENE_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";

function handleOcene(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(body.credential || ""), { muteHttpExceptions: true });
    const tok = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
    if (!tok || tok.aud !== OCENE_CLIENT_ID || String(tok.email_verified) !== "true") return out({ ok: false, error: "prijava ni veljavna" });

    // Role from the mails sheet (name | mail | role)
    const me = String(tok.email).toLowerCase();
    const mails = SpreadsheetApp.openById(OCENE_MAILS_ID).getSheetByName("mails").getDataRange().getDisplayValues();
    const row = mails.find((r) => String(r[1]).trim().toLowerCase() === me);
    const role = row ? String(row[2]).trim().toLowerCase() : "";
    if (OCENE_ROLES.indexOf(role) < 0) return out({ ok: false, error: "ni dostopa" });

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
    return out({ ok: true, tabs: tabs });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}
