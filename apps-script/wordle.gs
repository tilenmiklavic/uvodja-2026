// SCRIPT_VERSION: v7 (2026-10-30) - every Wordle guess logged to tab "poskusi"
/**
 * U Vodja 2026 – Wordle rezultati (Google Apps Script, bound to the results Sheet).
 * Sheet tab "rezultati", header row: Timestamp | Email | Name | Date | Guesses | Solved | Ms
 *
 * doPost  body (Content-Type: text/plain, JSON): {credential, date, guesses, solved, ms?, grid?}
 *         → verifies the sign-in (site session or Google ID token), allowlist, sanity, one row per email+date (first wins).
 * doGet   → {ok:true, results:[{email,name,date,guesses,solved,ms}]}  (?callback=fn for JSONP)
 *
 * Sessions: doPost {type:'session', credential} → {ok, session, exp}; see common.gs (siteSessionIssue_).
 * Guesses: doPost {type:'wordle-guess', credential, date, n, guess, pattern, t, dt} → tab "poskusi", one row per guess
 *         (n = 1–6; n = 0 = puzzle opened); the server time is recorded too, so the timing can't be faked.
 * Visits: doPost {type:'visit', credential, email?, name?, page, device, ts?} → tab "obiski"
 *         (Timestamp|Email|Name|Page|Device|Verified); invalid/expired token → accepted, Verified=false.
 * Stats: doPost {type:'visitstats', credential} → aggregates only, ONLY for a valid token in STATS_ADMINS
 *        (else {ok:false}); byDay = the same per day for the last 14 days. doGet?type=visits is disabled.
 *
 * Needs common.gs (and the other handler files) in the same project.
 * Deploy: Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
 */
var CLIENT_ID = '431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com';
var SHEET_NAME = 'rezultati';
var TZ = 'Europe/Ljubljana';
// Allowed: listed emails OR any verified @skavti.si address
var ALLOWED_EMAILS = ["jakob.gostisa@skavti.si", "nejka.volaric@skavti.si", "tilen.miklavic@skavti.si", "jakob.stele@skavti.si", "petra.zupan@skavti.si", "barbara.hrastar@skavti.si", "marko.pleterski@skavti.si", "tonka.kocjancic@skavti.si", "matej.gnidovec@skavti.si"];
var ALLOWED_DOMAIN = '@skavti.si';
// Puzzle dates (keep in sync with data/wordle.json; empty array = accept any date not in the future)
var PUZZLE_DATES = ["2026-10-12", "2026-10-13", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

function json_(obj, callback) {
  var txt = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][\w$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + txt + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Timestamp', 'Email', 'Name', 'Date', 'Guesses', 'Solved', 'Ms']);
  }
  if (!sh.getRange(1, 7).getValue()) sh.getRange(1, 7).setValue('Ms');
  return sh;
}

var STATS_ADMINS = ['tilen.miklavic@gmail.com', 'tilen.miklavic@skavti.si'];
function tokenInfo_(idToken) {
  if (!idToken) throw new Error('missing_credential');
  // Site session (common.gs): signed by this script, valid SITE_SESSION_DAYS
  if (String(idToken).indexOf(SITE_SESSION_PREFIX) === 0) {
    var s = siteSessionVerify_(idToken);
    if (!s) throw new Error('invalid_token');
    return { email: s.email, name: s.name || s.email };
  }
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('invalid_token');
  var info = JSON.parse(res.getContentText());
  if (info.aud !== CLIENT_ID) throw new Error('wrong_audience');
  if (String(info.email_verified) !== 'true') throw new Error('email_not_verified');
  if (Number(info.exp) * 1000 < Date.now()) throw new Error('token_expired');
  return { email: String(info.email || '').toLowerCase(), name: info.name || info.email };
}
function verifyToken_(idToken) {
  var t = tokenInfo_(idToken), email = t.email, info = { name: t.name };
  var ok = ALLOWED_EMAILS.indexOf(email) >= 0 || email.slice(-ALLOWED_DOMAIN.length) === ALLOWED_DOMAIN;
  if (!ok) throw new Error('not_allowed');
  return { email: email, name: info.name || email };
}

function cellDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v);
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.type === 'session') return siteSessionIssue_(body);
    if (body.type === 'visit') return logVisit_(body);
    if (body.type === 'wordle-guess') return logGuess_(body);
    if (body.type === 'visitstats') return visitStatsAuth_(body);
    if (body.type === 'preverba') return handlePreverba(body);
    if (body.type === 'stavnica') return handleStavnica(body);
    if (body.type === 'ocene') return handleOcene(body);
    if (body.type === 'analitika') return handleAnalitika(body);
    if (body.type === 'vprasanja') return handleVprasanja(body);
    var who = verifyToken_(body.credential);
    var date = String(body.date || '');
    var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'bad_date' });
    if (date > today) return json_({ ok: false, error: 'future_date' });
    if (PUZZLE_DATES.length && PUZZLE_DATES.indexOf(date) < 0) return json_({ ok: false, error: 'not_a_puzzle_date' });
    var guesses = Number(body.guesses);
    if (!(guesses >= 1 && guesses <= 6 && Math.floor(guesses) === guesses)) return json_({ ok: false, error: 'bad_guesses' });
    var solved = body.solved === true;
    // Solving time in ms (sent by the site's timer); empty when missing or implausible
    var ms = Math.floor(Number(body.ms));
    if (!(ms > 0 && ms < 86400000)) ms = '';

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = sheet_();
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][1]).toLowerCase() === who.email && cellDate_(rows[i][3]) === date) {
          return json_({ ok: true, duplicate: true });
        }
      }
      // Date stored as text ('2026-10-12) so Sheets doesn't convert it
      sh.appendRow([new Date(), who.email, who.name, "'" + date, guesses, solved, ms]);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.type === 'version') return json_({ ok: true, version: 'v7' });
  var cb = e && e.parameter && e.parameter.callback;
  if (e && e.parameter && e.parameter.type === 'visits') return json_({ ok: false, error: 'use_post' }, cb);
  try {
    var rows = sheet_().getDataRange().getValues();
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[1]) continue;
      out.push({ email: String(r[1]).toLowerCase(), name: String(r[2]), date: cellDate_(r[3]), guesses: Number(r[4]), solved: r[5] === true || String(r[5]).toUpperCase() === 'TRUE', ms: Number(r[6]) || null });
    }
    return json_({ ok: true, results: out }, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}

/* —— Every guess (tab "poskusi"): Čas | Email | Ime | Datum | Poskus | Beseda | Vzorec | Od začetka (s) | Od prejšnjega (s)
   n = 0 is "puzzle opened" (the timer itself starts at the first letter typed). Times are the player's own clock;
   column A is the server's clock. —— */
var GUESS_SHEET = 'poskusi';
function logGuess_(body) {
  var who = verifyToken_(body.credential);
  var date = String(body.date || ''), n = Number(body.n);
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return json_({ ok: false, error: 'bad_date' });
  if (PUZZLE_DATES.length && PUZZLE_DATES.indexOf(date) < 0) return json_({ ok: false, error: 'not_a_puzzle_date' });
  if (!(n >= 0 && n <= 6 && Math.floor(n) === n)) return json_({ ok: false, error: 'bad_n' });
  var guess = n ? String(body.guess || '').toLowerCase() : '(odprto)', pattern = n ? String(body.pattern || '') : '';
  if (n && !/^[a-zčšž]{5}$/.test(guess)) return json_({ ok: false, error: 'bad_guess' });
  if (n && !/^[GY.]{5}$/.test(pattern)) return json_({ ok: false, error: 'bad_pattern' });
  var sec = function (v) { v = Number(v); return v >= 0 && v < 86400000 ? Math.round(v / 100) / 10 : ''; };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(GUESS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GUESS_SHEET);
    sh.appendRow(['Čas', 'Email', 'Ime', 'Datum', 'Poskus', 'Beseda', 'Vzorec', 'Od začetka (s)', 'Od prejšnjega (s)']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), who.email, who.name, "'" + date, n, "'" + guess, "'" + pattern, n ? sec(body.t) : '', n ? sec(body.dt) : '']);
  return json_({ ok: true });
}

/* —— Page visits (tab "obiski") —— */
var VISIT_SHEET = 'obiski';
function visitSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VISIT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VISIT_SHEET);
    sh.appendRow(['Timestamp', 'Email', 'Name', 'Page', 'Device', 'Verified']);
  }
  return sh;
}
function clip_(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').slice(0, n); }
function logVisit_(body) {
  var who, verified = true;
  try { who = verifyToken_(body.credential); }
  catch (e0) { try { var a = tokenInfo_(body.credential); if (STATS_ADMINS.indexOf(a.email) >= 0) who = a; else throw e0; }
  catch (err) {
    verified = false;
    var em = clip_(body.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(em)) em = 'anon';
    who = { email: em, name: clip_(body.name, 80) || em };
  } }
  var page = clip_(body.page, 60).replace(/[^\w\-]/g, '') || 'unknown';
  var device = body.device === 'mobile' ? 'mobile' : 'desktop';
  var ts = new Date();
  var cts = Number(body.ts);
  if (cts && Math.abs(cts - ts.getTime()) < 6 * 3600 * 1000) ts = new Date(cts);
  // leading ' keeps Sheets from interpreting text (e.g. "=..." formulas)
  visitSheet_().appendRow([ts, "'" + who.email, "'" + who.name, "'" + page, device, verified]);
  return json_({ ok: true, verified: verified });
}
function visitStats_(cb) {
  try {
    var rows = visitSheet_().getDataRange().getValues();
    var perDay = {}, perPage = {}, perPerson = {}, total = 0, byDay = {};
    var since = Utilities.formatDate(new Date(Date.now() - 13 * 86400000), TZ, 'yyyy-MM-dd'); // byDay: last 14 days
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      total++;
      var d = r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
      perDay[d] = (perDay[d] || 0) + 1;
      var pg = String(r[3]); perPage[pg] = (perPage[pg] || 0) + 1;
      var em = String(r[1]).toLowerCase();
      var p = perPerson[em] || (perPerson[em] = { email: em, name: String(r[2]), count: 0, unverified: 0, mobile: 0 });
      p.count++;
      if (!(r[5] === true || String(r[5]).toUpperCase() === 'TRUE')) p.unverified++;
      if (r[4] === 'mobile') p.mobile++;
      if (d >= since) {
        var day = byDay[d] || (byDay[d] = { total: 0, perPage: {}, perPerson: {} });
        day.total++;
        day.perPage[pg] = (day.perPage[pg] || 0) + 1;
        var dp = day.perPerson[em] || (day.perPerson[em] = { email: em, name: String(r[2]), count: 0 });
        dp.count++;
      }
    }
    Object.keys(byDay).forEach(function (k) {
      var pp = byDay[k].perPerson;
      byDay[k].perPerson = Object.keys(pp).map(function (e) { return pp[e]; }).sort(function (a, b) { return b.count - a.count; });
    });
    var people = Object.keys(perPerson).map(function (k) { return perPerson[k]; }).sort(function (a, b) { return b.count - a.count; });
    return json_({ ok: true, total: total, perDay: perDay, perPage: perPage, perPerson: people, byDay: byDay }, cb);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) }, cb);
  }
}

function visitStatsAuth_(body) {
  try { if (STATS_ADMINS.indexOf(tokenInfo_(body.credential).email) < 0) return json_({ ok: false }); }
  catch (err) { return json_({ ok: false }); }
  return visitStats_();
}
