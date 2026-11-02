/**
 * Zabava → Spot-A-Papiga: a daily "find the parrot" picture. Taps are checked in the browser (instant); this script
 * only records them and the result, and checks that a reported find really is on the parrot.
 *
 * Answers: Drive papiga sheet (PAPIGA_SPOTS_ID), tab "spots": date | spot | image
 *   date  = 4. 11. 2026 (text or a date cell)
 *   spot  = "x 1314, y 1855, r 60": centre and radius of the parrot in pixels of the original 1792×2400 picture
 *           (one parrot per picture). The site has the same spots (scrambled) in data/papiga.json – keep them in sync.
 * Results go into Drive wordle/results (PAPIGA_RESULTS_ID, the Wordle results sheet):
 *   tab "results-papiga" Čas | Email | Ime | Datum | Najdeno | Ms | Zgrešeni
 *   tab "papiga-kliki"   Čas | Email | Ime | Datum | Dejanje | X | Y | Zadetek | Od začetka (s)
 *
 * doPost {type:'papiga', action, credential, date, …}
 *   action 'open' | 'tap' {x, y, hit, t} | 'giveup' {t} → one row in papiga-kliki (the site doesn't wait for it)
 *   action 'result' {found, ms, misses, x?, y?} → one row per player and day in results-papiga (first one wins);
 *                   a find must be on the parrot (x, y = the winning tap, 0–1 of the picture)
 * doGet ?type=papiga → {ok, results:[{email,name,date,found,ms,misses}]}  (?callback=fn for JSONP)
 *
 * Hook it into Code.gs (needs Code.gs helpers verifyToken_, json_, cellDate_, TZ):
 *   doPost, with the other handlers:   if (body.type === 'papiga') return handlePapiga(body);
 *   doGet, first line in the function: if (e && e.parameter && e.parameter.type === 'papiga') return papigaResults_(e.parameter.callback);
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
var PAPIGA_SPOTS_ID = '1KPqzbRza8vqAV9SrRb6GDrqpTUKaAHY3r7BMkOSaQ_o';
var PAPIGA_W = 1792, PAPIGA_H = 2400;  // original picture size the spot pixels refer to
var PAPIGA_SLACK = 1.15;               // a tap a bit outside the circle still counts
var PAPIGA_RESULTS_ID = '1-HJCqFOFjiHASiLN2c5ecXLlkq1e8W3WgjT6Py0hM_k'; // Drive wordle/results
var PAPIGA_RESULTS = 'results-papiga', PAPIGA_CLICKS = 'papiga-kliki';

function papigaSheet_(name, header) {
  var ss = SpreadsheetApp.openById(PAPIGA_RESULTS_ID), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function papigaResultsSheet_() { return papigaSheet_(PAPIGA_RESULTS, ['Čas', 'Email', 'Ime', 'Datum', 'Najdeno', 'Ms', 'Zgrešeni']); }
function papigaClicksSheet_() { return papigaSheet_(PAPIGA_CLICKS, ['Čas', 'Email', 'Ime', 'Datum', 'Dejanje', 'X', 'Y', 'Zadetek', 'Od začetka (s)']); }

/** { 'yyyy-MM-dd': [{x, y, r}, …] } from the spots tab, cached 5 min. */
function papigaSpots_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('papiga-spots');
  if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.openById(PAPIGA_SPOTS_ID), sh = ss.getSheetByName('spots') || ss.getSheets()[0];
  var rows = sh.getDataRange().getValues(), out = {};
  for (var i = 1; i < rows.length; i++) {
    var d = rows[i][0], date = '';
    if (d instanceof Date) date = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    else {
      var m = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(String(d)) || null;
      if (m) date = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      else if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) date = String(d).slice(0, 10);
    }
    if (!date) continue;
    var spots = String(rows[i][1] || '').split(/[;|]/).map(function (s) {
      var n = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number); // "x 1314, y 1855, r 60" or "1314,1855,60"
      return n.length >= 3 ? { x: n[0], y: n[1], r: n[2] } : null;
    }).filter(Boolean);
    if (spots.length) out[date] = spots;
  }
  cache.put('papiga-spots', JSON.stringify(out), 300);
  return out;
}

function handlePapiga(body) {
  try {
    var who = verifyToken_(body.credential);
    var date = String(body.date || ''), action = String(body.action || '');
    var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'bad_date' });
    if (date > today) return json_({ ok: false, error: 'future_date' });
    var spots = papigaSpots_()[date];
    if (!spots) return json_({ ok: false, error: 'not_a_puzzle_date' });
    var now = new Date(), num = function (v, d) { v = Number(v); return isFinite(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : ''; };
    var sec = function (v) { v = Number(v); return v >= 0 && v < 86400000 ? Math.round(v / 100) / 10 : ''; };

    if (action === 'open' || action === 'tap' || action === 'giveup') {
      var label = { open: 'odprto', tap: 'klik', giveup: 'predaja' }[action];
      papigaClicksSheet_().appendRow([now, who.email, who.name, "'" + date, label,
        action === 'tap' ? num(body.x, 4) : '', action === 'tap' ? num(body.y, 4) : '', action === 'tap' ? body.hit === true : '', action === 'open' ? 0 : sec(body.t)]);
      return json_({ ok: true });
    }
    if (action === 'result') {
      var found = body.found === true, misses = Math.floor(Number(body.misses));
      if (!(misses >= 0 && misses < 10000)) misses = 0;
      var ms = Math.floor(Number(body.ms));
      if (!found || !(ms > 0 && ms < 86400000)) ms = '';
      if (found) {
        var x = Number(body.x), y = Number(body.y);
        var hit = x >= 0 && x <= 1 && y >= 0 && y <= 1 && spots.some(function (s) {
          var dx = x * PAPIGA_W - s.x, dy = y * PAPIGA_H - s.y; return Math.sqrt(dx * dx + dy * dy) <= s.r * PAPIGA_SLACK;
        });
        if (!hit) return json_({ ok: false, error: 'not_a_hit' });
      }
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var res = papigaResultsSheet_(), rows = res.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][1]).toLowerCase() === who.email && cellDate_(rows[i][3]) === date) return json_({ ok: true, duplicate: true });
        }
        res.appendRow([now, who.email, who.name, "'" + date, found, ms, misses]);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'bad_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Everybody's results (no answers) for the leaderboard. */
function papigaResults_(cb) {
  try {
    var rows = papigaResultsSheet_().getDataRange().getValues(), out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[1]) continue;
      out.push({ email: String(r[1]).toLowerCase(), name: String(r[2]), date: cellDate_(r[3]),
        found: r[4] === true || String(r[4]).toUpperCase() === 'TRUE', ms: Number(r[5]) || null, misses: Number(r[6]) || 0 });
    }
    return json_({ ok: true, results: out }, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}

/** Run once from the editor (select it → ▶ Run): grants access to the papiga sheet and logs the parsed spots. */
function papigaCheckSpots() {
  CacheService.getScriptCache().remove('papiga-spots');
  Logger.log(JSON.stringify(papigaSpots_()));
}
