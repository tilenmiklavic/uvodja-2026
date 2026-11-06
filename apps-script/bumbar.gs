/**
 * Zabava → Bum-Bar: a whack-a-mole reaction game. Green parrots pop in and out of 9 holes (3 × 3) in the deck; at a random moment a
 * red one appears and the player taps as fast as possible. A game is 3 rounds; the score is the sum of the 3 reaction
 * times plus BUMBAR_EARLY_MS for every tap before the red parrot was out. Players may retry as often as they like:
 * every finished game is stored (one row per attempt) and the site ranks each player's best game of the day. Timing happens in the browser; this script
 * only checks the numbers are plausible and stores them.
 *
 * Results go into Drive wordle/results (BUMBAR_RESULTS_ID, the same sheet as Wordle and Spot-A-Papiga):
 *   tab "results-bumbar" Čas | Email | Ime | Datum | Krog 1 (ms) | Krog 2 (ms) | Krog 3 (ms) | Prezgodnji | Skupaj (ms) | Poskus | ID
 *   (the tab is created on the first result; the last two columns are added to an existing tab automatically)
 *
 * doPost {type:'bumbar', action:'result', credential, date, rounds:[ms, ms, ms], early, id, attempt}
 *        → one row per finished game; id (made by the site) makes resending the same game harmless.
 *          Without an id (an old cached page) it is still one row per player and day.
 * doGet ?type=bumbar → {ok, results:[{email,name,date,rounds,early,total,attempt}]}  (?callback=fn for JSONP)
 *
 * Hook it into Code.gs (needs Code.gs helpers verifyToken_, json_, cellDate_, TZ – the same ones papiga.gs uses):
 *   doPost, with the other handlers:   if (body.type === 'bumbar') return handleBumbar(body);
 *   doGet, first line in the function: if (e && e.parameter && e.parameter.type === 'bumbar') return bumbarResults_(e.parameter.callback);
 *
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
var BUMBAR_RESULTS_ID = '1-HJCqFOFjiHASiLN2c5ecXLlkq1e8W3WgjT6Py0hM_k'; // Drive wordle/results
var BUMBAR_RESULTS = 'results-bumbar';
var BUMBAR_ROUNDS = 3;
var BUMBAR_EARLY_MS = 1000; // keep in sync with BB_EARLY_MS in js/app.js
var BUMBAR_MIN_MS = 60;     // faster than this is a guess, not a reaction (the site counts it as too early)

function bumbarResultsSheet_() {
  var ss = SpreadsheetApp.openById(BUMBAR_RESULTS_ID), sh = ss.getSheetByName(BUMBAR_RESULTS);
  if (!sh) {
    sh = ss.insertSheet(BUMBAR_RESULTS);
    sh.appendRow(['Čas', 'Email', 'Ime', 'Datum', 'Krog 1 (ms)', 'Krog 2 (ms)', 'Krog 3 (ms)', 'Prezgodnji', 'Skupaj (ms)', 'Poskus', 'ID']);
    sh.setFrozenRows(1);
  } else if (!sh.getRange(1, 11).getValue()) {
    sh.getRange(1, 10, 1, 2).setValues([['Poskus', 'ID']]);
  }
  return sh;
}

function handleBumbar(body) {
  try {
    var who = verifyToken_(body.credential);
    if (String(body.action || '') !== 'result') return json_({ ok: false, error: 'bad_action' });
    var date = String(body.date || ''), today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'bad_date' });
    if (date > today) return json_({ ok: false, error: 'future_date' });
    var rounds = [].concat(body.rounds || []).map(function (v) { return Math.round(Number(v)); });
    if (rounds.length !== BUMBAR_ROUNDS || rounds.some(function (v) { return !(v >= BUMBAR_MIN_MS && v < 600000); })) return json_({ ok: false, error: 'bad_rounds' });
    var early = Math.floor(Number(body.early));
    if (!(early >= 0 && early < 10000)) early = 0;
    var total = rounds.reduce(function (a, v) { return a + v; }, 0) + early * BUMBAR_EARLY_MS;
    var id = String(body.id || '').replace(/[^\w-]/g, '').slice(0, 40);
    var attempt = Math.floor(Number(body.attempt));
    if (!(attempt >= 1 && attempt < 10000)) attempt = '';

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = bumbarResultsSheet_(), rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var same = id ? String(rows[i][10]) === id // the same game sent again
          : String(rows[i][1]).toLowerCase() === who.email && cellDate_(rows[i][3]) === date; // old page: one per day
        if (same) return json_({ ok: true, duplicate: true });
      }
      sh.appendRow([new Date(), who.email, who.name, "'" + date, rounds[0], rounds[1], rounds[2], early, total, attempt, id ? "'" + id : '']);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true, total: total });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Everybody's results for the leaderboard. */
function bumbarResults_(cb) {
  try {
    var rows = bumbarResultsSheet_().getDataRange().getValues(), out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[1]) continue;
      out.push({ email: String(r[1]).toLowerCase(), name: String(r[2]), date: cellDate_(r[3]),
        rounds: [Number(r[4]) || 0, Number(r[5]) || 0, Number(r[6]) || 0], early: Number(r[7]) || 0, total: Number(r[8]) || 0, attempt: Number(r[9]) || 1 });
    }
    return json_({ ok: true, results: out }, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}
