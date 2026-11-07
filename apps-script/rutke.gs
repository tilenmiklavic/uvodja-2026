/**
 * Zabava → Rutke: players see two scout scarves (data/rutke.json, one per steg) and pick the nicer one, pair after pair.
 * Every pick is one row in the results sheet (same spreadsheet as Wordle / Spot-A-Papiga / Bum-Bar):
 *   tab "results-rutke" Čas | Email | Ime | Zmagovalec | Poraženec | ID   (created on the first vote)
 *
 * doPost {type:'rutke', action:'votes', credential, votes:[{w, l, id}]}  (up to 50 picks per request; the site batches them)
 * doGet  ?type=rutke → {ok, stegs:{<steg>:[wins, losses]}, votes, voters}  (?callback=fn for JSONP)
 *        Counting: each player's latest pick per pair of scarves counts once (re-voting a pair replaces the earlier pick),
 *        and a resent pick (same id) counts once. A pick that involves the player's own steg (for or against) is ignored:
 *        the steg comes from the participants sheet (RUTKE_PEOPLE_ID, tab "Seznam udeležencev", columns "E-naslov", "Ime",
 *        "Priimek", "Ime stega"), matched by e-mail or – since many are listed with a private address but play with
 *        @skavti.si – by full name; steg accounts named "Skavti <steg> …" (e.g. "Skavti Ljubljana 4 IV 2") count as that steg.
 *        Players found nowhere (e.g. SVOD) count normally. The rows stay in results-rutke. Cached for RUTKE_CACHE_S seconds.
 *
 * Hook it into Code.gs (wordle.gs; already done in the repo version):
 *   doPost: if (body.type === 'rutke') return handleRutke(body);
 *   doGet:  if (e && e.parameter && e.parameter.type === 'rutke') return rutkeResults_(e.parameter.callback);
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
var RUTKE_RESULTS_ID = '1-HJCqFOFjiHASiLN2c5ecXLlkq1e8W3WgjT6Py0hM_k'; // Drive wordle/results
var RUTKE_TAB = 'results-rutke';
var RUTKE_CACHE_S = 60;
var RUTKE_PEOPLE_ID = '1a_8ghLlrhMexb5VS-U9M5aPcP4yK6mAnDLdp0Eg74NQ'; // Drive "UU U Vodja 2026" (participants, their stegs)

/** "Dol - Dolsko 1" and "Dol-Dolsko 1 " → "dol-dolsko 1" */
function rutkeNorm_(s) { return String(s || '').toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim(); }
/** "Pečarič Teraž" → "pecaricteraz" (for matching names) */
function rutkeKey_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
/** {byEmail: {e-mail: steg}, byName: {name key: steg}} (normalised stegs) from the participants sheet, cached 10 min */
function rutkeHomeStegs_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('rutke-home');
  if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.openById(RUTKE_PEOPLE_ID), sh = ss.getSheetByName('Seznam udeležencev') || ss.getSheets()[0];
  var rows = sh.getDataRange().getDisplayValues(), head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var ce = head.indexOf('e-naslov'), cs = head.indexOf('ime stega'), cf = head.indexOf('ime'), cl = head.indexOf('priimek');
  var out = { byEmail: {}, byName: {} };
  if (ce < 0 || cs < 0) throw new Error('participants sheet: missing E-naslov / Ime stega column');
  for (var i = 1; i < rows.length; i++) {
    var e = String(rows[i][ce] || '').trim().toLowerCase(), st = rutkeNorm_(rows[i][cs]);
    if (!st) continue;
    if (e) out.byEmail[e] = st;
    var k = cf >= 0 && cl >= 0 ? rutkeKey_(rows[i][cf] + rows[i][cl]) : '';
    if (k) out.byName[k] = st;
  }
  cache.put('rutke-home', JSON.stringify(out), 600);
  return out;
}

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
    var rows = rutkeSheet_().getDataRange().getValues(), seen = {}, latest = {}, voters = {}, home = rutkeHomeStegs_(), own = 0;
    var stegNames = {}; // every scarf steg that appears in a vote, for "Skavti <steg> …" accounts
    for (var j = 1; j < rows.length; j++) { stegNames[rutkeNorm_(rows[j][3])] = 1; stegNames[rutkeNorm_(rows[j][4])] = 1; }
    var homeOf = {}, homeFor = function (email, name) {
      if (email in homeOf) return homeOf[email];
      var h = home.byEmail[email] || home.byName[rutkeKey_(name)] || '';
      var nn = ' ' + rutkeNorm_(name) + ' ';
      if (!h && /^ skavti /.test(nn)) Object.keys(stegNames).forEach(function (st) { if (st && nn.indexOf(' ' + st + ' ') >= 0 && st.length > h.length) h = st; });
      return (homeOf[email] = h);
    };
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], email = String(r[1]).toLowerCase(), w = String(r[3]), l = String(r[4]), id = String(r[5] || '');
      if (!email || !w || !l) continue;
      if (id) { if (seen[id]) continue; seen[id] = 1; }
      var hs = homeFor(email, r[2]);
      if (hs && (hs === rutkeNorm_(w) || hs === rutkeNorm_(l))) { own++; continue; } // own steg (for or against): not counted
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
    var out = { ok: true, stegs: stegs, votes: votes, voters: Object.keys(voters).length, ownSkipped: own };
    cache.put('rutke-results', JSON.stringify(out), RUTKE_CACHE_S);
    return json_(out, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}
