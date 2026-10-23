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

 * Needs common.gs (shared sign-in check and caching) in the same project.
 *
 * then Deploy → Manage deployments → edit → New version. The first run asks for Forms + Drive access.
 */
const ANALITIKA_FOLDERS = { svod: "1zYju21smiRzsXZQbUBBmZbl1ANsbjE4s", teme: "1UKyJsztoCxkvEUiJxIKr6iWQ-I6ZvJFO" };

function handleAnalitika(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const tok = siteVerify_(body.credential); // cached (common.gs)
    if (!tok) return out({ ok: false, error: "prijava ni veljavna" });
    if (siteRole_(tok.email) !== "admin") return out({ ok: false, error: "ni dostopa" });
    return out(Object.assign({ ok: true }, siteCached_("analitika", analitikaCompute_)));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/** Numeric answers per form and question (also pre-computed by refreshSiteCaches in common.gs). */
function analitikaCompute_() {
  const forms = [];
  Object.keys(ANALITIKA_FOLDERS).forEach((group) => {
    const it = DriveApp.getFolderById(ANALITIKA_FOLDERS[group]).getFilesByType(MimeType.GOOGLE_FORMS);
    while (it.hasNext()) {
      const file = it.next();
      forms.push(analitikaForm_(file.getId(), file.getName(), group));
    }
  });
  return { forms: forms, computedAt: Date.now() };
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
