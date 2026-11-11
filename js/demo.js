/* U Vodja 2026 – DEMO MODE
 *
 * Turn on:   https://vodja.miklavic.si/?demo         (kept for the browser tab; ?demo=0 turns it off)
 *            ?demo=2026-10-24T14:00                  pins "now" to another moment (Europe/Ljubljana, default below)
 * Also on for any host that starts with "demo." (e.g. demo.vodja.miklavic.si), without the query.
 *
 * What it does – nothing is sent to Google or to the real Apps Script, and nothing is stored in the real localStorage:
 *   • signs in a fake admin ("Demo Admin"; the account menu still lets you view the site as SVOD or UU)
 *   • turns the "event is over" lockdown off, so every page and game is back
 *   • pins the clock to a moment in the middle of the event, so the timeline has a "now" line, today's Wordle, etc.
 *   • answers every request to the Apps Script backend (Wordle/Papiga/Bumbar/Rutke results, Stavnica + kazino + shop,
 *     Zadolžitve, page switches, Analitika, ocene, vprašanja, visits …) with generated, made-up data (fictional people)
 *   • picks / bets / purchases work, but only in memory (a reload resets them)
 * The static content (timeline, teme, ekipa, …) is the real data/*.json.
 *
 * Loaded from index.html before everything else; does nothing when the demo is off.
 */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var on = false;
  try {
    if (params.has("demo")) {
      if (params.get("demo") === "0") sessionStorage.removeItem("uvodja.demo");
      else sessionStorage.setItem("uvodja.demo", params.get("demo") || "1");
    }
    on = !!sessionStorage.getItem("uvodja.demo");
  } catch (e) { on = params.has("demo") && params.get("demo") !== "0"; }
  if (/^demo\./.test(location.hostname)) on = true;
  if (!on) return;

  var DEFAULT_NOW = "2026-11-07T10:15"; // Saturday of the 2nd weekend, 10:15 (Europe/Ljubljana)
  var raw = ""; try { raw = sessionStorage.getItem("uvodja.demo") || ""; } catch (e) {}
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) raw = params.get("demo") && /^\d{4}-\d{2}-\d{2}/.test(params.get("demo")) ? params.get("demo") : DEFAULT_NOW;

  window.UVODJA_DEMO = true;
  document.documentElement.classList.add("is-demo");

  /* ───────────────────────── clock ───────────────────────── */
  // Europe/Ljubljana: UTC+2 (CEST) from the last Sunday of March to the last Sunday of October (01:00 UTC), else UTC+1
  function ljOffsetMin(iso) {
    var t = Date.parse(iso + "Z");
    var y = new Date(t).getUTCFullYear();
    var lastSun = function (m) { var d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1); };
    return t >= lastSun(2) && t < lastSun(9) ? 120 : 60;
  }
  var wall = raw.length === 10 ? raw + "T10:15" : raw.slice(0, 16);
  var pinned = Date.parse(wall + ":00Z") - ljOffsetMin(wall + ":00") * 60000;
  var RealDate = Date, started = RealDate.now();
  var nowMs = function () { return pinned + (RealDate.now() - started); };
  function DemoDate() {
    if (!(this instanceof DemoDate)) return new RealDate(nowMs()).toString();
    var a = arguments;
    return new (Function.prototype.bind.apply(RealDate, [null].concat(a.length ? [].slice.call(a) : [nowMs()])))();
  }
  DemoDate.prototype = RealDate.prototype;
  DemoDate.now = nowMs; DemoDate.parse = RealDate.parse; DemoDate.UTC = RealDate.UTC;
  window.Date = DemoDate;
  var TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit" }).format(new RealDate(nowMs()));

  /* ───────────────── isolated storage (the real site's localStorage stays untouched) ───────────────── */
  var DEMO_USER = { email: "demo.admin@vodja.miklavic.si", name: "Demo Admin", picture: "" };
  var mem = {};
  var store = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; },
    key: function (i) { return Object.keys(mem)[i] || null; },
    get length() { return Object.keys(mem).length; },
  };
  try { Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return store; } }); } catch (e) {}
  var SESSION_EXP = nowMs() + 60 * 864e5;
  store.setItem("uvodja.user", JSON.stringify({
    email: DEMO_USER.email, name: DEMO_USER.name, picture: "", sub: "demo", credential: "demo.credential",
    credExp: nowMs() + 365 * 864e5, session: "demo.session", sessionExp: SESSION_EXP,
  }));

  /* ───────────────────────── seeded random ───────────────────────── */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var R = rng(20261107);
  var pick = function (a) { return a[Math.floor(R() * a.length)]; };
  var int = function (a, b) { return a + Math.floor(R() * (b - a + 1)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ───────────────────────── fictional people ───────────────────────── */
  var FIRST = ["Aljaž", "Ana", "Blaž", "Bogdan", "Brina", "Cene", "Dan", "Dora", "Eva", "Filip", "Gaja", "Gregor", "Hana", "Igor", "Ines", "Jan", "Jera", "Kaja", "Klemen", "Lara", "Luka", "Maša", "Miha", "Nika", "Nejc", "Pia", "Rok", "Sara", "Tadej", "Urška", "Vid", "Zala"];
  var LAST = ["Arnež", "Bizjak", "Cerar", "Debevec", "Eržen", "Fister", "Gorenc", "Hribar", "Ivanc", "Jazbec", "Kastelic", "Lavrič", "Mlakar", "Novak", "Osolnik", "Perko", "Rozman", "Slapnik", "Tomšič", "Urbanc", "Vidmar", "Zupan", "Žagar"];
  var norm = function (s) { return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var PLAYERS = [];
  (function () {
    var used = {};
    while (PLAYERS.length < 30) {
      var n = pick(FIRST) + " " + pick(LAST);
      if (used[n]) continue; used[n] = 1;
      // a "strength" so the same people are good at everything, like in real life
      PLAYERS.push({ name: n, email: norm(n).replace(/\s+/g, ".") + "@demo.example", skill: R(), activity: 0.35 + R() * 0.65 });
    }
  })();
  PLAYERS.unshift({ name: DEMO_USER.name, email: DEMO_USER.email, skill: 0.6, activity: 0.9 });
  var ME = DEMO_USER.email;

  /* ───────────────────────── helpers ───────────────────────── */
  var dayMs = 864e5;
  var isoPlus = function (iso, n) { return new RealDate(RealDate.parse(iso + "T12:00:00Z") + n * dayMs).toISOString().slice(0, 10); };
  var datesBetween = function (a, b) { var o = []; for (var d = a; d <= b; d = isoPlus(d, 1)) o.push(d); return o; };
  var ok = function (o) { return Object.assign({ ok: true }, o || {}); };
  var ls = function (iso) { return RealDate.parse(iso + "T12:00:00Z"); };
  var jsonRes = function (o) { return new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }); };

  var staticCache = {};
  var realFetch = window.fetch.bind(window);
  function getStatic(path) {
    return staticCache[path] || (staticCache[path] = realFetch(path, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
  }

  /* ───────────────────────── generated results ───────────────────────── */
  var API = "https://demo.vodja.invalid/exec";

  // Wordle: every puzzle day up to "today", most players play most days
  function genWordle() {
    return getStatic("data/wordle.json").then(function (wd) {
      var rows = [], dates = ((wd && wd.puzzles) || []).map(function (p) { return p.date; }).filter(function (d) { return d <= TODAY; });
      dates.forEach(function (date) {
        PLAYERS.forEach(function (p) {
          if (p.email === ME && date === TODAY) return; // the viewer plays today's puzzle themselves
          if (R() > p.activity * 0.8) return;
          var solved = R() < 0.55 + p.skill * 0.42;
          var guesses = solved ? clamp(Math.round(5.2 - p.skill * 2 + (R() - 0.5) * 2.2), 1, 6) : 6;
          rows.push({ email: p.email, name: p.name, date: date, guesses: guesses, solved: solved, ms: Math.round((40 + R() * 170 + guesses * 22) * 1000) });
        });
      });
      return rows;
    });
  }
  function genPapiga() {
    var rows = [], dates = datesBetween("2026-11-02", TODAY > "2026-11-08" ? "2026-11-08" : TODAY);
    dates.forEach(function (date) {
      PLAYERS.forEach(function (p) {
        if (p.email === ME && date === TODAY) return;
        if (R() > p.activity * 0.75) return;
        var found = R() < 0.5 + p.skill * 0.45;
        rows.push({ email: p.email, name: p.name, date: date, found: found, ms: found ? Math.round((5 + R() * 90 * (1.3 - p.skill)) * 1000) : null, misses: int(0, found ? 4 : 9) });
      });
    });
    return rows;
  }
  function genBumbar() {
    var rows = [], dates = datesBetween("2026-11-05", TODAY > "2026-11-08" ? "2026-11-08" : TODAY);
    dates.forEach(function (date) {
      PLAYERS.forEach(function (p) {
        if (p.email === ME && date === TODAY) return;
        if (R() > p.activity * 0.7) return;
        var attempts = R() < 0.25 ? 2 : 1;
        for (var a = 1; a <= attempts; a++) {
          var rounds = [0, 0, 0].map(function () { return Math.round(clamp(260 + (1 - p.skill) * 260 + (R() - 0.5) * 140, 150, 800)); });
          var early = R() < 0.18 ? 1 : 0;
          rows.push({ email: p.email, name: p.name, date: date, rounds: rounds, early: early, total: rounds[0] + rounds[1] + rounds[2] + early * 500, attempt: a });
        }
      });
    });
    return rows;
  }
  var rutkeVotes = null;
  function genRutke() {
    return getStatic("data/rutke.json").then(function (d) {
      if (!rutkeVotes) {
        var names = ((d && d.scarves) || []).map(function (s) { return s.steg; });
        var strength = {}; names.forEach(function (n) { strength[n] = R(); });
        var stegs = {}, votes = 0;
        names.forEach(function (n) { stegs[n] = [0, 0]; });
        for (var i = 0; i < names.length * 14 && names.length > 1; i++) {
          var a = pick(names), b = pick(names); if (a === b) continue;
          var aWins = R() < 0.5 + (strength[a] - strength[b]) * 0.8;
          stegs[aWins ? a : b][0]++; stegs[aWins ? b : a][1]++; votes++;
        }
        rutkeVotes = { stegs: stegs, votes: votes, voters: 24, ownSkipped: 17 };
      }
      return ok(rutkeVotes);
    });
  }

  // Zadolžitve (chores) – picks are kept in memory
  var CHORES = [["Kuhinja + shramba", 5], ["Spodnji WC", 3], ["Hodniki (spodaj in zgoraj)", 3], ["Skupni prostor in oba tabuja", 3], ["Prostor za spanje zgodaj", 3], ["Zgornji WC", 3], ["Smeti", 2], ["Zunanjost/okolica in ognjišče", 3], ["Nosači opreme v avto", 3]];
  var choreBy = {};
  (function () { CHORES.forEach(function (c, i) { choreBy[c[0]] = []; }); var k = 0; PLAYERS.slice(1, 20).forEach(function (p) { var c = CHORES[k % CHORES.length]; if (choreBy[c[0]].length < c[1] - (c[1] > 2 ? 1 : 0)) choreBy[c[0]].push({ email: p.email, name: p.name }); k++; }); })();
  function choreState(extra) {
    return Object.assign({ ok: true, date: TODAY, chores: CHORES.map(function (c) { return { name: c[0], cap: c[1], people: choreBy[c[0]] }; }) }, extra || {});
  }
  function choreAction(b) {
    var name = String(b.chore || "");
    CHORES.forEach(function (c) { choreBy[c[0]] = choreBy[c[0]].filter(function (p) { return p.email !== ME; }); });
    if (b.action === "pick") {
      var c = CHORES.filter(function (x) { return x[0] === name; })[0];
      if (!c) return { ok: false, error: "neznana zadolžitev" };
      if (choreBy[name].length >= c[1]) return choreState({ ok: false, error: "polno" });
      choreBy[name].push({ email: ME, name: DEMO_USER.name });
    }
    return choreState();
  }

  // Page switches: everything on
  var FLAGS = { opravila: true, trgovina: true, temu: true };

  /* ───────── Preverbe / ocene / vprašanja / analitika ───────── */
  function genOcene() {
    return getStatic("data/preverbe.json").then(function (pv) {
      var tabs = [], seen = {}, add = function (name) {
        if (!name || seen[name]) return; seen[name] = 1;
        var base = 3.4 + R() * 1.4, dist = [0, 0, 0, 0, 0], n = int(14, 26), sum = 0;
        for (var i = 0; i < n; i++) { var g = clamp(Math.round(base + (R() - 0.5) * 2.4), 1, 5); dist[g - 1]++; sum += g; }
        tabs.push({ name: name, n: n, sum: sum, avg: sum / n, dist: dist });
      };
      ((pv && pv.temaForms) || []).forEach(function (f, i) {
        if (f.split) f.split.forEach(function (x) { add(x.responsesTab); });
        else add(f.responsesTab || String(i + 1));
      });
      return { tabs: tabs, computedAt: nowMs() };
    });
  }
  var QUESTIONS = [
    "Kako se pripravimo na zahtevno pogovorno srečanje z voditeljem, ki se je izgubil v svoji vlogi?", "Ali bo na voljo posnetek predavanja o odnosih z javnostmi?",
    "Kdaj bomo dobili izročke prve delavnice?", "Kako ravnati, ko se dva člana stega ne razumeta in se konflikt prenese na vse?", "Bi lahko imeli več časa za delo v skupinah?",
    "Kako v praksi uvesti sistem spremljanja voditeljev v majhnem stegu?", "Kje najdem primere dobrih letnih načrtov?", "Ali je mogoče dobiti potrdilo o udeležbi za delodajalca?",
    "Kaj storiti, če se voditelji ne odzivajo na sporočila?", "Zanima me, kako zagotoviti sredstva za večji projekt brez sponzorjev.", "Kako velika naj bo ekipa za organizacijo regijskega srečanja?",
  ];
  function genVprasanja() {
    return getStatic("data/preverbe.json").then(function (pv) {
      var names = []; ((pv && pv.temaForms) || []).forEach(function (f, i) { if (f.split) f.split.forEach(function (x) { names.push(x.responsesTab); }); else names.push(f.responsesTab || String(i + 1)); });
      var qi = 0, done = {}, tabs = names.slice(0, 8).map(function (name) {
        var items = [], k = int(1, 3);
        for (var i = 0; i < k; i++) { var text = QUESTIONS[qi++ % QUESTIONS.length]; var id = "demo" + qi + norm(name).replace(/\W/g, "").slice(0, 6); items.push({ id: id, ts: nowMs() - int(1, 9) * 36e5 * 5, text: text }); if (R() < 0.3) done[id] = nowMs() - 36e5; }
        return { name: name, items: items };
      });
      vqDone = Object.assign(done, vqDone);
      return { tabs: tabs, computedAt: nowMs() };
    });
  }
  var vqDone = {};
  function genAnalitika() {
    return getStatic("data/preverbe.json").then(function (pv) {
      var forms = [], likert = function (center) { var n = int(16, 28), v = []; for (var i = 0; i < n; i++) v.push(clamp(Math.round(center + (R() - 0.5) * 2.6), 1, 5)); return v; };
      var qs = function (title, k) { return [
        { title: "Ocenite jasnost vsebine – " + title, values: likert(3.7 + k) }, { title: "Ocenite uporabnost za delo v stegu – " + title, values: likert(3.5 + k) },
        { title: "Ocenite izvedbo (voditelj/ica) – " + title, values: likert(4 + k) }, { title: "Ocenite organizacijo", values: likert(4.1) },
      ]; };
      ((pv && pv.temaForms) || []).forEach(function (f, i) {
        if (f.split) return;
        forms.push({ id: "demo-t" + i, title: (i + 1) + " " + String(f.title || f.tema).replace(/^Preverba teme\s*/i, ""), group: "teme", responses: int(14, 26), questions: qs(String(f.tema), (R() - 0.5) * 0.8) });
      });
      ((pv && pv.svodForms) || []).forEach(function (f, i) {
        forms.push({ id: "demo-s" + i, title: f.title || f.date, group: "svod", responses: int(6, 12), questions: [
          { title: "Kako ocenjuješ današnji dan?", values: likert(4.1) }, { title: "Kako ocenjuješ sodelovanje v SVODu?", values: likert(4.2) }, { title: "Kako utrujen/a si?", values: likert(2.8) } ] });
      });
      return { forms: forms, computedAt: nowMs() };
    });
  }
  function genVisits() {
    var perDay = {}, byDay = {}, perPage = {}, perPerson = {}, total = 0;
    var pages = ["casovnica", "casovnica", "casovnica", "uu", "teme", "zabava", "domov", "ekipa", "gradiva", "preverbe", "opravila", "trgovina", "os", "analitika"];
    for (var i = 13; i >= 0; i--) {
      var iso = isoPlus(TODAY, -i), live = (iso >= "2026-10-23" && iso <= "2026-10-25") || (iso >= "2026-11-05" && iso <= "2026-11-08");
      var cnt = live ? int(160, 420) : int(15, 70); if (iso > TODAY) cnt = 0;
      var day = { total: 0, perPage: {}, perPerson: {} };
      for (var k = 0; k < cnt; k++) {
        var p = pick(PLAYERS.slice(0, 1 + Math.ceil(R() * R() * (PLAYERS.length - 1)) + 4)), pg = pick(pages);
        day.total++; day.perPage[pg] = (day.perPage[pg] || 0) + 1;
        var dp = day.perPerson[p.email] || (day.perPerson[p.email] = { email: p.email, name: p.name, count: 0 }); dp.count++;
        perPage[pg] = (perPage[pg] || 0) + 1;
        var pp = perPerson[p.email] || (perPerson[p.email] = { email: p.email, name: p.name, count: 0, unverified: 0, mobile: 0 }); pp.count++; if (R() < 0.7) pp.mobile++;
        total++;
      }
      day.perPerson = Object.keys(day.perPerson).map(function (e) { return day.perPerson[e]; }).sort(function (a, b) { return b.count - a.count; });
      perDay[iso] = day.total; byDay[iso] = day;
    }
    return { ok: true, total: total, perDay: perDay, perPage: perPage, byDay: byDay, perPerson: Object.keys(perPerson).map(function (e) { return perPerson[e]; }).sort(function (a, b) { return b.count - a.count; }) };
  }

  /* ───────── Stavnica: bets, kazino, trgovina ───────── */
  var BUDGET = 10;
  var SV = {
    questions: [
      { q: "Bo jutri na kosilu špageti bolognese?", options: ["yes", "no"], result: "" },
      { q: "Kdo bo prvi zaspal na večerni delavnici?", options: ["Vid", "Maša", "Rok", "Nihče"], result: "" },
      { q: "Koliko ljudi bo zamudilo na jutranji zbor? (6-10)", options: ["0-5", "6-10", "11+"], result: "" },
      { q: "Bo predavatelj/ica prekoračil/a čas?", options: ["yes", "no"], result: "yes" },
      { q: "Bo kapitan ladje odgovoril na vsa vprašanja?", options: ["yes", "no"], result: "no" },
      { q: "Ali bo zmanjkalo toaletnega papirja?", options: ["yes", "no"], result: "" },
    ],
    bets: [], adjustments: [], games: [], receipts: [],
    products: [["Smetana za kuhanje", 4, 5], ["Hrenovke", 6, 4], ["Sirni namaz", 4, 3], ["Čips", 5, 2], ["Masleni piškoti", 4, 3], ["Čokolada", 6, 3], ["Čoko namaz", 8, 2], ["Med", 8, 1], ["Peppermint čaj", 3, 2], ["Bosanska kava (paket)", 7, 2]].map(function (p, i) { return { id: "p" + (i + 1), name: p[0], price: p[1], stock: p[2] }; }),
    seeded: false,
  };
  function svSeed() {
    if (SV.seeded) return; SV.seeded = true;
    PLAYERS.slice(1, 22).forEach(function (p) {
      SV.questions.forEach(function (q) { if (R() < 0.55) SV.bets.push({ ts: nowMs() - int(1, 400) * 6e4 * 5, question: q.q, option: pick(q.options), amount: int(1, 4), name: p.name, email: p.email }); });
      if (R() < 0.5) for (var i = 0; i < int(1, 4); i++) { var stake = int(1, 3), win = R() < 0.4; SV.games.push({ ts: nowMs() - int(1, 600) * 6e4, email: p.email, name: p.name, game: R() < 0.5 ? "ruleta" : "kocke", bets: R() < 0.5 ? "red×" + stake : "t7×" + stake, stake: stake, payout: win ? stake * 2 : 0, result: String(int(0, 36)) }); }
    });
    SV.games.sort(function (a, b) { return a.ts - b.ts; });
  }
  function svState(extra) {
    svSeed();
    var qs = SV.questions.map(function (q) {
      var people = {}, seen = {};
      SV.bets.filter(function (b) { return b.question === q.q; }).forEach(function (b) { var k = b.option + "|" + b.email; if (seen[k]) return; seen[k] = 1; people[b.option] = (people[b.option] || 0) + 1; });
      return { id: q.q, question: q.q, type: q.options.length === 2 && q.options[0] === "yes" ? "boolean" : "choice", options: q.options, odds: q.options.length, result: q.result, cancelled: false, image: "", resolvedAt: q.result ? nowMs() - 36e5 * 5 : null, people: people };
    });
    var byQ = {}; qs.forEach(function (q) { byQ[q.id] = q; });
    var payOf = function (q, b) { return !q.result ? null : b.option === q.result ? b.amount * q.odds : 0; };
    var mineBets = SV.bets.filter(function (b) { return b.email === ME; });
    var staked = 0, won = 0;
    var mine = mineBets.map(function (b) { var q = byQ[b.question], pay = payOf(q, b); staked += b.amount; if (pay) won += pay; return { ts: b.ts, question: b.question, option: b.option, amount: b.amount, odds: q.odds, payout: pay, cancelled: false }; });
    var myGames = SV.games.filter(function (g) { return g.email === ME; });
    var net = myGames.reduce(function (t, g) { return t + g.payout - g.stake; }, 0);
    var shopSpent = SV.receipts.reduce(function (t, r) { return t + r.total; }, 0);
    var adj = SV.adjustments.filter(function (a) { return a.email === ME; });
    var adjSum = adj.reduce(function (t, a) { return t + a.amount; }, 0);
    var st = {
      budget: BUDGET, questions: qs,
      recent: SV.bets.slice(-200).reverse().map(function (b) { return { ts: b.ts, question: b.question, option: b.option, amount: b.amount, name: b.name }; }),
      casinoRecent: SV.games.slice(-300).reverse(),
      shop: { products: SV.products.map(function (p) { return { id: p.id, name: p.name, price: p.price, stock: p.stock }; }), canEdit: true, spent: shopSpent, receipts: SV.receipts, all: SV.receipts },
      me: { balance: BUDGET - staked + won + adjSum + net - shopSpent, refunded: 0, shopSpent: shopSpent, staked: staked, won: won, adjusted: adjSum,
        casino: { net: net, staked: myGames.reduce(function (t, g) { return t + g.stake; }, 0), paid: myGames.reduce(function (t, g) { return t + g.payout; }, 0), count: myGames.length, games: myGames.slice(-30).reverse() },
        bets: mine.reverse(), adjustments: adj.slice().reverse() },
    };
    // admin overview: every player's balance
    var by = {};
    var person = function (email, name) { return by[email] || (by[email] = { email: email, name: name, staked: 0, won: 0, open: 0, adjusted: 0, bets: [], adjustments: [], casino: 0, casinoGames: 0, shop: 0 }); };
    SV.bets.forEach(function (b) { var q = byQ[b.question], pay = payOf(q, b), p = person(b.email, b.name); p.staked += b.amount; if (pay) p.won += pay; if (pay === null) p.open += b.amount; p.bets.push({ ts: b.ts, question: b.question, option: b.option, amount: b.amount, odds: q.odds, payout: pay, cancelled: false }); });
    SV.adjustments.forEach(function (a) { var p = person(a.email, a.name); p.adjusted += a.amount; p.adjustments.push({ ts: a.ts, amount: a.amount, reason: a.reason }); });
    SV.games.forEach(function (g) { var p = person(g.email, g.name); p.casino += g.payout - g.stake; p.casinoGames++; });
    SV.receipts.forEach(function (r) { person(r.email, r.name).shop += r.total; });
    st.people = Object.keys(by).map(function (k) { var p = by[k]; p.balance = BUDGET - p.staked + p.won + p.adjusted + p.casino - p.shop; p.bets.reverse(); return p; });
    return ok(Object.assign(st, extra || {}));
  }
  function svBalance() { return svState().me.balance; }
  var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  function roulettePay(k, a, n) {
    if (k === "n" + n) return a * 36;
    var dozen = n >= 1 && n <= 12 ? "d1" : n >= 13 && n <= 24 ? "d2" : n >= 25 ? "d3" : "";
    var col = n ? "c" + (((n - 1) % 3) + 1) : "";
    if (k === dozen || k === col) return a * 3;
    if (!n) return 0;
    if ((k === "red" && RED.indexOf(n) >= 0) || (k === "black" && RED.indexOf(n) < 0) || (k === "even" && n % 2 === 0) || (k === "odd" && n % 2 === 1) || (k === "low" && n <= 18) || (k === "high" && n >= 19)) return a * 2;
    return 0;
  }
  function dicePay(k, a, t) {
    var m = /^t(\d+)$/.exec(k);
    if (m) return Number(m[1]) === t ? a * ({ 2: 31, 12: 31, 3: 16, 11: 16, 4: 11, 10: 11, 5: 8, 9: 8, 6: 7, 8: 7, 7: 5 }[t] || 0) : 0;
    if (k === "under") return t < 7 ? a * 2 : 0;
    if (k === "over") return t > 7 ? a * 2 : 0;
    if (k === "odd") return t % 2 === 1 ? a * 2 : 0;
    if (k === "even") return t % 2 === 0 ? a * 2 : 0;
    return 0;
  }
  function handleStavnica(b) {
    var a = b.action;
    if (a === "state" || !a) return svState();
    if (a === "bet") {
      var q = SV.questions.filter(function (x) { return x.q === b.question; })[0], amt = Math.floor(Number(b.amount));
      if (!q || q.result) return { ok: false, error: "stave za to vprašanje so zaprte" };
      if (!(amt >= 1)) return { ok: false, error: "neveljaven vložek" };
      if (amt > svBalance()) return { ok: false, error: "premalo zlatnikov" };
      if (q.options.indexOf(b.option) < 0) return { ok: false, error: "neznana možnost" };
      SV.bets.push({ ts: nowMs(), question: q.q, option: b.option, amount: amt, name: DEMO_USER.name, email: ME });
      return svState();
    }
    if (a === "create") {
      var text = String(b.question || "").trim(), opts = Array.isArray(b.options) ? b.options : String(b.options || "").split(/[,\/;]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (text.length < 3) return { ok: false, error: "vprašanje mora imeti 3–300 znakov" };
      if (opts.length < 2) return { ok: false, error: "potrebni sta 2–8 možnosti" };
      SV.questions.unshift({ q: text, options: opts, result: "" }); return svState();
    }
    if (a === "resolve") {
      var rq = SV.questions.filter(function (x) { return x.q === b.question; })[0];
      if (rq) rq.result = b.cancel ? "" : String(b.result || ""); return svState();
    }
    if (a === "adjust") { SV.adjustments.push({ ts: nowMs(), email: String(b.email || "").toLowerCase(), name: String(b.name || ""), amount: Math.trunc(Number(b.amount)) || 0, reason: String(b.reason || "") }); return svState(); }
    if (a === "roulette" || a === "dice") {
      var bets = (b.bets || []).filter(function (x) { return x && x.k && Number(x.a) >= 1; }), stake = bets.reduce(function (t, x) { return t + Math.floor(Number(x.a)); }, 0);
      if (!bets.length) return { ok: false, error: "ni stav" };
      if (stake > svBalance()) return { ok: false, error: "premalo zlatnikov" };
      var pay = 0, casino, outBets;
      if (a === "roulette") {
        var n = int(0, 36);
        outBets = bets.map(function (x) { var p = roulettePay(x.k, Math.floor(Number(x.a)), n); pay += p; return { k: x.k, a: Math.floor(Number(x.a)), pay: p }; });
        casino = { game: "ruleta", n: n, color: n ? (RED.indexOf(n) >= 0 ? "red" : "black") : "green", bets: outBets, text: n + (n ? (RED.indexOf(n) >= 0 ? " rdeča" : " črna") : " zelena") };
      } else {
        var r = [int(1, 6), int(1, 6)], t = r[0] + r[1];
        outBets = bets.map(function (x) { var p = dicePay(x.k, Math.floor(Number(x.a)), t); pay += p; return { k: x.k, a: Math.floor(Number(x.a)), pay: p }; });
        casino = { game: "kocke", rolls: [r], total: t, bets: outBets, text: r[0] + "+" + r[1] + " = " + t };
      }
      SV.games.push({ ts: nowMs(), email: ME, name: DEMO_USER.name, game: casino.game, bets: outBets.map(function (x) { return x.k + "×" + x.a; }).join(", "), stake: stake, payout: pay, result: casino.text });
      return svState({ casino: casino });
    }
    if (a === "buy") {
      var total = 0, lines = [];
      for (var i = 0; i < (b.items || []).length; i++) {
        var it = b.items[i], p = SV.products.filter(function (x) { return x.id === it.id; })[0], qty = Math.floor(Number(it.qty));
        if (!p || !(qty >= 1)) return { ok: false, error: "neveljaven izdelek" };
        if (p.stock < qty) return { ok: false, error: "premalo zaloge: " + p.name };
        lines.push([p, qty]); total += p.price * qty;
      }
      if (total > svBalance()) return { ok: false, error: "premalo zlatnikov" };
      var rid = "R" + String(SV.receipts.length + 1).padStart(3, "0"), receipt;
      lines.forEach(function (l) { l[0].stock -= l[1]; });
      receipt = { id: rid, ts: nowMs(), email: ME, name: DEMO_USER.name, items: lines.map(function (l) { return { id: l[0].id, name: l[0].name, qty: l[1], price: l[0].price, total: l[0].price * l[1] }; }), total: total, done: false };
      SV.receipts.push(receipt);
      var o2 = svState(); o2.receipt = receipt; return o2;
    }
    if (a === "shop-edit") { var sp = SV.products.filter(function (x) { return x.id === b.id; })[0]; if (sp) { if (b.price != null) sp.price = Number(b.price); if (b.stock != null) sp.stock = Number(b.stock); } return svState(); }
    if (a === "shop-handout") { SV.receipts.forEach(function (r) { if (r.id === b.receipt) r.done = !!b.done; }); return svState(); }
    return svState();
  }

  /* ───────────────────────── request router ───────────────────────── */
  function routeGet(u) {
    var type = u.searchParams.get("type") || "";
    if (type === "papiga") return Promise.resolve(ok({ results: genPapigaCached() }));
    if (type === "bumbar") return Promise.resolve(ok({ results: genBumbarCached(), bans: [] }));
    if (type === "rutke") return genRutke();
    if (type === "zadolzitve") return Promise.resolve(choreState());
    if (type === "flags") return Promise.resolve(ok({ flags: FLAGS }));
    if (type === "version") return Promise.resolve(ok({ version: "demo" }));
    return genWordleCached().then(function (rows) { return ok({ results: rows }); });
  }
  var cPapiga, cBumbar, cWordle;
  var genPapigaCached = function () { return cPapiga || (cPapiga = genPapiga()); };
  var genBumbarCached = function () { return cBumbar || (cBumbar = genBumbar()); };
  var genWordleCached = function () { return cWordle || (cWordle = genWordle()); };
  var myResults = []; // the viewer's own games, added to the leaderboards

  function routePost(b) {
    switch (b.type) {
      case "session": return Promise.resolve(ok({ session: "demo.session", exp: SESSION_EXP }));
      case "visit": case "wordle-guess": case "push": case "preverba": return Promise.resolve(b.type === "push" && b.action === "key" ? ok({ publicKey: "" }) : ok());
      case "papiga": if (b.action === "result") genPapigaCached().push({ email: ME, name: DEMO_USER.name, date: b.date || TODAY, found: !!b.found, ms: b.ms || null, misses: b.misses || 0 }); return Promise.resolve(ok());
      case "bumbar": if (b.action === "result") { var r = b.rounds || [0, 0, 0]; genBumbarCached().push({ email: ME, name: DEMO_USER.name, date: b.date || TODAY, rounds: r, early: b.early || 0, total: b.total || 0, attempt: b.attempt || 1 }); return Promise.resolve(ok({ total: b.total || 0 })); }
        if (b.action === "ban" || b.action === "unban") return Promise.resolve(ok()); return Promise.resolve(ok());
      case "rutke": return genRutke().then(function () { (b.votes || []).forEach(function (v) { if (rutkeVotes.stegs[v.w]) rutkeVotes.stegs[v.w][0]++; if (rutkeVotes.stegs[v.l]) rutkeVotes.stegs[v.l][1]++; rutkeVotes.votes++; }); return ok({ saved: (b.votes || []).length }); });
      case "zadolzitve": return Promise.resolve(choreAction(b));
      case "flags": if (b.page in FLAGS) FLAGS[b.page] = b.on === true; return Promise.resolve(ok({ flags: FLAGS }));
      case "stavnica": return Promise.resolve(handleStavnica(b));
      case "ocene": return genOcene().then(ok);
      case "vprasanja": if (b.action === "mark") { if (b.done) vqDone[b.id] = nowMs(); else delete vqDone[b.id]; return Promise.resolve(ok({ done: vqDone })); } return genVprasanja().then(function (d) { return ok(Object.assign({ done: vqDone }, d)); });
      case "analitika": return genAnalitika().then(ok);
      case "visitstats": return Promise.resolve(genVisits());
      case undefined: // Wordle result: { date, guesses, solved, ms }
        genWordleCached().then(function (rows) { rows.push({ email: ME, name: DEMO_USER.name, date: b.date || TODAY, guesses: b.guesses, solved: b.solved === true, ms: b.ms || null }); });
        return Promise.resolve(ok());
      default: return Promise.resolve(ok());
    }
  }

  /* ───────── UU contacts (Google Sheets API the page calls with the viewer's own token) ───────── */
  function fakeContacts() {
    return getStatic("data/os.json").then(function (os) {
      var names = [], contacts = [];
      ((os && os.groups) || []).forEach(function (g) { (g.members || []).forEach(function (m) {
        var parts = String(m.name).split(" "), last = parts.pop(), first = parts.join(" ");
        names.push([first, last]); contacts.push([norm(first + "." + last).replace(/\s+/g, ".") + "@demo.example", "+386 40 " + String(100 + names.length * 7).padStart(3, "0") + " " + String(200 + names.length * 13).slice(-3)]);
      }); });
      return { valueRanges: [{ values: names }, { values: contacts }] };
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || String(input);
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (/\/data\/wordle_config\.json(\?|$)|^data\/wordle_config\.json/.test(url)) return Promise.resolve(jsonRes({ scriptUrl: API }));
    if (/(^|\/)data\/access\.json(\?|$)/.test(url)) {
      return realFetch(input, init).then(function (r) { return r.json(); }).then(function (a) {
        a = a || {}; a.users = Object.assign({}, a.users, (function () { var o = {}; o[ME] = "admin"; return o; })()); return jsonRes(a);
      }).catch(function () { return jsonRes({ defaultRole: "admin", roles: { admin: { allow: ["*"], deny: [] } }, users: {} }); });
    }
    if (url.indexOf("sheets.googleapis.com/v4/spreadsheets/") >= 0) return fakeContacts().then(jsonRes);
    if (url.indexOf("oauth2.googleapis.com/tokeninfo") >= 0) return Promise.resolve(jsonRes({ email: ME, scope: "https://www.googleapis.com/auth/spreadsheets.readonly" }));
    if (url.indexOf(API) === 0 || url.indexOf("script.google.com/macros") >= 0) {
      if (method === "POST") {
        var body = {}; try { body = JSON.parse((init && init.body) || "{}"); } catch (e) {}
        return Promise.resolve(routePost(body)).then(function (o) { return new Promise(function (res) { setTimeout(function () { res(jsonRes(o)); }, 80 + Math.random() * 160); }); });
      }
      return routeGet(new URL(url, location.href)).then(function (o) { return new Promise(function (res) { setTimeout(function () { res(jsonRes(o)); }, 60 + Math.random() * 140); }); });
    }
    return realFetch(input, init);
  };

  /* Google Identity stub: the site never loads the real library in demo mode (index.html), but code may still ask for it */
  window.google = { accounts: {
    id: { initialize: function () {}, renderButton: function () {}, prompt: function () {}, disableAutoSelect: function () {} },
    oauth2: { initTokenClient: function (cfg) { return { requestAccessToken: function () { setTimeout(function () { cfg.callback({ access_token: "demo", expires_in: 3600, scope: "https://www.googleapis.com/auth/spreadsheets.readonly" }); }, 50); } }; } },
  } };

  /* Service worker and push make no sense for a throw-away demo */
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error("demo")); }; } catch (e) {}

  /* "Demo" ribbon so nobody mistakes it for the real thing, with the way out and the pinned time */
  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.createElement("div");
    bar.id = "demo-bar";
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;gap:.75rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.35rem .75rem;font:600 12px/1.3 system-ui,sans-serif;background:#f5c542;color:#1b1400;box-shadow:0 -2px 8px rgba(0,0,0,.25)";
    var d = new RealDate(nowMs());
    bar.innerHTML = "<span>DEMO · izmišljeni podatki · čas: " + d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) +
      "</span><a href=\"?demo=0\" style=\"color:#1b1400\">Zapri demo</a>";
    document.body.appendChild(bar);
    document.body.style.paddingBottom = "34px";
  });
})();
