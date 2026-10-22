/**
 * Zabava → Stavnica: Polymarket-style betting with virtual coins ("dukati").
 * Questions come from Drive 09_Arhiv/trop/wordle/stavnica, tab "questions" (question | answer | options [| result]);
 * every bet is appended to tab "bets" with the bettor's name and e-mail.
 *
 * Add this file to the same Apps Script project as preverbe.gs and hook it into doPost:
 *
 *   if (body.type === "stavnica") return handleStavnica(body);
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 *
 * Rules: everyone starts with STAVNICA_BUDGET dukatov. Odds are parimutuel – an option's % is its share
 * of the question's pool; when a question gets a value in the "result" column, betting closes and the
 * whole pool is split between the winning bets in proportion to their stakes.
 */
const STAVNICA_SHEET_ID = "1Nc9q0aSElmn7I0tIMYxGIa1yS5wdgZFFcHYCEEKN678";
const STAVNICA_BUDGET = 100;
const STAVNICA_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const STAVNICA_BET_HEADER = ["Čas", "Vprašanje", "Opcija", "Vložek", "Ime", "E-naslov"];

function handleStavnica(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(body.credential || ""), { muteHttpExceptions: true });
    const tok = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
    if (!tok || tok.aud !== STAVNICA_CLIENT_ID || String(tok.email_verified) !== "true") return out({ ok: false, error: "prijava ni veljavna" });
    const me = String(tok.email).toLowerCase();
    const ss = SpreadsheetApp.openById(STAVNICA_SHEET_ID);

    if (body.action === "bet") {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const st = stavnicaState_(ss, me);
        const q = st.questions.find((x) => x.id === body.question);
        const amount = Math.floor(Number(body.amount));
        if (!q) return out({ ok: false, error: "vprašanje ne obstaja" });
        if (q.result) return out({ ok: false, error: "stave za to vprašanje so zaprte" });
        if (q.options.indexOf(String(body.option)) < 0) return out({ ok: false, error: "neveljavna opcija" });
        if (!(amount >= 1)) return out({ ok: false, error: "vložek mora biti vsaj 1" });
        if (amount > st.me.balance) return out({ ok: false, error: "premalo dukatov (" + st.me.balance + ")" });
        const sh = ss.getSheetByName("bets");
        if (sh.getLastRow() === 0) sh.appendRow(STAVNICA_BET_HEADER);
        sh.appendRow([new Date(), q.question, String(body.option), amount, tok.name || body.name || "", me]);
        SpreadsheetApp.flush();
      } finally { lock.releaseLock(); }
    }
    return out(Object.assign({ ok: true }, stavnicaState_(ss, me)));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function stavnicaState_(ss, me) {
  const qRows = ss.getSheetByName("questions").getDataRange().getDisplayValues();
  const head = qRows.shift().map((h) => String(h).trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const questions = qRows.filter((r) => String(r[col("question")] || "").trim()).map((r) => {
    const question = String(r[col("question")]).trim();
    const raw = String(r[col("options")] || "");
    const type = String(r[col("answer")] || "").trim().toLowerCase();
    let options = raw.split(/[,\/;]/).map((s) => s.trim()).filter(String);
    if (type === "boolean" && !options.length) options = ["yes", "no"];
    const result = col("result") >= 0 ? String(r[col("result")] || "").trim() : "";
    return { id: question, question, type, options, result, pool: {}, total: 0, bettors: 0 };
  });
  const byId = {};
  questions.forEach((q) => { q.options.forEach((o) => (q.pool[o] = 0)); byId[q.id] = q; });

  const bSheet = ss.getSheetByName("bets");
  const bRows = bSheet.getLastRow() > 1 ? bSheet.getRange(2, 1, bSheet.getLastRow() - 1, 6).getValues() : [];
  const bets = bRows.map((r) => ({ ts: new Date(r[0]).getTime(), question: String(r[1]).trim(), option: String(r[2]), amount: Number(r[3]) || 0, name: String(r[4] || ""), email: String(r[5] || "").toLowerCase() }))
    .filter((b) => byId[b.question] && b.amount > 0);
  const people = {};
  bets.forEach((b) => {
    const q = byId[b.question];
    q.pool[b.option] = (q.pool[b.option] || 0) + b.amount;
    q.total += b.amount;
    (people[b.question] = people[b.question] || {})[b.email] = 1;
  });
  questions.forEach((q) => (q.bettors = Object.keys(people[q.id] || {}).length));

  // Balance: budget − all stakes + winnings from resolved questions
  let staked = 0, won = 0;
  const mine = bets.filter((b) => b.email === me).map((b) => {
    const q = byId[b.question];
    staked += b.amount;
    let payout = null;
    if (q.result) {
      const winPool = q.pool[q.result] || 0;
      payout = b.option === q.result && winPool ? Math.floor((b.amount * q.total) / winPool) : 0;
      won += payout;
    }
    return { ts: b.ts, question: b.question, option: b.option, amount: b.amount, payout: payout };
  });
  const recent = bets.slice(-25).reverse().map((b) => ({ ts: b.ts, question: b.question, option: b.option, amount: b.amount, name: b.name }));
  return { budget: STAVNICA_BUDGET, questions: questions, recent: recent, me: { balance: STAVNICA_BUDGET - staked + won, staked: staked, won: won, bets: mine.reverse() } };
}
