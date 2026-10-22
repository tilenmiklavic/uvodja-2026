/**
 * Preverbe → Generalno: writes the site's "Vprašanja", "Vprašanja za IO" and "Feedback" answers
 * into the matching sheets in Drive Preverbe/Vprašanja.
 *
 * Add this file to the Apps Script project behind data/wordle_config.json scriptUrl, then call it
 * at the top of the existing doPost, right after the request body is parsed:
 *
 *   function doPost(e) {
 *     const body = JSON.parse(e.postData.contents);
 *     if (body.type === "preverba") return handlePreverba(body);
 *     ... existing wordle / visit handling ...
 *   }
 *
 * Then Deploy → Manage deployments → edit the existing deployment → Version: New version → Deploy
 * (keeps the same /exec URL, so the site needs no change).
 */
const PREVERBA_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const PREVERBA_SHEETS = {
  vprasanja: { id: "1onsfBDG_vBb_boLzcPijvKaF6kPvG9eKvP1Zx4RU5g0", label: "Vprašanje" },
  io: { id: "1AMY9UCiTdaGs-IOY5Frsfhyk18b-Q0V-yP0MQ1Ch330", label: "Vprašanje za IO" },
  feedback: { id: "1X21mphJmU9TtgUJhU2y_SqTiVIBj7QP74p732rBJ9_o", label: "Feedback" },
};

function handlePreverba(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const target = PREVERBA_SHEETS[body.kind];
    const text = String(body.text || "").trim().slice(0, 5000);
    if (!target || !text) return out({ ok: false, error: "neveljaven vnos" });

    // Only signed-in site users: verify the Google ID token the site sends
    const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(body.credential || ""), { muteHttpExceptions: true });
    const tok = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
    if (!tok || tok.aud !== PREVERBA_CLIENT_ID || String(tok.email_verified) !== "true") return out({ ok: false, error: "prijava ni veljavna" });

    const anon = body.anon === true;
    const sheet = SpreadsheetApp.openById(target.id).getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(["Čas", "Ime", "E-naslov", target.label]);
    // Prefix formula-like input so it is stored as text, not evaluated
    const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
    sheet.appendRow([new Date(), anon ? "(anonimno)" : (tok.name || body.name || ""), anon ? "" : tok.email, safe]);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}
