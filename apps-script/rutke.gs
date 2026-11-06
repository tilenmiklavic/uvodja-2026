/**
 * Zabava → Rutke: players see two scout scarves (data/rutke.json, one per steg) and pick the nicer one, pair after pair.
 * Every pick is one row in the results sheet (same spreadsheet as Wordle / Spot-A-Papiga / Bum-Bar):
 *   tab "results-rutke" Čas | Email | Ime | Zmagovalec | Poraženec | ID   (created on the first vote)
 *
 * doPost {type:'rutke', action:'votes', credential, votes:[{w, l, id}]}  (up to 50 picks per request; the site batches them)
 * doGet  ?type=rutke → {ok, stegs:{<steg>:[wins, losses]}, votes, voters}  (?callback=fn for JSONP)
 *        Counting: each player's latest pick per pair of scarves counts once (re-voting a pair replaces the earlier pick),
 *        and a resent pick (same id) counts once. Cached for RUTKE_CACHE_S seconds.
 *
 * Hook it into Code.gs (wordle.gs; already done in the repo version):
 *   doPost: if (body.type === 'rutke') return handleRutke(body);
 *   doGet:  if (e && e.parameter && e.parameter.type === 'rutke') return rutkeResults_(e.parameter.callback);
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
var RUTKE_RESULTS_ID = '1-HJCqFOFjiHASiLN2c5ecXLlkq1e8W3WgjT6Py0hM_k'; // Drive wordle/results
var RUTKE_TAB = 'results-rutke';
var RUTKE_CACHE_S = 60;

function rutkeSheet_() {
  var ss = SpreadsheetApp.openById(RUTKE_RESULTS_ID), sh = ss.getSheetByName(RUTKE_TAB);
  if (!sh) { sh = ss.insertSheet(RUTKE_TAB); sh.appendRow(['Čas', 'Email', 'Ime', 'Zmagovalec', 'Poraženec', 'ID']); sh.setFrozenRows(1); }
  return sh;
}
function rutkeName_(v) { v = String(v || '').replace(/[\r\n\t]/g, ' ').trim(); return v && v.length <= 80 && !/^[=+\-@]/.test(v) ? v : ''; }

function handleRutke(body) {
  try {
    var who = verifyToken_(body.credential);
    if (String(body.action || '') !== 'votes') return json_({ ok: false, error: 'bad_action' });
    var now = new Date(), rows = [];
    [].concat(body.votes || []).slice(0, 50).forEach(function (v) {
      var w = rutkeName_(v && v.w), l = rutkeName_(v && v.l), id = String(v && v.id || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (w && l && w !== l) rows.push([now, who.email, who.name, w, l, id ? "'" + id : '']);
    });
    if (!rows.length) return json_({ ok: false, error: 'no_votes' });
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = rutkeSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
    CacheService.getScriptCache().remove('rutke-results');
    return json_({ ok: true, saved: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Wins and losses per steg (latest pick per player and pair). */
function rutkeResults_(cb) {
  try {
    var cache = CacheService.getScriptCache(), hit = cache.get('rutke-results');
    if (hit) return json_(JSON.parse(hit), cb);
    var rows = rutkeSheet_().getDataRange().getValues(), seen = {}, latest = {}, voters = {};
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], email = String(r[1]).toLowerCase(), w = String(r[3]), l = String(r[4]), id = String(r[5] || '');
      if (!email || !w || !l) continue;
      if (id) { if (seen[id]) continue; seen[id] = 1; }
      latest[email + '|' + (w < l ? w + '|' + l : l + '|' + w)] = [w, l]; // later rows overwrite earlier picks of the same pair
      voters[email] = 1;
    }
    var stegs = {}, votes = 0;
    Object.keys(latest).forEach(function (k) {
      var p = latest[k];
      (stegs[p[0]] = stegs[p[0]] || [0, 0])[0]++;
      (stegs[p[1]] = stegs[p[1]] || [0, 0])[1]++;
      votes++;
    });
    var out = { ok: true, stegs: stegs, votes: votes, voters: Object.keys(voters).length };
    cache.put('rutke-results', JSON.stringify(out), RUTKE_CACHE_S);
    return json_(out, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}
