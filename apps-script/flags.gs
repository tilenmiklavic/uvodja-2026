/**
 * Page visibility switches (admins turn pages on/off on the site): Script property SITE_FLAGS = {"<page>": true|false}.
 * A page listed in SITE_FLAG_PAGES is hidden from everyone but admins until it is switched on.
 *
 * doGet  ?type=flags → {ok, flags:{opravila:false, trgovina:false, temu:false}}   (public)
 * doPost {type:'flags', credential, page, on} → {ok, flags}          (admins only: STATS_ADMINS or role admin)
 *
 * Hook it into Code.gs (wordle.gs; already done in the repo version):
 *   doPost: if (body.type === 'flags') return handleFlags(body);
 *   doGet:  if (e && e.parameter && e.parameter.type === 'flags') return json_({ ok: true, flags: siteFlags_() }, e.parameter.callback);
 */
var SITE_FLAG_PAGES = ['opravila', 'trgovina', 'temu']; // Zadolžitve, Trgovina, Temu Mode (makes the 🎪 toggle available; each user turns it on)

function siteFlags_() {
  var saved = {};
  try { saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('SITE_FLAGS') || '{}'); } catch (e) {}
  var out = {};
  SITE_FLAG_PAGES.forEach(function (p) { out[p] = saved[p] === true; });
  return out;
}
function handleFlags(body) {
  try {
    var who = tokenInfo_(body.credential), email = String(who.email).toLowerCase();
    var admin = (typeof STATS_ADMINS !== 'undefined' && STATS_ADMINS.indexOf(email) >= 0) || siteRole_(email) === 'admin';
    if (!admin) return json_({ ok: false, error: 'ni dostopa' });
    var page = String(body.page || '');
    if (SITE_FLAG_PAGES.indexOf(page) < 0) return json_({ ok: false, error: 'neznana stran' });
    var flags = siteFlags_();
    flags[page] = body.on === true;
    PropertiesService.getScriptProperties().setProperty('SITE_FLAGS', JSON.stringify(flags));
    return json_({ ok: true, flags: flags });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
