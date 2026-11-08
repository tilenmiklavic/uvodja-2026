/**
 * Zabava → Stavnica: betting with virtual coins ("zlatniki").
 * Questions come from Drive 09_Arhiv/trop/wordle/stavnica, tab "questions" (question | answer | options | resolved [| image]);
 * the optional "image" column holds the question card's image: an image inserted into the cell (Insert → Image → In cell),
 * an =IMAGE("https://…") formula, a plain https:// link, or a data:image/… URL (uploaded from the site).
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
 * Admins can also add a question (action "create": question, options[], expires?, image? = small JPEG/PNG/WebP
 * data: URL, resized in the browser) and resolve or reopen one
 * (action "resolve": question, result = one of its options, or "" to reopen) without editing the sheet.
 * Rules: everyone starts with STAVNICA_BUDGET zlatnikov. Fixed odds = number of options: a winning bet on a
 * yes/no question pays 2× the stake, on a 3-option question 3×, … Other people's bets don't change the odds.
 * When the "resolved" column of a question is filled in, betting on it closes and winners get their payout.
 *
 * Kazino (site tabs "🤫 1" roulette and "🤫 2" dice): action "roulette" {bets:[{k, a}]} / "dice" {bets:[{k, a}]}.
 * The result is drawn here (never in the browser), the stake is checked against the balance under the same lock as bets,
 * and every game is one row in sheet "kazino" (created on first use): Čas | E-naslov | Ime | Igra | Stave | Vložek | Izplačilo | Rezultat.
 * Balance = budget − stakes + payouts + adjustments + Σ(kazino payout − kazino stake). The reply has the new state + {casino: result};
 * every state also has casinoRecent = everybody's latest 300 games (newest first) for the site's "Vse igre" overview.
 *   Roulette (European, single 0) keys: n0…n36 (×36), red/black/even/odd/low/high (×2), d1–d3 dozens, c1–c3 columns (×3).
 *   Dice (two dice, one roll, bet on the total): t2…t12 exact total (2/12 ×31, 3/11 ×16, 4/10 ×11, 5/9 ×8, 6/8 ×7, 7 ×5),
 *   under 2–6 / over 8–12 (×2, a 7 loses both), odd / even (×2).
 *   (×N = what comes back including the stake.)
 */
const STAVNICA_SHEET_ID = "1Nc9q0aSElmn7I0tIMYxGIa1yS5wdgZFFcHYCEEKN678";
const STAVNICA_BUDGET = 10;
const STAVNICA_BET_HEADER = ["Čas", "Vprašanje", "Opcija", "Vložek", "Ime", "E-naslov"];
const STAVNICA_ADJ_SHEET = "popravki"; // admin balance adjustments (created on first use)
const STAVNICA_ADJ_HEADER = ["Čas", "E-naslov", "Ime", "Znesek", "Razlog", "Admin"];
const STAVNICA_CASINO_SHEET = "kazino";
const STAVNICA_CASINO_HEADER = ["Čas", "E-naslov", "Ime", "Igra", "Stave", "Vložek", "Izplačilo", "Rezultat"];
const CASINO_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const CASINO_MAX_STAKE = 1000;

/** Bets from the site → [{k, a}] with valid keys and whole positive amounts (same key merged), or an error text */
function casinoBets_(raw, valid) {
  const sum = {};
  [].concat(raw || []).slice(0, 60).forEach((b) => {
    const k = String(b && b.k || ""), a = Math.floor(Number(b && b.a));
    if (valid(k) && a >= 1) sum[k] = (sum[k] || 0) + a;
  });
  const bets = Object.keys(sum).map((k) => ({ k: k, a: sum[k] }));
  return bets.length ? bets : "ni veljavnih stav";
}
function casinoRoulette_(bets) {
  const n = Math.floor(Math.random() * 37), red = CASINO_RED.indexOf(n) >= 0;
  const win = (k) => {
    if (k[0] === "n") return Number(k.slice(1)) === n;
    if (!n) return false; // 0: every outside bet loses
    if (k === "red") return red; if (k === "black") return !red;
    if (k === "even") return n % 2 === 0; if (k === "odd") return n % 2 === 1;
    if (k === "low") return n <= 18; if (k === "high") return n >= 19;
    if (k[0] === "d") return Math.ceil(n / 12) === Number(k[1]);
    if (k[0] === "c") return ((n - 1) % 3) + 1 === Number(k[1]);
    return false;
  };
  const mult = (k) => (k[0] === "n" ? 36 : k[0] === "d" || k[0] === "c" ? 3 : 2);
  const out = bets.map((b) => ({ k: b.k, a: b.a, pay: win(b.k) ? b.a * mult(b.k) : 0 }));
  return { game: "ruleta", n: n, color: n ? (red ? "red" : "black") : "green", bets: out, text: n + (n ? (red ? " rdeča" : " črna") : " zelena") };
}
const CASINO_DICE_TOTAL = { 2: 31, 3: 16, 4: 11, 5: 8, 6: 7, 7: 5, 8: 7, 9: 8, 10: 11, 11: 16, 12: 31 };
function casinoDice_(bets) {
  const r = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)], t = r[0] + r[1];
  const pay = (b) => {
    if (b.k[0] === "t") return Number(b.k.slice(1)) === t ? b.a * CASINO_DICE_TOTAL[t] : 0;
    if (b.k === "under") return t < 7 ? b.a * 2 : 0;
    if (b.k === "over") return t > 7 ? b.a * 2 : 0;
    if (b.k === "odd") return t % 2 === 1 ? b.a * 2 : 0;
    if (b.k === "even") return t % 2 === 0 ? b.a * 2 : 0;
    return 0;
  };
  const out = bets.map((b) => ({ k: b.k, a: b.a, pay: pay(b) }));
  return { game: "kocke", rolls: [r], total: t, bets: out, text: r[0] + "+" + r[1] + " = " + t };
}
/** Play one roulette spin / dice round for `me` (caller holds the lock and checks nothing else) */
function casinoPlay_(ss, me, name, body) {
  const roulette = body.action === "roulette";
  const valid = roulette ? (k) => /^n([0-9]|[12][0-9]|3[0-6])$/.test(k) || /^(red|black|even|odd|low|high|d[123]|c[123])$/.test(k)
    : (k) => /^(t([2-9]|1[0-2])|under|over|odd|even)$/.test(k);
  const bets = casinoBets_(body.bets, valid);
  if (typeof bets === "string") return bets;
  const stake = bets.reduce((t, b) => t + b.a, 0);
  if (stake > CASINO_MAX_STAKE) return "največji vložek je " + CASINO_MAX_STAKE;
  const st = stavnicaState_(ss, me);
  if (stake > st.me.balance) return "premalo zlatnikov (" + st.me.balance + ")";
  const res = roulette ? casinoRoulette_(bets) : casinoDice_(bets);
  res.stake = stake; res.payout = res.bets.reduce((t, b) => t + b.pay, 0);
  let sh = ss.getSheetByName(STAVNICA_CASINO_SHEET);
  if (!sh) { sh = ss.insertSheet(STAVNICA_CASINO_SHEET); sh.appendRow(STAVNICA_CASINO_HEADER); sh.setFrozenRows(1); }
  sh.appendRow([new Date(), me, name, res.game, bets.map((b) => b.k + ":" + b.a).join(" "), stake, res.payout, res.text]);
  SpreadsheetApp.flush();
  return res;
}

function handleStavnica(body) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const tok = siteVerify_(body.credential); // cached (common.gs)
    if (!tok) return out({ ok: false, error: "prijava ni veljavna" });
    const me = String(tok.email).toLowerCase();
    const ss = SpreadsheetApp.openById(STAVNICA_SHEET_ID);
    let casino = null;

    if (body.action === "roulette" || body.action === "dice") {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        casino = casinoPlay_(ss, me, String(tok.name || body.name || "").slice(0, 100), body);
        if (typeof casino === "string") return out({ ok: false, error: casino });
      } finally { lock.releaseLock(); }
    }

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
      const opt = { yes: "Da", no: "Ne" }[String(body.option).toLowerCase()] || String(body.option);
      pushNotify_("stavnica", { title: "Stavnica 🎲", body: (tok.name || body.name || me) + ": " + Math.floor(Number(body.amount)) + " 🪙 na »" + opt + "« – " + body.question,
        url: "./#zabava/stavnica/pregled" }, me); // push.gs: admins' devices, not the bettor's own
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
    if (body.action === "create" || body.action === "resolve") {
      if (siteRole_(me) !== "admin") return out({ ok: false, error: "ni dostopa" });
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const err = body.action === "create" ? stavnicaCreate_(ss, body) : stavnicaResolve_(ss, body);
        if (err) return out({ ok: false, error: err });
        SpreadsheetApp.flush();
      } finally { lock.releaseLock(); }
    }
    const st = stavnicaState_(ss, me, siteRole_(me) === "admin"); // admins also get the overview of all players
    return out(Object.assign({ ok: true }, st, casino ? { casino: casino } : {}));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Google Sheets in-cell images are served with "Cross-Origin-Resource-Policy: same-site", so browsers refuse to show
 * them on the site. Fetch a small copy here instead and send it inline as a data: URL (cached 6 h per image).
 */
function stavnicaImage_(url) {
  if (!/^https:\/\/docs\.google\.com\/sheets-images-rt\//.test(url || "")) return url || "";
  const cache = CacheService.getScriptCache(), key = "img:" + siteHash_(url).slice(0, 32);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = UrlFetchApp.fetch(url.replace(/=s\d+(?=\?|$)/, "=s160"), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return "";
    const blob = res.getBlob(), data = "data:" + (blob.getContentType() || "image/jpeg") + ";base64," + Utilities.base64Encode(blob.getBytes());
    if (data.length < 95000) cache.put(key, data, 21600);
    return data;
  } catch (e) { return ""; }
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
    return /^(https?:\/\/|data:image\/)/i.test(String(v || "").trim()) ? String(v).trim() : "";
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
    const image = stavnicaImage_(imageAt(x.i));
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

  // Kazino games, sheet "kazino": Čas | E-naslov | Ime | Igra | Stave | Vložek | Izplačilo | Rezultat
  const cSheet = ss.getSheetByName(STAVNICA_CASINO_SHEET);
  const games = cSheet && cSheet.getLastRow() > 1 ? cSheet.getRange(2, 1, cSheet.getLastRow() - 1, 8).getValues()
    .map((r) => ({ ts: new Date(r[0]).getTime(), email: String(r[1] || "").trim().toLowerCase(), name: String(r[2] || ""), game: String(r[3] || ""), bets: String(r[4] || ""), stake: Number(r[5]) || 0, payout: Number(r[6]) || 0, result: String(r[7] || "") }))
    .filter((g) => g.email) : [];
  const myGames = games.filter((g) => g.email === me);
  const casinoNet = myGames.reduce((t, g) => t + g.payout - g.stake, 0);

  // Balance: budget − all stakes + payouts (stake × odds) from resolved questions + adjustments + kazino
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
  const casinoMe = { net: casinoNet, staked: myGames.reduce((t, g) => t + g.stake, 0), paid: myGames.reduce((t, g) => t + g.payout, 0), count: myGames.length,
    games: myGames.slice(-30).reverse().map((g) => ({ ts: g.ts, game: g.game, bets: g.bets, stake: g.stake, payout: g.payout, result: g.result })) };
  // Everybody's latest kazino games (site: Piratski kazino → Vse igre)
  const casinoRecent = games.slice(-300).reverse().map((g) => ({ ts: g.ts, email: g.email, name: g.name, game: g.game, bets: g.bets, stake: g.stake, payout: g.payout, result: g.result }));
  const state = { budget: STAVNICA_BUDGET, questions: questions, recent: recent, casinoRecent: casinoRecent, me: { balance: STAVNICA_BUDGET - staked + won + adjSum + casinoNet, staked: staked, won: won, adjusted: adjSum, casino: casinoMe, bets: mine.reverse(), adjustments: myAdj.reverse() } };
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
    games.forEach((g) => {
      const p = person(g.email, g.name);
      if (!p.name) p.name = g.name;
      p.casino = (p.casino || 0) + g.payout - g.stake;
      p.casinoGames = (p.casinoGames || 0) + 1;
    });
    state.people = Object.keys(byEmail).map((k) => {
      const p = byEmail[k];
      p.balance = STAVNICA_BUDGET - p.staked + p.won + p.adjusted + (p.casino || 0);
      p.bets.reverse();
      p.adjustments.reverse();
      return p;
    });
  }
  return state;
}

/* —— Admin: new questions and results from the site (sheet "questions": question | answer | options | expires | image | resolved) —— */
const stavnicaText_ = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v); // keep Sheets from reading text as a formula
function stavnicaHead_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map((h) => String(h).trim().toLowerCase());
}
/** Error text, or "" when the question was added. */
function stavnicaCreate_(ss, body) {
  const sh = ss.getSheetByName("questions"), head = stavnicaHead_(sh);
  const question = String(body.question || "").replace(/\s+/g, " ").trim();
  if (question.length < 3 || question.length > 300) return "vprašanje mora imeti 3–300 znakov";
  let options = (Array.isArray(body.options) ? body.options : String(body.options || "").split(/[,\/;]/)).map((o) => String(o).trim()).filter(String);
  if (options.some((o) => /[,\/;]/.test(o) || o.length > 60)) return "možnost ne sme vsebovati , / ; in ima največ 60 znakov";
  if (options.length < 2 || options.length > 8) return "potrebni sta 2–8 možnosti";
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return "možnosti se ponavljajo";
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, head.indexOf("question") + 1, sh.getLastRow() - 1, 1).getDisplayValues() : [];
  if (existing.some((r) => String(r[0]).trim().toLowerCase() === question.toLowerCase())) return "to vprašanje že obstaja";
  const low = options.map((o) => o.toLowerCase());
  const isBool = low.length === 2 && ["yes", "da"].indexOf(low[0]) >= 0 && ["no", "ne"].indexOf(low[1]) >= 0;
  if (isBool) options = ["yes", "no"];
  const type = isBool ? "boolean" : options.every((o) => /^-?\d+([.,]\d+)?$/.test(o)) ? "number" : "choice";
  const row = head.map(() => "");
  const set = (name, v) => { const c = head.indexOf(name); if (c >= 0) row[c] = v; };
  set("question", stavnicaText_(question));
  set("answer", type);
  set("options", stavnicaText_(options.join("/")));
  set("expires", stavnicaText_(String(body.expires || "").trim().slice(0, 20)));
  const image = String(body.image || "");
  if (image) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(image)) return "slika ni v pravi obliki";
    if (image.length > 48000) return "slika je prevelika";
    if (head.indexOf("image") < 0) return "v listu manjka stolpec image";
    set("image", image);
  }
  sh.appendRow(row);
  return "";
}
/** Error text, or "" when the result was written (empty result = reopened). */
function stavnicaResolve_(ss, body) {
  const sh = ss.getSheetByName("questions"), head = stavnicaHead_(sh);
  const qCol = head.indexOf("question"), oCol = head.indexOf("options"), aCol = head.indexOf("answer");
  const rCol = head.indexOf("resolved") >= 0 ? head.indexOf("resolved") : head.indexOf("result");
  if (qCol < 0 || rCol < 0) return "v listu manjka stolpec question ali resolved";
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getDisplayValues() : [];
  const id = String(body.question || "").trim();
  const i = rows.findIndex((r) => String(r[qCol]).trim() === id);
  if (i < 0) return "vprašanje ne obstaja";
  const result = String(body.result || "").trim();
  if (result) {
    let options = String(rows[i][oCol] || "").split(/[,\/;]/).map((o) => o.trim()).filter(String);
    if (String(rows[i][aCol] || "").trim().toLowerCase() === "boolean" && !options.length) options = ["yes", "no"];
    const win = options.find((o) => o.toLowerCase() === result.toLowerCase());
    if (!win) return "rezultat mora biti ena od možnosti";
    sh.getRange(i + 2, rCol + 1).setValue(stavnicaText_(win));
  } else {
    sh.getRange(i + 2, rCol + 1).setValue("");
  }
  return "";
}
