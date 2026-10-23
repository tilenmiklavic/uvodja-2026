/**
 * Analitika → candle charts of the feedback forms.
 * Reads every Google Form in Drive Preverbe/Preverbe SVODa and Preverbe/Preverbe tem directly (FormApp) and
 * returns, per form, the numeric answers per question (scale / rating / numeric choices / grid rows) —
 * numbers only, no names, e-mails or text answers. Only admin accounts (mails sheet) get an answer.
 *
 * Hook it into doPost (before the Wordle-specific code):
 *
 *   if (body.type === 'analitika') return handleAnalitika(body);
 *
 * then Deploy → Manage deployments → edit → New version. The first run asks for Forms + Drive access.
 */
const ANALITIKA_FOLDERS = { svod: "1zYju21smiRzsXZQbUBBmZbl1ANsbjE4s", teme: "1UKyJsztoCxkvEUiJxIKr6iWQ-I6ZvJFO" };
const ANALITIKA_MAILS_ID = "1vVw8vgcIjOjUmsnOIwnxBxTmD-piKkQ9-eap8kB_DDI";
const ANALITIKA_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";

function handleAnalitika(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(body.credential || ""), { muteHttpExceptions: true });
    const tok = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
    if (!tok || tok.aud !== ANALITIKA_CLIENT_ID || String(tok.email_verified) !== "true") return out({ ok: false, error: "prijava ni veljavna" });
    const me = String(tok.email).toLowerCase();
    const mails = SpreadsheetApp.openById(ANALITIKA_MAILS_ID).getSheetByName("mails").getDataRange().getDisplayValues();
    const row = mails.find((r) => String(r[1]).trim().toLowerCase() === me);
    if (!row || String(row[2]).trim().toLowerCase() !== "admin") return out({ ok: false, error: "ni dostopa" });

    const forms = [];
    Object.keys(ANALITIKA_FOLDERS).forEach((group) => {
      const it = DriveApp.getFolderById(ANALITIKA_FOLDERS[group]).getFilesByType(MimeType.GOOGLE_FORMS);
      while (it.hasNext()) {
        const file = it.next();
        forms.push(analitikaForm_(file.getId(), file.getName(), group));
      }
    });
    return out({ ok: true, forms: forms });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function analitikaForm_(id, name, group) {
  const form = FormApp.openById(id);
  const qs = {}, order = [];
  const add = (key, title, v) => {
    const n = Number(String(v).replace(",", "."));
    if (!isFinite(n) || String(v).trim() === "") return;
    if (!qs[key]) { qs[key] = { title: title, values: [] }; order.push(key); }
    qs[key].values.push(n);
  };
  const responses = form.getResponses();
  responses.forEach((r) => r.getItemResponses().forEach((ir) => {
    const item = ir.getItem(), val = ir.getResponse(), title = item.getTitle();
    if (Array.isArray(val)) { // grid: one value per row
      let rows = [];
      try { rows = item.getType() === FormApp.ItemType.GRID ? item.asGridItem().getRows() : item.asCheckboxGridItem().getRows(); } catch (e) {}
      val.forEach((v, i) => add(item.getId() + ":" + i, title + " – " + (rows[i] || i + 1), Array.isArray(v) ? v[0] : v));
    } else add(String(item.getId()), title, val);
  }));
  return { id: id, title: name, group: group, responses: responses.length, questions: order.map((k) => qs[k]) };
}
