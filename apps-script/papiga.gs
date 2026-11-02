/**
 * Zabava → Spot-A-Papiga: a daily "find the parrot" picture. The answers never reach the browser:
 * the site sends where the player tapped and this script says hit or miss.
 *
 * Answers: Drive papiga sheet (PAPIGA_SPOTS_ID), tab "spots": date | spot | image
 *   date  = 4. 11. 2026 (text or a date cell)
 *   spot  = "x 1314, y 1855, r 60": centre and radius in pixels of the original 1792×2400 picture;
 *           several parrots: separate them with ";" (any one of them counts as found).
 * Results go into the spreadsheet this script is bound to (same as Wordle):
 *   tab "papiga"       Čas | Email | Ime | Datum | Najdeno | Ms | Zgrešeni
 *   tab "papiga-kliki" Čas | Email | Ime | Datum | Dejanje | X | Y | Zadetek | Od začetka (s)
 *
 * doPost {type:'papiga', action, credential, date, …}
 *   action 'open'   → starts the clock (first time only) → {ok, done, found?, ms?, misses, spots?}
 *   action 'click'  {x, y (0–1 of the picture), ms?} → {ok, hit, done, misses, ms?, spots?}
 *   action 'giveup' → {ok, done, found:false, spots}
 * doGet ?type=papiga → {ok, results:[{email,name,date,found,ms,misses}]}  (?callback=fn for JSONP)
 *
 * Hook it into Code.gs (needs Code.gs helpers verifyToken_, json_, cellDate_, TZ):
 *   doPost, with the other handlers:   if (body.type === 'papiga') return handlePapiga(body);
 *   doGet, first line in the function: if (e && e.parameter && e.parameter.type === 'papiga') return papigaResults_(e.parameter.callback);
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 * The time counts on the server from 'open' (the player pressing »Začni«) to the hit, so it can't be faked.
 */
var PAPIGA_SPOTS_ID = '1KPqzbRza8vqAV9SrRb6GDrqpTUKaAHY3r7BMkOSaQ_o';
var PAPIGA_W = 1792, PAPIGA_H = 2400;  // original picture size the spot pixels refer to
var PAPIGA_SLACK = 1.15;               // a tap a bit outside the circle still counts
var PAPIGA_RESULTS = 'papiga', PAPIGA_CLICKS = 'papiga-kliki';

function papigaSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
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

/** Spots for the browser (only once the player is done): centre and radius as fractions of the picture's width/height. */
function papigaOut_(spots) {
  return spots.map(function (s) { return { x: s.x / PAPIGA_W, y: s.y / PAPIGA_H, r: s.r / PAPIGA_W }; });
}

function handlePapiga(body) {
  try {
    var who = verifyToken_(body.credential);
    var date = String(body.date || ''), action = String(body.action || '');
    var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'bad_date' });
    if (date !== today) return json_({ ok: false, error: date > today ? 'future_date' : 'past_date' });
    var spots = papigaSpots_()[date];
    if (!spots) return json_({ ok: false, error: 'not_a_puzzle_date' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // This player's result for the day (if any)
      var res = papigaResultsSheet_(), rrows = res.getDataRange().getValues();
      for (var i = 1; i < rrows.length; i++) {
        if (String(rrows[i][1]).toLowerCase() === who.email && cellDate_(rrows[i][3]) === date) {
          var found = rrows[i][4] === true || String(rrows[i][4]).toUpperCase() === 'TRUE';
          return json_({ ok: true, done: true, found: found, ms: Number(rrows[i][5]) || null, misses: Number(rrows[i][6]) || 0, spots: papigaOut_(spots) });
        }
      }
      // Clicks so far: start time (first 'open') and misses
      var clicks = papigaClicksSheet_(), crows = clicks.getDataRange().getValues(), start = null, misses = 0, missList = [];
      for (var j = 1; j < crows.length; j++) {
        if (String(crows[j][1]).toLowerCase() !== who.email || cellDate_(crows[j][3]) !== date) continue;
        if (crows[j][4] === 'odprto' && !start) start = crows[j][0] instanceof Date ? crows[j][0].getTime() : null;
        if (crows[j][4] === 'klik' && !(crows[j][7] === true || String(crows[j][7]).toUpperCase() === 'TRUE')) { misses++; missList.push([Number(crows[j][5]), Number(crows[j][6])]); }
      }
      var now = new Date(), since = start ? Math.round((now.getTime() - start) / 100) / 10 : '';

      if (action === 'open') {
        if (!start) clicks.appendRow([now, who.email, who.name, "'" + date, 'odprto', '', '', '', 0]);
        return json_({ ok: true, done: false, misses: misses, missList: missList, elapsed: start ? now.getTime() - start : 0 });
      }
      if (action === 'giveup') {
        clicks.appendRow([now, who.email, who.name, "'" + date, 'predaja', '', '', '', since]);
        res.appendRow([now, who.email, who.name, "'" + date, false, '', misses]);
        return json_({ ok: true, done: true, found: false, misses: misses, spots: papigaOut_(spots) });
      }
      if (action === 'click') {
        var x = Number(body.x), y = Number(body.y);
        if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return json_({ ok: false, error: 'bad_xy' });
        var px = x * PAPIGA_W, py = y * PAPIGA_H;
        var hit = spots.some(function (s) { var dx = px - s.x, dy = py - s.y; return Math.sqrt(dx * dx + dy * dy) <= s.r * PAPIGA_SLACK; });
        clicks.appendRow([now, who.email, who.name, "'" + date, 'klik', Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, hit, since]);
        if (!hit) return json_({ ok: true, hit: false, done: false, misses: misses + 1 });
        // Time: server clock from the first 'open'; the player's own timer only when the open never arrived
        var ms = start ? now.getTime() - start : Math.floor(Number(body.ms));
        if (!(ms > 0 && ms < 86400000)) ms = '';
        res.appendRow([now, who.email, who.name, "'" + date, true, ms, misses]);
        return json_({ ok: true, hit: true, done: true, found: true, ms: ms || null, misses: misses, spots: papigaOut_(spots) });
      }
      return json_({ ok: false, error: 'bad_action' });
    } finally {
      lock.releaseLock();
    }
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
