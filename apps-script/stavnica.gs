/**
 * Zabava → Stavnica: betting with virtual coins ("zlatniki").
 * Questions come from Drive 09_Arhiv/trop/wordle/stavnica, tab "questions" (question | answer | options | resolved [| image]);
 * the optional "image" column holds the question card's image: an image inserted into the cell (Insert → Image → In cell),
 * an =IMAGE("https://…") formula, or a plain https:// link.
 * every bet is appended to tab "bets" with the bettor's name and e-mail.
 *
 * Hook it into doPost (before the Wordle-specific code):
 *
 *   if (body.type === 'stavnica') return handleStavnica(body);
 *

 * Needs common.gs (shared sign-in check and caching) in the same project.
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 *
 * Admins can add or take away zlatniki (action "adjust", sheet "popravki"); players see these in "Moje stave".
 * Rules: everyone starts with STAVNICA_BUDGET zlatnikov. Fixed odds = number of options: a winning bet on a
 * yes/no question pays 2× the stake, on a 3-option question 3×, … Other people's bets don't change the odds.
 * When the "resolved" column of a question is filled in, betting on it closes and winners get their payout.
 */
const STAVNICA_SHEET_ID = "1Nc9q0aSElmn7I0tIMYxGIa1yS5wdgZFFcHYCEEKN678";
const STAVNICA_BUDGET = 10;
const STAVNICA_BET_HEADER = ["Čas", "Vprašanje", "Opcija", "Vložek", "Ime", "E-naslov"];
const STAVNICA_ADJ_SHEET = "popravki"; // admin balance adjustments (created on first use)
const STAVNICA_ADJ_HEADER = ["Čas", "E-naslov", "Ime", "Znesek", "Razlog", "Admin"];

function handleStavnica(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const tok = siteVerify_(body.credential); // cached (common.gs)
    if (!tok) return out({ ok: false, error: "prijava ni veljavna" });
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
        if (amount > st.me.balance) return out({ ok: false, error: "premalo zlatnikov (" + st.me.balance + ")" });
        const sh = ss.getSheetByName("bets");
        if (sh.getLastRow() === 0) sh.appendRow(STAVNICA_BET_HEADER);
        sh.appendRow([new Date(), q.question, String(body.option), amount, tok.name || body.name || "", me]);
        SpreadsheetApp.flush();
      } finally { lock.releaseLock(); }
    }
    if (body.action === "adjust") {
      if (siteRole_(me) !== "admin") return out({ ok: false, error: "ni dostopa" });
      const email = String(body.email || "").trim().toLowerCase(), amount = Math.trunc(Number(body.amount));
      const reason = String(body.reason || "").trim().slice(0, 200);
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return out({ ok: false, error: "neveljaven e-naslov" });
      if (!amount || Math.abs(amount) > 1000) return out({ ok: false, error: "znesek mora biti med -1000 in 1000 (ne 0)" });
      if (!reason) return out({ ok: false, error: "manjka razlog" });
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        let sh = ss.getSheetByName(STAVNICA_ADJ_SHEET);
        if (!sh) { sh = ss.insertSheet(STAVNICA_ADJ_SHEET); sh.appendRow(STAVNICA_ADJ_HEADER); }
        sh.appendRow([new Date(), email, String(body.name || "").slice(0, 100), amount, /^[=+\-@]/.test(reason) ? "'" + reason : reason, me]);
        SpreadsheetApp.flush();
      } finally { lock.releaseLock(); }
    }
    const st = stavnicaState_(ss, me, siteRole_(me) === "admin"); // admins also get the overview of all players
    return out(Object.assign({ ok: true }, st));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function stavnicaState_(ss, me, withPeople) {
  const qSheet = ss.getSheetByName("questions");
  const qRange = qSheet.getDataRange();
  const qRows = qRange.getDisplayValues();
  const head = qRows.shift().map((h) => String(h).trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  // Images: in-cell images aren't in the display values, so read the raw values/formulas of that column
  const imgCol = col("image");
  const imgRaw = imgCol >= 0 && qRows.length ? qSheet.getRange(2, imgCol + 1, qRows.length, 1).getValues() : [];
  const imgFx = imgCol >= 0 && qRows.length ? qSheet.getRange(2, imgCol + 1, qRows.length, 1).getFormulas() : [];
  const imageAt = (i) => {
    const v = imgRaw[i] && imgRaw[i][0], fx = imgFx[i] && imgFx[i][0];
    if (v && typeof v === "object" && typeof v.getContentUrl === "function") return v.getContentUrl() || v.getUrl(); // CellImage: Google-hosted copy first (the source site may block hotlinking)
    const m = /^=IMAGE\(\s*"([^"]+)"/i.exec(fx || "");
    if (m) return m[1];
    return /^https?:\/\//i.test(String(v || "").trim()) ? String(v).trim() : "";
  };
  const resCol = col("resolved") >= 0 ? col("resolved") : col("result");
  const questions = qRows.map((r, i) => ({ r: r, i: i })).filter((x) => String(x.r[col("question")] || "").trim()).map((x) => {
    const r = x.r;
    const question = String(r[col("question")]).trim();
    const type = String(r[col("answer")] || "").trim().toLowerCase();
    let options = String(r[col("options")] || "").split(/[,\/;]/).map((s) => s.trim()).filter(String);
    if (type === "boolean" && !options.length) options = ["yes", "no"];
    const result = resCol >= 0 ? String(r[resCol] || "").trim() : "";
    // match the resolved value to an option case-insensitively ("Yes" → "yes")
    const win = options.find((o) => o.toLowerCase() === result.toLowerCase()) || result;
    const image = imageAt(x.i);
    return { id: question, question: question, type: type, options: options, odds: options.length, result: win, image: image, people: {} };
  });
  const byId = {};
  questions.forEach((q) => (byId[q.id] = q));

  // When was each question resolved? The sheet has no timestamp, so remember the first time we see a value in "resolved"
  const props = PropertiesService.getScriptProperties();
  let resolvedAt = {};
  try { resolvedAt = JSON.parse(props.getProperty("sv_resolved") || "{}"); } catch (e) {}
  let changed = false;
  questions.forEach((q) => {
    if (q.result && !resolvedAt[q.id]) { resolvedAt[q.id] = Date.now(); changed = true; }
    if (!q.result && resolvedAt[q.id]) { delete resolvedAt[q.id]; changed = true; }
    q.resolvedAt = resolvedAt[q.id] || null;
  });
  if (changed) props.setProperty("sv_resolved", JSON.stringify(resolvedAt));

  const bSheet = ss.getSheetByName("bets");
  const bRows = bSheet.getLastRow() > 1 ? bSheet.getRange(2, 1, bSheet.getLastRow() - 1, 6).getValues() : [];
  const bets = bRows.map((r) => ({ ts: new Date(r[0]).getTime(), question: String(r[1]).trim(), option: String(r[2]), amount: Number(r[3]) || 0, name: String(r[4] || ""), email: String(r[5] || "").toLowerCase() }))
    .filter((b) => byId[b.question] && b.amount > 0);

  // How many different people bet on each option (shown as %, doesn't affect the fixed odds)
  const seen = {};
  bets.forEach((b) => {
    const k = b.question + "\u0000" + b.option + "\u0000" + b.email;
    if (seen[k]) return;
    seen[k] = 1;
    const q = byId[b.question];
    q.people[b.option] = (q.people[b.option] || 0) + 1;
  });

  // Admin adjustments (+/−), sheet "popravki": Čas | E-naslov | Ime | Znesek | Razlog | Admin
  const aSheet = ss.getSheetByName(STAVNICA_ADJ_SHEET);
  const adjs = aSheet && aSheet.getLastRow() > 1 ? aSheet.getRange(2, 1, aSheet.getLastRow() - 1, 6).getValues()
    .map((r) => ({ ts: new Date(r[0]).getTime(), email: String(r[1] || "").trim().toLowerCase(), name: String(r[2] || ""), amount: Math.trunc(Number(r[3])) || 0, reason: String(r[4] || "") }))
    .filter((a) => a.email && a.amount) : [];

  // Balance: budget − all stakes + payouts (stake × odds) from resolved questions + adjustments
  let staked = 0, won = 0;
  const mine = bets.filter((b) => b.email === me).map((b) => {
    const q = byId[b.question];
    staked += b.amount;
    const payout = q.result ? (b.option === q.result ? b.amount * q.odds : 0) : null;
    if (payout) won += payout;
    return { ts: b.ts, question: b.question, option: b.option, amount: b.amount, odds: q.odds, payout: payout };
  });
  const recent = bets.slice(-200).reverse().map((b) => ({ ts: b.ts, question: b.question, option: b.option, amount: b.amount, name: b.name }));
  const myAdj = adjs.filter((a) => a.email === me).map((a) => ({ ts: a.ts, amount: a.amount, reason: a.reason }));
  const adjSum = myAdj.reduce((t, a) => t + a.amount, 0);
  const state = { budget: STAVNICA_BUDGET, questions: questions, recent: recent, me: { balance: STAVNICA_BUDGET - staked + won + adjSum, staked: staked, won: won, adjusted: adjSum, bets: mine.reverse(), adjustments: myAdj.reverse() } };
  if (withPeople) {
    // Admin overview: every player's balance and all their bets (newest first)
    const byEmail = {};
    const person = (email, name) => byEmail[email] || (byEmail[email] = { email: email, name: name, staked: 0, won: 0, open: 0, adjusted: 0, bets: [], adjustments: [] });
    bets.forEach((b) => {
      const q = byId[b.question], payout = q.result ? (b.option === q.result ? b.amount * q.odds : 0) : null;
      const p = person(b.email, b.name);
      p.name = b.name || p.name;
      p.staked += b.amount;
      if (payout) p.won += payout;
      if (payout === null) p.open += b.amount;
      p.bets.push({ ts: b.ts, question: b.question, option: b.option, amount: b.amount, odds: q.odds, payout: payout });
    });
    adjs.forEach((a) => {
      const p = person(a.email, a.name);
      if (!p.name) p.name = a.name;
      p.adjusted += a.amount;
      p.adjustments.push({ ts: a.ts, amount: a.amount, reason: a.reason });
    });
    state.people = Object.keys(byEmail).map((k) => {
      const p = byEmail[k];
      p.balance = STAVNICA_BUDGET - p.staked + p.won + p.adjusted;
      p.bets.reverse();
      p.adjustments.reverse();
      return p;
    });
  }
  return state;
}
