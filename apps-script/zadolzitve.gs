/**
 * Zadolžitve (site page #zadolzitve, visible to every role): each player picks one chore for today; every chore has a
 * limited number of places. Picks are stored in the Drive sheet "zadolzitve" (ZADOLZITVE_ID), tab "izbire" (created on
 * first use): Čas | Email | Ime | Datum | Zadolžitev. One row per player and day; picking another chore replaces it.
 *
 * doGet  ?type=zadolzitve → {ok, date, chores:[{name, cap, people:[{email, name}]}]}  (today, Europe/Ljubljana)
 * doPost {type:'zadolzitve', action:'pick', credential, chore} → same as doGet (+ ok:false, error:'polno' when it's full)
 *        {type:'zadolzitve', action:'leave', credential}      → same as doGet
 *
 * Hook it into Code.gs (wordle.gs; already done in the repo version):
 *   doPost: if (body.type === 'zadolzitve') return handleZadolzitve(body);
 *   doGet:  if (e && e.parameter && e.parameter.type === 'zadolzitve') return zadolzitveResults_(e.parameter.callback);
 * then Deploy → Manage deployments → edit → New version (same /exec URL).
 */
var ZADOLZITVE_ID = '1BOJ69kOgRVgBMld7jcmtxUqIrJrkXOXcyVFxvYiExW8';
var ZADOLZITVE_TAB = 'izbire';
var ZADOLZITVE = [ // [chore, places] – edit here to change the list (the site shows whatever this returns)
  ['Kuhinja + shramba', 5],
  ['Spodnji WC', 3],
  ['Hodniki (spodaj in zgoraj)', 3],
  ['Skupni prostor in oba tabuja', 3],
  ['Prostor za spanje zgodaj', 3],
  ['Zgornji WC', 3],
  ['Smeti', 2],
  ['Zunanjost/okolica in ognjišče', 3],
  ['Nosači opreme v avto', 3]
];

function zadolzitveSheet_() {
  var ss = SpreadsheetApp.openById(ZADOLZITVE_ID), sh = ss.getSheetByName(ZADOLZITVE_TAB);
  if (!sh) { sh = ss.insertSheet(ZADOLZITVE_TAB); sh.appendRow(['Čas', 'Email', 'Ime', 'Datum', 'Zadolžitev']); sh.setFrozenRows(1); }
  return sh;
}
function zadolzitveToday_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
/** Today's chores with the people on each (rows: sheet values incl. header) */
function zadolzitveState_(rows) {
  var date = zadolzitveToday_(), by = {};
  ZADOLZITVE.forEach(function (c) { by[c[0]] = []; });
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (cellDate_(r[3]) !== date || !by[String(r[4])]) continue;
    by[String(r[4])].push({ email: String(r[1]).toLowerCase(), name: String(r[2]) });
  }
  return { ok: true, date: date, chores: ZADOLZITVE.map(function (c) { return { name: c[0], cap: c[1], people: by[c[0]] }; }) };
}
function zadolzitveResults_(cb) {
  try { return json_(zadolzitveState_(zadolzitveSheet_().getDataRange().getValues()), cb); }
  catch (err) { return json_({ ok: false, error: String(err && err.message || err) }, cb); }
}

function handleZadolzitve(body) {
  try {
    var who = verifyToken_(body.credential), action = String(body.action || '');
    if (action !== 'pick' && action !== 'leave') return json_({ ok: false, error: 'bad_action' });
    var chore = String(body.chore || '');
    if (action === 'pick' && !ZADOLZITVE.some(function (c) { return c[0] === chore; })) return json_({ ok: false, error: 'neznana zadolžitev' });
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = zadolzitveSheet_(), rows = sh.getDataRange().getValues(), date = zadolzitveToday_();
      var mine = [], taken = 0, cap = 0;
      ZADOLZITVE.forEach(function (c) { if (c[0] === chore) cap = c[1]; });
      for (var i = 1; i < rows.length; i++) {
        if (cellDate_(rows[i][3]) !== date) continue;
        if (String(rows[i][1]).toLowerCase() === who.email) mine.push(i + 1);
        else if (String(rows[i][4]) === chore) taken++;
      }
      if (action === 'pick' && taken >= cap) { var full = zadolzitveState_(rows); full.ok = false; full.error = 'polno'; return json_(full); }
      for (var j = mine.length - 1; j >= 0; j--) sh.deleteRow(mine[j]); // one chore per player and day
      if (action === 'pick') sh.appendRow([new Date(), who.email, who.name, "'" + date, chore]);
      SpreadsheetApp.flush();
      return json_(zadolzitveState_(sh.getDataRange().getValues()));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
