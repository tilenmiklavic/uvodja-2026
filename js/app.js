const state = {
  data: null,
  hideLogistics: true,
  query: "",
  openSessions: new Set(),
  personSlug: null,
  temaSlug: null,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugifyName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvePersonSlug(slug) {
  if (!slug || !state.data) return slug;
  if (state.data.people?.[slug]) return slug;
  const aliases = state.data.peopleAliases || {};
  return aliases[slug] || slug;
}

function findPerson(name) {
  if (!name || !state.data?.people) return null;
  const n = String(name).trim();
  const slug = resolvePersonSlug(slugifyName(n));
  if (state.data.people[slug]) return state.data.people[slug];
  const lower = n.toLowerCase();
  return Object.values(state.data.people).find((p) =>
    p.name.toLowerCase() === lower
    || (p.shortName && p.shortName.toLowerCase() === lower)
    || (p.aliases || []).some((a) => a === slugifyName(n))
  ) || null;
}

/* Site-wide display: first name only; Jakob Gostiša → "Jakob G.", Jakob Stele → "Jakob S.".
   Full name stays on person page titles (`#person-name`) and in link title= tooltips. */
function displayName(pOrName) {
  if (!pOrName) return "";
  if (typeof pOrName === "string") {
    const p = findPerson(pOrName);
    if (p) return displayName(p);
    // raw string: already short (Jakob G.) or first token
    const parts = pOrName.trim().split(/\s+/);
    if (parts.length >= 2 && /^[A-Za-zČŠŽĆĐčšžćđ]\.?$/.test(parts[1])) return `${parts[0]} ${parts[1].replace(/\.$/, "")}.`;
    return parts[0] || pOrName;
  }
  if (pOrName.shortName) return pOrName.shortName;
  const full = pOrName.name || "";
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2 && /^(Gostiša|Stele)$/i.test(parts[1])) return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
  return parts[0] || full;
}

function personLink(name, extraClass = "") {
  const p = findPerson(name);
  if (!p) return `<span class="${extraClass}">${esc(displayName(name))}</span>`;
  return `<a class="person-link ${extraClass}" href="#oseba-${esc(p.slug)}" title="${esc(p.name)}" data-person="${esc(p.slug)}">${esc(displayName(p))}</a>`;
}

function personLinkFull(personOrName, extraClass = "") {
  const p = typeof personOrName === "object" && personOrName
    ? (personOrName.slug ? (state.data?.people?.[personOrName.slug] || personOrName) : findPerson(personOrName.name))
    : findPerson(personOrName);
  if (!p) {
    const label = typeof personOrName === "object" ? (personOrName?.name || "") : personOrName;
    return `<span class="${extraClass}">${esc(displayName(label))}</span>`;
  }
  const full = p.name || personOrName?.name || "";
  if (p.slug && state.data?.people?.[p.slug]) {
    return `<a class="person-link ${extraClass}" href="#oseba-${esc(p.slug)}" title="${esc(full)}" data-person="${esc(p.slug)}">${esc(displayName(p))}</a>`;
  }
  return `<span class="${extraClass}">${esc(displayName(p))}</span>`;
}

function coverageBadge(status) {
  const map = {
    pripravljeno: "Pripravljeno",
    potrebuje_dopolnitev: "Potrebuje dopolnitev",
    ni_mikronacrta: "Ni mikronačrta",
  };
  const label = map[status] || status || "";
  return `<span class="cov-badge ${esc(status || "")}">${esc(label)}</span>`;
}

/* Overview readiness: 2026 mikronačrt exists → Pripravljeno (even if some Vsebine are Delno/Manjka). Detail pages keep full coverage status. */
function temaOverviewReady(t) {
  return !!(t?.hasMikronacrt || (t?.status && t.status !== "ni_mikronacrta"));
}
function overviewReadyBadge(tOrStatus) {
  const ready = typeof tOrStatus === "object" ? temaOverviewReady(tOrStatus) : (tOrStatus && tOrStatus !== "ni_mikronacrta");
  return `<span class="cov-badge ${ready ? "pripravljeno" : "ni_pripravljeno"}">${ready ? "Pripravljeno" : "Ni pripravljeno"}</span>`;
}

function coverageCountsLabel(counts) {
  if (!counts) return "";
  const t = counts.total || 0;
  const v = counts.vkljuceno || 0;
  return `${v}/${t}`;
}

function temaHref(slug) {
  return `#tema-${slug}`;
}

function findTemaBySlug(slug) {
  return state.data?.temas?.[slug] || null;
}

function findTemaForSession(s) {
  if (!s || !state.data?.temas) return null;
  if (s.temaSlug && state.data.temas[s.temaSlug]) return state.data.temas[s.temaSlug];
  if (s.programKey) {
    return Object.values(state.data.temas).find((t) => t.programKey === s.programKey) || null;
  }
  return null;
}

function tkBadge(name) {
  if (!name) return "";
  return `<span class="tk-badge" title="Time keeper dneva"><span class="ico" aria-hidden="true">⏱</span> Time keeper: ${personLink(name)}</span>`;
}

async function loadData() {
  try { const a = await fetch("data/access.json", { cache: "no-store" }); state.access = a.ok ? await a.json() : null; } catch { state.access = null; }
  const res = await fetch("data/data.json");
  if (!res.ok) throw new Error("Ne morem naložiti data/data.json");
  state.data = await res.json();
  // TEMP mock day (remove 13.10.2026): optional data/mock_day.json, Časovnica only (ttDays), never merged into data.days
  state.mockDays = [];
  try {
    const m = await fetch("data/mock_day.json", { cache: "no-store" });
    if (m.ok) state.mockDays = ((await m.json()).days || []).map((d) => ({ ...d, mock: true }));
  } catch {}
}

/* Days shown in Časovnica (timeline, strip, minimap): real days + optional TEMP mock days, sorted by date */
function ttDays() {
  const mock = state.mockDays || [];
  return mock.length ? [...mock, ...state.data.days].sort((a, b) => a.date.localeCompare(b.date)) : state.data.days;
}

function closeNavMore(focusToggle = false) {
  const t = $("#nav-more-toggle"), m = $("#nav-more");
  if (!t || !m) return;
  m.classList.remove("open");
  t.setAttribute("aria-expanded", "false");
  if (focusToggle) t.focus();
}

function syncHeaderHeight() {
  const h = $(".site-header")?.offsetHeight || 60;
  document.documentElement.style.setProperty("--hdr-h", `${h}px`);
}

/* Account dropdown (avatar in header / row in ≡ menu); delegated so it survives applyAuth re-renders */
function setUserMenu(open) {
  const m = $("#user-menu"), b = $("#user-btn");
  if (!m || !b) return;
  m.hidden = !open;
  b.setAttribute("aria-expanded", open ? "true" : "false");
}
document.addEventListener("click", (e) => {
  if (e.target.closest("#user-btn")) { e.stopPropagation(); setUserMenu($("#user-menu")?.hidden); return; }
  if (e.target.closest("[data-user-close]")) { setUserMenu(false); closeNavMore(); return; }
  if (!e.target.closest("#user-menu")) setUserMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#user-menu") && !$("#user-menu").hidden) { setUserMenu(false); $("#user-btn")?.focus(); }
});

function bindNavMore() {
  syncHeaderHeight();
  window.addEventListener("resize", syncHeaderHeight);
  const t = $("#nav-more-toggle"), m = $("#nav-more");
  if (!t || !m) return;
  t.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !m.classList.contains("open");
    m.classList.toggle("open", open);
    t.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) m.querySelector(".tab")?.focus();
  });
  document.addEventListener("click", (e) => {
    if (m.classList.contains("open") && !m.contains(e.target) && e.target !== t) closeNavMore();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && m.classList.contains("open")) closeNavMore(true);
  });
}

/* —— Google sign-in (account distinction only, NOT security) + page allowlist (data/access.json) —— */
const GSI_CLIENT_ID = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const ALL_PAGES = ["domov", "casovnica", "teme", "gradiva", "ekipa", "os", "uu", "preverbe", "zabava", "analitika"];

function loadUser() {
  try { const u = JSON.parse(localStorage.getItem("uvodja.user") || "null"); return u?.email ? u : null; } catch { return null; }
}
function decodeJwt(token) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
/* Role of an e-mail per data/access.json (users → role, else defaultRole). Tilen's gmail is admin unless listed (see VISIT_ADMIN_SHA). */
function roleOf(email) {
  const acc = state.access || {};
  const e = String(email || "").toLowerCase();
  if (!e) return null;
  const listed = Object.entries(acc.users || {}).find(([k]) => k.toLowerCase() === e)?.[1];
  if (listed) return listed;
  // Legacy access.json (groups + rules, no roles): group name is the role
  const group = Object.entries(acc.groups || {}).find(([, list]) => list.some((x) => String(x).toLowerCase() === e))?.[0];
  if (group) return group;
  if (state.visitAdmin === e) return "admin";
  return acc.defaultRole || "uu";
}
const SIM_ROLES = ["admin", "svod", "uu"];
/* Admin-only "view as" role (per tab session); ignored for everyone else */
function effectiveRole(email) {
  const real = roleOf(email);
  return real === "admin" && SIM_ROLES.includes(state.simRole) ? state.simRole : real;
}
function pagesForRole(role) {
  if (!state.access) return new Set(ALL_PAGES);
  const acc = state.access;
  if (!acc.roles) { // legacy format
    const pages = role === "admin" && !acc.groups?.admin ? ["*"] : (acc.rules || []).filter((x) => (x.groups || []).includes(role)).flatMap((x) => x.pages || []);
    const list = pages.length ? pages : (acc.default || []);
    const set = new Set(list.includes("*") ? ALL_PAGES : list);
    if (set.delete("zadolzitve")) set.add("teme");
    return set;
  }
  const r = acc.roles[role];
  if (!r) return new Set();
  const allow = r.allow || [];
  const set = new Set(!allow.length || allow.includes("*") ? ALL_PAGES : allow);
  if (set.delete("zadolzitve")) set.add("teme"); // Zadolžitve now live on the Teme page
  (r.deny || []).forEach((x) => (x === "*" ? set.clear() : set.delete(x)));
  return set;
}
function allowedPages(email) {
  return email ? pagesForRole(effectiveRole(email)) : new Set();
}
function canSee(page) {
  if (page === "noaccess") return true;
  return !!state.user && state.allowed?.has(page);
}
function personForUser(u) {
  if (!u) return null;
  const people = state.data?.people || {};
  const slug = state.access?.people?.[u.email.toLowerCase()];
  if (slug && people[slug]) return people[slug];
  const norm = (x) => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return Object.values(people).find((p) => norm(p.name) === norm(u.name)) || null;
}
function onCredential(resp) {
  try {
    const c = decodeJwt(resp.credential);
    // credential (raw ID token, ~1h) kept for Wordle result submission; credExp in ms
    const u = { email: c.email, name: c.name || c.email, picture: c.picture || "", sub: c.sub, credential: resp.credential, credExp: (c.exp || 0) * 1000 };
    localStorage.setItem("uvodja.user", JSON.stringify(u));
    const wasSignedIn = !!state.user;
    if (wasSignedIn && state.user.email.toLowerCase() !== String(c.email || '').toLowerCase()) { (state.tokenWaiters || []).splice(0).forEach((f) => f(null)); return; }
    state.user = u;
    (state.tokenWaiters || []).splice(0).forEach((f) => f(u.credential));
    applyAuth();
    if (!wasSignedIn) applyHash();
    wdFlushQueue();
  } catch (err) {
    console.error("Sign-in failed", err);
    const n = $("#auth-note"); if (n) n.textContent = `Prijava ni uspela (${err?.message || err}). Poskusi znova.`;
  }
}
window.onGsiCredential = onCredential;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sim-role]");
  if (!b || roleOf(state.user?.email) !== "admin") return;
  state.simRole = b.dataset.simRole === "admin" ? null : b.dataset.simRole;
  try { state.simRole ? sessionStorage.setItem("uvodja.simRole", state.simRole) : sessionStorage.removeItem("uvodja.simRole"); } catch {}
  setUserMenu(false); closeNavMore();
  applyAuth(); applyHash();
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-signout]")) { e.preventDefault(); signOut(); } }); // global reference for GIS (and for testing)
function signOut() {
  setUserMenu(false); closeNavMore();
  try { localStorage.removeItem("uvodja.user"); } catch {}
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
  state.user = null;
  applyAuth();
}
function initGsi(tries = 0) {
  const g = window.google?.accounts?.id;
  if (!g) { if (tries < 50) setTimeout(() => initGsi(tries + 1), 200); else { const n = $("#auth-note"); if (n) n.textContent = "Google prijave ni bilo mogoče naložiti."; } return; }
  if (!state.gsiReady) {
    g.initialize({ client_id: GSI_CLIENT_ID, callback: (r) => window.onGsiCredential(r), auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true });
    state.gsiReady = true;
  }
  const btn = $("#gsi-button");
  if (btn && !state.user) {
    btn.innerHTML = "";
    $("#auth-note").textContent = "";
    g.renderButton(btn, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "sl" });
    g.prompt(); // One Tap / silent auto-select
  }
}
function applyAuth() {
  const u = state.user;
  checkVisitAdmin(u);
  state.allowed = allowedPages(u?.email);
  const sim = u && roleOf(u.email) === "admin" && effectiveRole(u.email) !== "admin" ? effectiveRole(u.email) : null;
  let sb = $("#sim-banner");
  if (sim && !sb) { sb = document.createElement("div"); sb.id = "sim-banner"; sb.className = "sim-banner"; document.body.prepend(sb); }
  if (sb) { sb.hidden = !sim; if (sim) sb.innerHTML = `<span title="Simulacija pogleda za admina">Pogled kot <strong>${sim.toUpperCase()}</strong></span> <button type="button" class="sim-exit" data-sim-role="admin">Nazaj na admin</button>`; }
  document.body.classList.toggle("auth-locked", !u);
  $("#auth-gate").hidden = !!u;
  $$(".tab[data-tab]").forEach((b) => { b.hidden = !!u && !state.allowed.has(b.dataset.tab); });
  $$("[data-tab-link]").forEach((a) => { if (a.dataset.tabLink !== "domov") a.hidden = !!u && !state.allowed.has(a.dataset.tabLink); });
  const nu = $("#nav-user"), ar = $("#account-row");
  const nw = $("#noaccess-who");
  if (nw) nw.textContent = u ? `Prijavljen/a kot ${u.name} (${u.email}).` : "";
  const nh = $("#noaccess-home"); if (nh) nh.hidden = !u || !state.allowed.has("domov");
  if (!u) { nu.hidden = true; ar.hidden = true; initGsi(); return; }
  const person = personForUser(u);
  const pic = u.picture || person?.photo || "";
  const av = pic
    ? `<img class="avatar avatar-sm" src="${esc(pic)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="avatar avatar-sm avatar-initials" aria-hidden="true">${esc(initials(u.name))}</span>`;
  nu.hidden = false;
  const own = person && state.allowed.has("ekipa")
    ? `<a class="user-menu-item" href="#oseba-${esc(person.slug)}" data-user-close>Moja stran</a>` : "";
  nu.innerHTML = `<button type="button" class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false" aria-controls="user-menu" title="${esc(u.name)} · ${esc(u.email)}">${av}<span class="nav-user-name">${esc(u.name)}</span></button>
    <div class="user-menu" id="user-menu" hidden>
      <p class="user-menu-name">${esc(u.name)}</p><p class="user-menu-email">${esc(u.email)}</p>
      ${roleOf(u.email) === "admin" ? `<div class="sim-switch" role="group" aria-label="Pogled kot"><span class="sim-label">Pogled kot</span>${SIM_ROLES.map((r) =>
        `<button type="button" class="sim-opt" data-sim-role="${r}" aria-pressed="${effectiveRole(u.email) === r}">${r.toUpperCase()}</button>`).join("")}</div>` : ""}
      ${own}<button type="button" class="user-menu-item user-signout" data-signout>Odjava</button>
    </div>`;
  ar.hidden = false;
  const who = person && state.allowed.has("ekipa")
    ? `<a href="#oseba-${esc(person.slug)}">${esc(u.name)}</a>` : esc(u.name);
  ar.innerHTML = `${av}<span>Prijavljen/a kot <strong>${who}</strong> <span class="muted-text">(${esc(u.email)})</span></span><button type="button" class="btn ghost" data-signout>Odjava</button>`;
}

let currentTab = "";
function landingPage() {
  if (canSee("casovnica")) return "casovnica";
  return ALL_PAGES.find((p) => canSee(p)) || null;
}
function setTab(name) {
  if (!canSee(name) && state.user && !state.visitAdminPending) {
    const land = landingPage();
    if (land && land !== name) { history.replaceState(null, "", `#${land}`); return setTab(land); }
  }
  const blocked = !canSee(name);
  if (blocked) name = "noaccess";
  $$(".tab").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.tab === name ? "true" : "false");
  });
  $$(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
  if (name === "ekipa") ensureWorkloadChart();
  state.wordleActive = name === "zabava";
  if (name === "zabava") renderWordle();
  $("#nav-more-toggle")?.classList.toggle("has-active", !!$(`#nav-more [data-tab="${name}"]`));
  closeNavMore();
  const hash = location.hash.replace(/^#/, "");
  logVisit(blocked ? "noaccess" : (/^(oseba|tema)-/.test(hash) ? hash.split("-")[0] : name));
  if (name === "analitika") renderVisits();
  if (name === "preverbe") renderPreverbe(/^preverbe\/(generalno)$/.exec(location.hash.replace(/^#/, ""))?.[1] || "teme");
  if (name === "uu") renderUU(/^uu\/(.+)$/.exec(location.hash.replace(/^#/, ""))?.[1] || null);
  if (name === "os") renderOs(/^os\/(\d+)$/.exec(location.hash.replace(/^#/, ""))?.[1] || null);
  currentTab = name;
  if (!blocked && !hash.startsWith("sid-") && !hash.startsWith("os/") && !hash.startsWith("uu/") && !hash.startsWith("preverbe/") && !hash.startsWith("day-") && !hash.startsWith("oseba-") && !hash.startsWith("tema-")) {
    history.replaceState(null, "", name === "casovnica" ? "#casovnica" : `#${name}`);
  }
}

function categoryBadge(cat) {
  if (!cat || cat === "logistics") return "";
  const label = {
    tema: "tema",
    redna: "tema",
    izbirna: "izbirna",
    dodatna: "dodatna",
    activity: "aktivnost",
  }[cat] || cat;
  const cls = cat === "redna" ? "tema" : cat;
  return `<span class="badge ${cls}">${label}</span>`;
}

/* Meals: logistics entries whose title starts with a meal word → type "obrok" (JS-side so daily sync keeps it) */
const MEAL_RE = /^(zajtrk|kosilo|ve[čc]erja|malica|zadnja ve[čc]erja|sladoled)/i;
function isMeal(s) {
  return s.kind === "logistics" && MEAL_RE.test((s.title || "").trim());
}
function entryType(s) {
  return isMeal(s) ? "obrok" : s.kind;
}

function isTema(s) {
  return !!s.isTema || ["tema", "redna", "izbirna", "dodatna"].includes(s.category);
}

function literaturaBlock(s) {
  const items = [];
  const m = s.mikronacrt;
  if (m?.status === "exists" && m.url) {
    items.push(`<li class="lit-main">
      <span class="lit-tag">Mikronačrt · Glavni vir</span>
      <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || "Mikronačrt 2026")}</a>
    </li>`);
  } else if (m?.status === "missing") {
    items.push(`<li class="lit-missing" title="Doesn't exist">
      <span class="lit-tag" style="background:var(--warn);color:var(--navy-deep)">Mikronačrt</span>
      <span>Mikronačrt — Ne obstaja</span>
    </li>`);
  }
  for (const x of (s.sources || []).filter((x) => x?.url)) {
    items.push(`<li class="lit-secondary"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`);
  }
  if (!items.length) {
    return `<p class="empty-detail">Ni povezav na literaturo.</p>`;
  }
  return `<ul class="lit-list">${items.join("")}</ul>`;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function eventBounds() {
  const dr = state.data.meta?.dateRange || {};
  // Start of first event day 00:00 local; end of last day 23:59:59 local
  const start = dr.start ? new Date(`${dr.start}T00:00:00`) : null;
  const end = dr.end ? new Date(`${dr.end}T23:59:59`) : null;
  return { start, end, dr };
}

function tickCountdown() {
  const label = $("#countdown-label");
  const units = $("#countdown-units");
  if (!label || !units) return;
  const { start, end } = eventBounds();
  if (!start || !end) { label.textContent = ""; units.innerHTML = ""; return; }
  const now = new Date();
  let mode, target;
  if (now < start) { mode = "before"; target = start; label.textContent = "Do začetka"; }
  else if (now <= end) { mode = "during"; label.textContent = "V teku"; units.innerHTML = `<span class="cd-live">Usposabljanje poteka</span>`; return; }
  else { mode = "after"; label.textContent = "Končano"; units.innerHTML = `<span class="cd-done">Usposabljanje je zaključeno</span>`; return; }
  const ms = Math.max(0, target - now);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  units.innerHTML = [
    ["dni", days], ["ur", hours], ["min", mins], ["s", secs],
  ].map(([u, v]) => `<span class="cd-unit"><strong>${pad2(v)}</strong><em>${u}</em></span>`).join("");
}

function startCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  tickCountdown();
  state.countdownTimer = setInterval(tickCountdown, 1000);
}

function renderHome() {
  const { meta, days, temasList } = state.data;
  const { dr } = eventBounds();
  const datesEl = $("#home-dates");
  if (datesEl) {
    const fmt = (iso) => iso ? `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}` : "";
    datesEl.textContent = `${fmt(dr.start)} – ${fmt(dr.end)} · ${(meta.weekends || []).map((w) => w.label).join(" · ")}`;
  }
  startCountdown();

  const ready = (temasList || []).filter((t) => temaOverviewReady(t)).length;
  const totalT = (temasList || []).length || 1;
  const tPct = Math.round((ready / totalT) * 100);
  const tc = $("#prog-teme-count"); if (tc) tc.textContent = `${ready} / ${totalT}`;
  const tf = $("#prog-teme-fill"); if (tf) tf.style.width = `${tPct}%`;
  const tcap = $("#prog-teme-cap"); if (tcap) tcap.textContent = `Mikronačrti: ${ready} / ${totalT} pripravljenih`;

  const zp = meta.zadolzitveProgress || {};
  const zDone = zp.done || 0;
  const zTotal = zp.total || 0;
  const zPct = zTotal ? Math.round((zDone / zTotal) * 100) : 0;
  const zc = $("#prog-zad-count"); if (zc) zc.textContent = `${zDone} / ${zTotal}`;
  const zf = $("#prog-zad-fill"); if (zf) zf.style.width = `${zPct}%`;
  const zcap = $("#prog-zad-cap");
  if (zcap) {
    zcap.textContent = zp.hasColumn
      ? `Zadolžitve: ${zDone} / ${zTotal} opravljenih`
      : "V tabeli Zadolžitve še ni stolpca Opravljeno";
  }

  $("#home-weekends").innerHTML = (meta.weekends || []).map((w) => {
    const wdays = days.filter((d) => d.weekend === w.num);
    return `<article class="card home-weekend">
      <h3>${esc(w.label)}</h3>
      <p class="muted-text">${esc(w.dates)}</p>
      <ul class="plain-list compact">
        ${wdays.map((d) => `<li><a href="#day-${d.id}" data-goto-day="${d.id}">${esc(d.weekday)} ${Number(d.date.slice(8))}. ${Number(d.date.slice(5, 7))}.</a>${d.timekeeper ? ` <span class="muted-text">· ⏱ ${esc(displayName(d.timekeeper))}</span>` : ""}</li>`).join("")}
      </ul>
    </article>`;
  }).join("");
  $$("[data-goto-day]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setTab("casovnica");
      openDay(a.dataset.gotoDay, true);
    });
  });
}

function sessionMatchesQuery(s, q) {
  if (!q) return true;
  const blob = [
    s.title, s.start, s.end, ...(s.trainers || []),
    ...(s.goals || []), ...(s.contents || []), ...(s.notes || []),
    s.category, s.kind, s.mikronacrt?.status, s.mikronacrt?.title,
  ].join(" ").toLowerCase();
  return q.split(/\s+/).every((part) => blob.includes(part));
}

/* —— Časovnica timeline: day strip (mobile), scroll spy, jump-to-day —— */
const MOBILE_MQ = window.matchMedia("(max-width: 860px)");
const isMobile = () => MOBILE_MQ.matches;

function renderDayStrip() {
  const strip = $("#day-strip");
  if (!strip) return;
  const searching = !!state.query.trim();
  strip.style.gridTemplateColumns = `repeat(${ttDays().length}, minmax(0, 1fr))`;
  strip.innerHTML = ttDays().map((d) => {
    const sel = !searching && d.id === state.mobileDay;
    return `<button type="button" class="ds-chip${sel ? " active" : ""}" data-day="${d.id}" aria-pressed="${sel}">` +
      `<span class="ds-wd">${esc(d.weekday.slice(0, 3))}</span><span class="ds-date">${Number(d.date.slice(8))}. ${Number(d.date.slice(5, 7))}.</span></button>`;
  }).join("");
  strip.classList.toggle("searching", searching);
  strip.querySelectorAll(".ds-chip").forEach((b) => b.addEventListener("click", () => jumpToDay(b.dataset.day)));
}

/* Today if it's an event day, else the next upcoming event day (null once the event is over) → filled timeline dot */
function upcomingDayId() {
  const n = new Date();
  const today = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
  return ttDays().find((d) => d.date >= today)?.id || null;
}

/* Clear search (if any) and scroll the continuous timeline to a day */
function jumpToDay(dayId) {
  if (state.query.trim()) {
    state.query = "";
    $("#tt-search").value = "";
    renderTimetable();
  }
  openDay(dayId, true);
}

function scrollOffset() {
  return ($(".site-header")?.offsetHeight || 0) + (isMobile() ? ($("#day-strip")?.offsetHeight || 0) : 0) + 8;
}

function scrollToEl(el, behavior = "smooth") {
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - scrollOffset(), behavior });
}

/* Scroll spy: highlight the day currently in view (strip chip + minimap row) */
function setActiveDay(id) {
  if (!id || id === state.mobileDay) return;
  state.mobileDay = id;
  $$("#day-strip .ds-chip").forEach((b) => {
    const on = !state.query.trim() && b.dataset.day === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $$("#day-nav .dn-row[data-day]").forEach((a) => a.classList.toggle("active", a.dataset.day === id));
}
function spyDay() {
  if (state.spyLock && Date.now() < state.spyLock) return;
  if ($("#tab-casovnica")?.hidden) return;
  const off = scrollOffset() + 4;
  let cur = null;
  for (const el of $$("#timetable-tree .tl-day:not(.hidden-by-filter)")) {
    if (el.getBoundingClientRect().top <= off) cur = el.dataset.dayId;
    else break;
  }
  if (!cur) cur = $("#timetable-tree .tl-day:not(.hidden-by-filter)")?.dataset.dayId;
  setActiveDay(cur);
}

function renderDayNav() {
  const nav = $("#day-nav");
  let html = "";
  let lastW = null;
  for (const d of ttDays()) {
    if (d.weekend !== lastW) {
      html += `<span class="wk">${d.weekend}. vikend</span>`;
      lastW = d.weekend;
    }
    const tk = d.timekeeper
      ? `<span class="dn-tk" title="Time keeper dneva"><span aria-hidden="true">⏱</span> ${personLink(d.timekeeper, "sidebar-person")}</span>`
      : `<span class="dn-tk dn-tk-none" title="Time keeper dneva"><span aria-hidden="true">⏱</span> —</span>`;
    html += `<div class="dn-row" data-day="${d.id}"><a class="dn-day" href="#day-${d.id}">${d.weekday} <span class="dn-date">${Number(d.date.slice(8))}. ${Number(d.date.slice(5, 7))}.</span></a>${tk}</div>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll(".dn-row[data-day]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".person-link")) return;
      e.preventDefault();
      openDay(row.dataset.day, true);
    });
  });
}

/* Visibility of a session: desktop = hideLogistics filter; mobile = all, or Teme only when the toggle is on */
function sessionVisible(s, q) {
  if (isMobile()) {
    if (state.temaOnly && !isTema(s)) return false;
  } else if (state.hideLogistics && s.kind === "logistics") return false;
  return sessionMatchesQuery(s, q);
}

function syncTemaOnlyBtn() {
  $$(".tema-only-btn").forEach((b) => b.setAttribute("aria-pressed", state.temaOnly ? "true" : "false"));
}

/* Current-time line (Europe/Ljubljana) on today's day: inside the running card or between cards, proportionally */
function ljNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), label: `${parts.hour}:${parts.minute}` };
}
function toMin(t) { const [h, m] = String(t || "").split(/[:.]/).map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; }
function placeNowLine() {
  $$(".tl-now").forEach((n) => n.remove());
  const now = ljNow();
  const sec = $(`#timetable-tree .tl-day[data-date="${now.date}"]:not(.hidden-by-filter)`);
  const box = sec?.querySelector(".tl-events");
  if (!box) return;
  const cards = [...box.querySelectorAll(":scope > .session")].map((el) => ({ el, a: toMin(el.dataset.start), b: toMin(el.dataset.end) }))
    .filter((c) => c.a != null);
  if (!cards.length) return;
  let y = null;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], top = c.el.offsetTop, h = c.el.offsetHeight;
    let b = c.b ?? c.a; if (b < c.a) b += 1440;
    if (now.min < c.a) {
      if (i === 0) { y = top - 4; break; }
      const p = cards[i - 1], pEnd = p.el.offsetTop + p.el.offsetHeight;
      let pb = p.b ?? p.a; if (pb < p.a) pb += 1440;
      const f = c.a > pb ? Math.min(1, Math.max(0, (now.min - pb) / (c.a - pb))) : 0.5;
      y = pEnd + f * (top - pEnd); break;
    }
    if (now.min < b) { y = top + (b > c.a ? (now.min - c.a) / (b - c.a) : 0) * h; break; }
  }
  if (y == null) { const l = cards[cards.length - 1].el; y = l.offsetTop + l.offsetHeight + 4; }
  const line = document.createElement("div");
  line.className = "tl-now";
  line.style.top = `${Math.round(y)}px`;
  line.setAttribute("aria-label", `Zdaj ${now.label}`);
  line.innerHTML = `<span class="tl-now-label">${now.label}</span>`;
  box.appendChild(line);
}

/* Časovnica: one continuous vertical timeline (date column | line + dot | entry cards) */
function renderTimetable() {
  const root = $("#timetable-tree");
  const q = state.query.trim().toLowerCase();
  const days = ttDays();
  const visibleSessions = days.flatMap((d) => d.sessions.filter((s) => sessionVisible(s, q)));
  $("#tt-summary").textContent =
    q ? `Iskanje »${state.query.trim()}« (${visibleSessions.length})` : "";
  const upcoming = upcomingDayId();
  let lastW = null;
  let prevDate = null;
  let prevMock = false;
  root.innerHTML = days.map((day) => {
    const sessions = day.sessions.filter((s) => sessionVisible(s, q));
    const dayHidden = q && sessions.length === 0;
    // Gap between consecutive shown days that are > 1 day apart: dashed line + "… N dni …"
    let gap = "";
    if (!dayHidden) {
      if (prevDate) {
        const between = Math.round((Date.parse(`${day.date}T12:00:00Z`) - Date.parse(`${prevDate}T12:00:00Z`)) / 86400000) - 1;
        // fading line; sea monster (CGP okraski) only between real event days, not next to the TEST day
        const art = !prevMock && !day.mock;
        if (between >= 1 && !q) gap = `<div class="tl-gap${art ? " has-art" : ""}" aria-hidden="true">${art ? `<img class="tl-gap-art" src="assets/logos/morska-posast.webp" alt="" loading="lazy" width="720" height="294" />` : ""}</div>`;
      }
      prevDate = day.date;
      prevMock = !!day.mock;
    }
    const wk = !dayHidden && day.weekend && day.weekend !== lastW ? `<span class="tl-wk">${day.weekend}. vikend</span>` : "";
    if (!dayHidden) lastW = day.weekend;
    return `${gap}
      <section class="tl-day${dayHidden ? " hidden-by-filter" : ""}${day.id === upcoming ? " is-upcoming" : ""}" id="day-${day.id}" data-day-id="${day.id}" data-date="${day.date}" aria-label="${esc(day.label)}">
        <button type="button" class="tl-date" data-jump-day="${day.id}" title="${esc(day.label)}">
          ${wk}<span class="tl-num">${pad2(Number(day.date.slice(8)))}</span><span class="tl-wd">${esc(day.weekday.slice(0, 3).toUpperCase())}</span>
          ${day.timekeeper ? `<span class="tl-tk" title="Time keeper dneva"><span class="tl-tk-ico" aria-hidden="true">⏱ </span>${esc(displayName(day.timekeeper))}</span>` : ""}
        </button>
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-events">
          ${sessions.map((s) => renderSession(s)).join("") || `<p class="empty-detail">Ni vnosov za ta filter.</p>`}
        </div>
      </section>`;
  }).join("") + (q && !visibleSessions.length ? `<p class="empty-detail">Ni zadetkov.</p>` : "");
  renderDayStrip();
  syncTemaOnlyBtn();
  placeNowLine();
  root.querySelectorAll("details.session").forEach((el) => {
    el.addEventListener("toggle", () => {
      const id = el.dataset.sessionId;
      el.querySelector(":scope > summary")?.setAttribute("aria-expanded", el.open ? "true" : "false");
      if (el.open) state.openSessions.add(id);
      else state.openSessions.delete(id);
      if (el.open) history.replaceState(null, "", `#sid-${id}`);
    });
  });
}

function renderSession(s) {
  const open = state.openSessions.has(s.id);
  const tema = isTema(s);
  const temaObj = findTemaForSession(s);
  const izbirneRelated = (s.isIzbirneBlock && (state.data.izbirneBlocks || [])
    .find((b) => b.sessionId === s.id)?.relatedTemas) || [];

  // Cilji stay in data.json for search / future use — not rendered (layout clutter).
  const contents = s.contents?.length
    ? `<ul>${s.contents.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
    : `<p class="empty-detail">Predlagane vsebine niso navedene.</p>`;

  const notes = s.notes?.length
    ? `<ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : "";

  // Collapsed card = title + time (+ people chips on Teme); type shown by card colour. Readiness badges only on Tema pages.

  let temaActions = "";
  if (!temaObj && izbirneRelated.length) {
    temaActions = `<div class="tema-actions izbirne-links">
      <span class="muted-text">Teme v bloku:</span>
      ${izbirneRelated.map((r) =>
        `<a class="btn ghost tema-open-btn" href="${temaHref(r.slug)}" data-tema="${esc(r.slug)}">${esc(r.title)}</a>`
      ).join(" ")}
    </div>`;
  }

  const titleHtml = temaObj
    ? `<a class="session-title-link" href="${temaHref(temaObj.slug)}" data-tema="${esc(temaObj.slug)}">${esc(s.title)}</a>`
    : esc(s.title);

  let courseBody;
  if (tema) {
    courseBody = `
        ${temaActions}
        <div class="detail-grid detail-grid-tema">
          <div class="detail-block detail-wide"><h4>Vsebine</h4>${contents}</div>
        </div>
      `;
  } else if (notes) {
    courseBody = `<div class="detail-block" style="margin-top:.9rem"><h4>Opomba</h4>${notes}</div>`;
  } else {
    courseBody = `<p class="empty-detail" style="margin-top:.9rem">Brez dodatnih podrobnosti v časovnici.</p>`;
  }

  return `
    <details data-start="${esc(s.start)}" data-end="${esc(s.end)}" class="session kind-${entryType(s)}${tema ? " is-tema" : ""} cat-${esc(s.category || "none")}" id="sid-${s.id}" data-session-id="${s.id}" ${open ? "open" : ""}>
      <summary class="session-header" role="button" tabindex="0" aria-expanded="${open ? "true" : "false"}">
        <div class="sh-row1">
          <p class="session-title">${titleHtml}</p>
          <span class="time-badge">${esc(s.start)} – ${esc(s.end)}</span>
        </div>
        ${(s.trainers || []).length ? `<div class="sh-people">${s.trainers.map((t) => personLink(t, "trainer-pill")).join("")}</div>` : ""}
      </summary>
      <div class="session-body">
        ${courseBody}
      </div>
    </details>`;
}

function openDay(dayId, scroll = false) {
  state.mobileDay = null;
  setActiveDay(dayId);
  const el = document.getElementById(`day-${dayId}`);
  if (el && scroll) {
    state.spyLock = Date.now() + 900;
    requestAnimationFrame(() => scrollToEl(el));
  }
  history.replaceState(null, "", `#day-${dayId}`);
}

function openSession(sessionId) {
  const day = ttDays().find((d) => d.sessions.some((s) => s.id === sessionId));
  if (!day) return;
  state.openSessions.add(sessionId);
  state.hideLogistics = false;
  $("#hide-logistics").checked = false;
  const target = day.sessions.find((s) => s.id === sessionId);
  if (state.temaOnly && target && !isTema(target)) { state.temaOnly = false; syncTemaOnlyBtn(); }
  if (state.query.trim() && target && !sessionMatchesQuery(target, state.query.trim().toLowerCase())) {
    state.query = ""; $("#tt-search").value = "";
  }
  renderTimetable();
  state.mobileDay = null;
  setActiveDay(day.id);
  const el = document.getElementById(`sid-${sessionId}`);
  if (el) {
    el.open = true;
    el.classList.add("highlight-pulse");
    state.spyLock = Date.now() + 900;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  history.replaceState(null, "", `#sid-${sessionId}`);
}

function showTemeList() {
  state.temaSlug = null;
  const listView = $("#teme-list-view");
  const temaView = $("#tema-view");
  if (listView) { listView.hidden = false; listView.removeAttribute("hidden"); }
  if (temaView) { temaView.hidden = true; temaView.setAttribute("hidden", ""); }
}

function renderGradiva() {
  const matEl = $("#materials-list");
  if (!matEl) return;
  matEl.innerHTML = (state.data.materials || []).map((m) => `
    <div class="material-item">
      <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>
      <span class="type-tag">${esc(m.type)}</span>
    </div>`).join("");
}

function slotLink(o) {
  const wd = (o.weekday || o.dayLabel || "").slice(0, 3);
  const d = o.date ? `${Number(o.date.slice(8))}. ${Number(o.date.slice(5, 7))}.` : "";
  const t = o.start ? ` ${o.start}${o.end ? `–${o.end}` : ""}` : "";
  return `<a class="slot-link" href="${esc(o.href)}">${esc(`${wd} ${d}${t}`.trim())}</a>`;
}

function personPills(list) {
  return (list || []).map((x) => {
    const p = typeof x === "string" ? state.data.people?.[x] : (x.slug ? state.data.people?.[x.slug] || x : x);
    return p ? personLinkFull(p, "trainer-pill") : "";
  }).join("");
}

function temaGroup(cat) {
  if (cat === "izbirna") return "izbirne";
  if (cat === "dodatna" || cat === "activity") return "ostale";
  return "obvezne"; // tema / redna / default
}

/** Teme-card slot: "N. vikend petek" (no clock times; details page keeps them). */
function temaSlotChip(o) {
  const day = state.data.days.find((d) => d.id === o.dayId);
  const weekend = day?.weekend ?? o.weekend;
  const weekday = (day?.weekday || o.weekday || "").toLowerCase();
  if (weekend && weekday) {
    return `<a class="slot-link" href="${esc(o.href)}">${esc(`${weekend}. vikend ${weekday}`)}</a>`;
  }
  // Fallback without inventing weekend metadata
  const wd = (o.weekday || o.dayLabel || "").toLowerCase();
  return `<a class="slot-link" href="${esc(o.href)}">${esc(wd || "termin")}</a>`;
}

function temaDurationLabel(t, full) {
  const d = t?.duration || full?.duration;
  if (d) return d;
  const occ = full?.occurrences || [];
  const mins = full?.durationMinutes || occ.reduce((a, o) => a + (o.durationMinutes || 0), 0);
  if (!mins) {
    // derive from first+last slot end-start if single continuous? else sum per-occ clock spans
    let total = 0;
    for (const o of occ) {
      if (!o.start || !o.end) continue;
      const [sh, sm] = o.start.split(":").map(Number);
      const [eh, em] = o.end.split(":").map(Number);
      const m = (eh * 60 + em) - (sh * 60 + sm);
      if (m > 0) total += m;
    }
    if (!total) return "";
    if (total % 60 === 0) return `${total / 60}h`;
    const h = Math.floor(total / 60), m = total % 60;
    return h ? `${h}h ${m}min` : `${m} min`;
  }
  if (mins % 60 === 0) return `${mins / 60}h`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m === 30 ? `${h},5h` : `${h}h ${m}min`) : `${m} min`;
}

function partsBadge(t, full) {
  const n = t?.parts || full?.parts || (full?.occurrences || []).length || 0;
  const label = t?.partsLabel || full?.partsLabel || (n === 2 ? "1. in 2. del" : (n > 2 ? `${n} delov` : ""));
  if (n < 2 || !label) return "";
  return `<span class="badge parts" title="Tema v ${n} delih">${esc(label)}</span>`;
}

function renderTemaCard(t) {
  const full = state.data.temas?.[t.slug] || {};
  const occ = (full.occurrences || []).map((o) => temaSlotChip(o)).join("");
  const people = personPills(full.odgovorni);
  const dur = temaDurationLabel(t, full);
  const badges = `${overviewReadyBadge(t)}${partsBadge(t, full)}${dur ? `<span class="badge duration">${esc(dur)}</span>` : ""}`;
  return `<article class="tm-card">
    <div class="tm-head">
      <a class="tm-title" href="${temaHref(t.slug)}" data-tema="${esc(t.slug)}">${esc(t.title)}</a>
      <span class="tm-badges">${badges}</span>
    </div>
    <div class="tm-row tm-meta-row">
      <div class="tm-slots">${occ || `<span class="muted-text">Ni termina</span>`}</div>
      ${people ? `<div class="tm-people sh-people">${people}</div>` : ""}
    </div>
  </article>`;
}

function renderTeme() {
  const root = $("#teme-overview");
  if (!root) return;
  const groups = {
    obvezne: { title: "Obvezne", items: [] },
    izbirne: { title: "Izbirne", items: [] },
    ostale: { title: "Ostale", items: [] },
  };
  for (const t of state.data.temasList || []) groups[temaGroup(t.category)].items.push(t);
  root.innerHTML = ["obvezne", "izbirne", "ostale"].map((key) => {
    const g = groups[key];
    if (!g.items.length) return "";
    return `<section class="tm-group">
      <h3 class="tm-group-title">${g.title} <span class="muted-text">(${g.items.length})</span></h3>
      <div class="teme-overview">${g.items.map(renderTemaCard).join("")}</div>
    </section>`;
  }).join("");
}


function renderIzrocki() {
  const iz = state.data.izrocki || {};
  const list = state.data.temasList || [];
  const ready = iz.ready ?? 0;
  const total = iz.total ?? list.length;
  const pct = total ? Math.round((ready / total) * 100) : 0;
  const countEl = $("#iz-ready-count");
  const fillEl = $("#iz-ready-fill");
  const capEl = $("#iz-ready-cap");
  if (countEl) countEl.textContent = `${ready} / ${total}`;
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (capEl) {
    const missing = total - ready;
    capEl.textContent = missing
      ? `${ready} pripravljenih · ${missing} brez izročka`
      : (total ? "Vse teme imajo izroček" : "Ni tem");
  }

  const barsEl = $("#iz-ready-bars");
  if (barsEl) {
    const readyW = total ? (ready / total) * 100 : 0;
    const missW = total ? ((total - ready) / total) * 100 : 0;
    barsEl.innerHTML = `
      <div class="iz-hbar-row">
        <span class="iz-hbar-label">Pripravljeno</span>
        <div class="iz-hbar-track"><div class="iz-hbar-fill ready" style="width:${readyW}%"></div></div>
        <span class="iz-hbar-val">${ready}</span>
      </div>
      <div class="iz-hbar-row">
        <span class="iz-hbar-label">Ni še</span>
        <div class="iz-hbar-track"><div class="iz-hbar-fill missing" style="width:${missW}%"></div></div>
        <span class="iz-hbar-val">${total - ready}</span>
      </div>`;
  }

  const pagesEl = $("#iz-pages-chart");
  const noteEl = $("#iz-pages-note");
  const perTema = (iz.perTema || []).filter((x) => typeof x.pageCount === "number");
  const unknown = iz.unknownPages || [];
  if (noteEl) {
    noteEl.textContent = unknown.length
      ? `Po temah z znanim številom strani. Brez števila strani (izključeno iz grafa): ${unknown.map((u) => u.title).join(", ")}.`
      : "Po temah z znanim številom strani (Google Docs → PDF izvoz, PDF → pdfinfo).";
  }
  if (pagesEl) {
    if (!perTema.length) {
      pagesEl.innerHTML = `<p class="empty-detail">Ni tem z znanim številom strani.</p>`;
    } else {
      const maxP = Math.max(...perTema.map((x) => x.pageCount), 1);
      pagesEl.innerHTML = perTema.map((x) => {
        const w = Math.max(8, Math.round((x.pageCount / maxP) * 100));
        return `<div class="iz-hbar-row">
          <a class="iz-hbar-label" href="${temaHref(x.slug)}">${esc(x.title)}</a>
          <div class="iz-hbar-track"><div class="iz-hbar-fill pages" style="width:${w}%"></div></div>
          <span class="iz-hbar-val">${x.pageCount}</span>
        </div>`;
      }).join("");
    }
  }

  const root = $("#izrocki-list");
  if (!root) return;
  const bySlug = Object.fromEntries((iz.perTema || []).map((x) => [x.slug, x]));
  const cards = list.map((t) => {
    const row = bySlug[t.slug];
    const files = row?.files || [];
    const readyBadge = files.length
      ? `<span class="cov-badge pripravljeno">Pripravljeno</span>`
      : `<span class="cov-badge ni_pripravljeno">Ni še</span>`;
    const pages = typeof row?.pageCount === "number"
      ? `<span class="muted-text">${row.pageCount} str.</span>`
      : (files.length ? `<span class="muted-text">strani ?</span>` : "");
    const fileLinks = files.length
      ? `<ul class="iz-file-list">${files.map((f) =>
          `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.title)}</a>
           <span class="type-tag">${esc(f.type || "datoteka")}</span>
           ${typeof f.pageCount === "number" ? `<span class="muted-text">${f.pageCount} str.</span>` : ""}</li>`
        ).join("")}</ul>`
      : `<p class="empty-detail">Ni izročka v mapi Izročki.</p>`;
    return `<article class="iz-card card">
      <div class="iz-card-head">
        <a class="tm-title" href="${temaHref(t.slug)}">${esc(t.title)}</a>
        <span class="tm-badges">${readyBadge} ${pages}</span>
      </div>
      ${fileLinks}
    </article>`;
  }).join("");
  const unmapped = (iz.unmapped || []).length
    ? `<section class="card iz-chart-card"><h3>Nepovezani izročki</h3>
        <ul class="lit-list">${iz.unmapped.map((f) =>
          `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.title)}</a></li>`).join("")}</ul></section>`
    : "";
  root.innerHTML = cards + unmapped;
}

/* Zadolžitve emoji: first keyword match on the title (lower-case, diacritics-insensitive); fallback 📌 */
const ZAD_EMOJI = [
  [/masa|bogosluz/, "⛪"], [/ceremonij/, "🎖️"], [/zbiranj/, "📍"], [/vprasanj|prosti cas/, "❓"],
  [/molitv/, "🙏"], [/duhovnost|ambientacij/, "🕯️"], [/jedilnik|hrana|kuhanj|obrok|kosil/, "🍲"],
  [/knjizic|tisk|print/, "📖"], [/\bcgp\b|grafic|oblikovanj/, "🎨"], [/fotograf|\bfoto|\bpr\b/, "📷"],
  [/komunikacij|obvesc/, "💬"], [/preverb|evalvacij/, "📝"], [/prijav/, "🗂️"], [/spomin|daril/, "🎁"],
  [/spoznavanj/, "🤝"], [/international|mednarod/, "🌍"], [/zabavn|party/, "🎉"],
  [/materia|gradiv/, "📦"], [/glasb|music|pesm/, "🎵"], [/prevoz|transport|kombi/, "🚐"],
  [/financ|denar|blagajn|racun/, "💶"], [/logistik|nabav/, "🧰"],
];
function zadEmoji(title) {
  const t = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (ZAD_EMOJI.find(([re]) => re.test(t)) || [null, "📌"])[1];
}

function renderZadolzitve() {
  const root = $("#zadolzitve-list");
  if (!root) return;
  const list = state.data.zadolzitve || [];
  const srcEl = $("#zad-source");
  if (srcEl) srcEl.innerHTML = "";
  const item = (z) => {
    const when = z.sessions?.length
      ? `<div class="zd-slots">${z.sessions.map(slotLink).join("")}</div>`
      : (z.rok ? `<span class="zd-rok">Rok: ${esc(z.rok)}</span>` : "");
    const note = [z.detail, z.done ? "✓ opravljeno" : null].filter(Boolean).join(" · ");
    return `<li class="zd-item">
      <div class="zd-title"><span class="zd-emoji" aria-hidden="true">${zadEmoji(z.title)}</span> ${esc(z.title)}</div>
      <div class="zd-people">${personPills(z.people)}</div>
      ${when}
      ${note ? `<div class="role-note">${esc(note)}</div>` : ""}
    </li>`;
  };
  const pre = list.filter((z) => z.phase === "pre");
  const during = list.filter((z) => z.phase !== "pre");
  root.innerHTML = `<ul class="zd-ul">${pre.map(item).join("")}</ul>` +
    (pre.length && during.length ? `<hr class="zd-divider">` : "") +
    `<ul class="zd-ul">${during.map(item).join("")}</ul>`;
}

function renderTema(slug) {
  const tema = findTemaBySlug(slug);
  const listView = $("#teme-list-view");
  const temaView = $("#tema-view");
  if (!tema) {
    showTemeList();
    setTab("teme");
    return;
  }
  state.temaSlug = slug;
  if (listView) { listView.hidden = true; listView.setAttribute("hidden", ""); }
  if (temaView) { temaView.hidden = false; temaView.removeAttribute("hidden"); }

  $("#tema-name").textContent = tema.title;
  const badges = [];
  badges.push(categoryBadge(tema.category));
  badges.push(coverageBadge(tema.coverage?.status));
  if ((tema.parts || 0) >= 2) {
    badges.push(`<span class="badge parts">${esc(tema.partsLabel || (tema.parts === 2 ? "1. in 2. del" : `${tema.parts} delov`))}</span>`);
  }
  if (tema.duration) badges.push(`<span class="badge duration">${esc(tema.duration)}</span>`);
  $("#tema-badges").innerHTML = badges.filter(Boolean).join(" ");
  $("#tema-summary").textContent = tema.duration ? `Trajanje: ${tema.duration}` : "";

  const odg = (tema.odgovorni || []).length
    ? `<ul class="plain-list">${tema.odgovorni.map((p) =>
        `<li>${personLinkFull(p)}</li>`).join("")}</ul>`
    : `<p class="empty-detail">Ni navedenih odgovornih.</p>`;

  const occ = (tema.occurrences || []).length
    ? `<ul class="occ-list">${tema.occurrences.map((o) => `
        <li>
          <a href="${esc(o.href)}" data-role-href="${esc(o.href)}">${esc(o.dayLabel || "")} · ${esc(o.start)}–${esc(o.end)}</a>
          ${o.duration ? `<span class="muted-text"> · ${esc(o.duration)}</span>` : ""}
        </li>`).join("")}</ul>`
    : `<p class="empty-detail">Ni neposrednega vnosa v časovnici (morda znotraj izbirnega sklopa).</p>`;

  const contents = (tema.contents || []).length
    ? `<ul>${tema.contents.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : `<p class="empty-detail">Predlagane vsebine niso navedene.</p>`;

  const mikro = tema.mikronacrt || {};
  const mikroBlock = mikro.status === "exists" && mikro.url
    ? `<p><a class="btn primary" href="${esc(mikro.url)}" target="_blank" rel="noopener">${esc(mikro.title || "Mikronačrt 2026")}</a></p>
       <p class="muted-text">Glavni vir načrta · ${esc(mikro.modifiedTime ? ("posodobljeno " + mikro.modifiedTime.slice(0, 10)) : "2026")}</p>`
    : `<p class="mikro-missing-block"><span class="cov-badge ni_mikronacrta">Ne obstaja</span> Mikronačrt za 2026 še ni v mapi Mikronačrti.</p>`;

  const litItems = (tema.sources || []).filter((x) => x?.url).map((x) =>
    `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`
  );
  const lit = litItems.length
    ? `<ul class="lit-list">${litItems.join("")}</ul>`
    : `<p class="empty-detail">Ni dodatne literature v programu.</p>`;

  const notes = (tema.notes || []).length
    ? `<ul>${tema.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : "";

  const files = (tema.relatedFiles || []).length
    ? `<ul class="lit-list">${tema.relatedFiles.map((f) =>
        `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.title)}</a>
         <span class="type-tag">${esc(f.type || "datoteka")}</span></li>`).join("")}</ul>`
    : `<p class="empty-detail">Ni povezanih izročkov v mapah 2026.</p>`;

  const covItems = (tema.coverage?.items || []);
  const checklist = covItems.length
    ? `<ul class="cov-checklist">${covItems.map((it) => `
        <li class="cov-item status-${esc(it.status)}">
          <span class="cov-dot" aria-hidden="true"></span>
          <div>
            <div class="cov-item-head">
              <strong>${esc(it.text)}</strong>
              <span class="cov-status">${esc({ vkljuceno: "Vključeno", delno: "Delno", manjka: "Manjka" }[it.status] || it.status)}</span>
            </div>
            ${it.evidence ? `<p class="cov-evidence">${esc(it.evidence)}</p>` : ""}
          </div>
        </li>`).join("")}</ul>`
    : `<p class="empty-detail">Ni Vsebin za preverjanje.</p>`;

  $("#tema-body").innerHTML = `
    <section class="card tema-section">
      <h3>Termini v časovnici</h3>
      ${occ}
    </section>
    <section class="card tema-section">
      <h3>Odgovorni</h3>
      ${odg}
    </section>
    <section class="card tema-section">
      <h3>Mikronačrt</h3>
      ${mikroBlock}
    </section>
    <section class="card tema-section">
      <h3>Vsebine</h3>
      ${contents}
      ${covItems.length ? `<div class="cov-inline">${checklist}</div>` : ""}
    </section>
    <section class="card tema-section">
      <h3>Literatura</h3>
      ${lit}
    </section>
    ${notes ? `<section class="card tema-section"><h3>Opombe</h3>${notes}</section>` : ""}
    <section class="card tema-section">
      <h3>Izročki in datoteke</h3>
      ${files}
    </section>`;

  // Deep links from tema page into timetable
  $("#tema-body").querySelectorAll("[data-role-href]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.dataset.roleHref || "";
      if (href.startsWith("#sid-")) {
        e.preventDefault();
        setTab("casovnica");
        openSession(href.slice(5));
      } else if (href.startsWith("#day-")) {
        e.preventDefault();
        setTab("casovnica");
        openDay(href.slice(5), true);
      }
    });
  });
}

function openTema(slug) {
  if (!slug || !findTemaBySlug(slug)) {
    showTemeList();
    setTab("teme");
    history.replaceState(null, "", "#teme");
    return;
  }
  setTab("teme");
  renderTema(slug);
  history.replaceState(null, "", `#tema-${slug}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const ROLE_GROUPS = [
  { type: "tema", title: "Teme (odgovorni / soodgovorni)" },
  { type: "zadolzitev", title: "Zadolžitve" },
  { type: "activity", title: "Aktivnosti" },
  { type: "guest", title: "Gostovanja" },
  { type: "svod_note", title: "SVOD prihodi / odhodi" },
];

function roleItemLabel(r) {
  return r.title || r.label || "";
}

function buildWorkloadRows() {
  const people = state.data.people || {};
  const list = state.data.peopleList || [];
  return list.map((entry) => {
    const p = people[entry.slug] || entry;
    const roles = p.roles || [];
    const temaRoles = roles.filter((r) => r.type === "tema");
    const obvezneRoles = temaRoles.filter((r) => temaGroup(r.category) === "obvezne");
    const izbirneRoles = temaRoles.filter((r) => temaGroup(r.category) === "izbirne");
    const ostaleRoles = temaRoles.filter((r) => temaGroup(r.category) === "ostale");
    const obvezneItems = obvezneRoles.map(roleItemLabel).filter(Boolean);
    const izbirneItems = izbirneRoles.map(roleItemLabel).filter(Boolean);
    const ostaleItems = ostaleRoles.map(roleItemLabel).filter(Boolean);
    const temeItems = [...obvezneItems, ...izbirneItems, ...ostaleItems];
    const preRoles = roles.filter((r) => r.type === "zadolzitev" && (r.phase === "pre" || (!r.phase && !r.href)));
    const duringRoles = roles.filter((r) => r.type === "zadolzitev" && (r.phase === "during" || (!r.phase && r.href)));
    const preItems = [...new Set(preRoles.map(roleItemLabel).filter(Boolean))];
    const duringItems = [...new Set(duringRoles.map(roleItemLabel).filter(Boolean))];
    const temeObvezne = obvezneRoles.length;
    const temeIzbirne = izbirneRoles.length;
    const temeOstale = ostaleRoles.length;
    const teme = temeObvezne + temeIzbirne + temeOstale;
    const zadolzitvePre = (p.counts && p.counts.zadolzitvePre != null) ? p.counts.zadolzitvePre : preRoles.length;
    const zadolzitveDuring = (p.counts && p.counts.zadolzitveDuring != null) ? p.counts.zadolzitveDuring : duringRoles.length;
    const zadolzitve = zadolzitvePre + zadolzitveDuring;
    return {
      slug: entry.slug,
      name: p.name || entry.name,
      shortName: p.shortName || entry.shortName || (p.name || "").split(/\s+/)[0],
      teme,
      temeObvezne,
      temeIzbirne,
      temeOstale,
      zadolzitve,
      zadolzitvePre,
      zadolzitveDuring,
      total: teme + zadolzitve,
      temeItems,
      obvezneItems,
      izbirneItems,
      ostaleItems,
      zadolzitveItems: [...preItems, ...duringItems],
      preItems,
      duringItems,
    };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "sl"));
}

function renderWorkloadChart() {
  const root = $("#workload-chart");
  const tip = $("#workload-tooltip");
  if (!root) return;
  const rows = buildWorkloadRows();
  if (!rows.length) {
    root.innerHTML = `<p class="empty-detail">Ni podatkov za primerjavo.</p>`;
    return;
  }
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);
  const useShort = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  // mobile: labels left-aligned at x=0 so the chart edge lines up with the legend; label column sized to names
  const labelW = useShort ? Math.min(88, Math.max(...rows.map((r) => (r.shortName || "").length)) * 7 + 6) : 148;
  const rowH = 34;
  const padL = labelW + (useShort ? 4 : 8);
  const padR = useShort ? 26 : 44;
  const padT = 4;
  const barH = 18;
  const width = Math.max(root.clientWidth || 0, 200);
  state.wlWidth = root.clientWidth;
  const innerW = Math.max(width - padL - padR, 80);
  const height = padT + rows.length * rowH + 8;

  const tipBySlug = Object.fromEntries(rows.map((r) => {
    const lines = [
      r.name,
      `Skupaj: ${r.total} (teme ${r.teme}: ${r.temeObvezne} obv. / ${r.temeIzbirne} izb. / ${r.temeOstale} ost. + zadolžitve ${r.zadolzitve}: ${r.zadolzitvePre} pred / ${r.zadolzitveDuring} med)`,
      "",
      r.obvezneItems.length ? "Teme · Obvezne:" : null,
      ...r.obvezneItems.map((t) => `• ${t}`),
      r.izbirneItems.length ? "Teme · Izbirne:" : null,
      ...r.izbirneItems.map((t) => `• ${t}`),
      r.ostaleItems.length ? "Teme · Ostale:" : null,
      ...r.ostaleItems.map((t) => `• ${t}`),
      (!r.teme ? "Teme: —" : null),
      "",
      r.preItems.length ? "Zadolžitve · Pred dogodkom:" : "Zadolžitve · Pred dogodkom: —",
      ...r.preItems.map((t) => `• ${t}`),
      "",
      r.duringItems.length ? "Zadolžitve · Med dogodkom:" : "Zadolžitve · Med dogodkom: —",
      ...r.duringItems.map((t) => `• ${t}`),
    ].filter((x) => x != null);
    return [r.slug, lines.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n")];
  }));

  const bars = rows.map((r, i) => {
    const y = padT + i * rowH + (rowH - barH) / 2;
    const wOb = (r.temeObvezne / maxTotal) * innerW;
    const wIz = (r.temeIzbirne / maxTotal) * innerW;
    const wOs = (r.temeOstale / maxTotal) * innerW;
    const wPre = (r.zadolzitvePre / maxTotal) * innerW;
    const wDur = (r.zadolzitveDuring / maxTotal) * innerW;
    const x0 = padL;
    const xIz = x0 + wOb;
    const xOs = xIz + wIz;
    const xPre = xOs + wOs;
    const xDur = xPre + wPre;
    const label = r.shortName || displayName(r.name);
    const ty = y + barH / 2 + 4;
    const labels = [
      r.temeObvezne > 0 && wOb > 14 ? `<text class="wl-count" x="${x0 + wOb / 2}" y="${ty}" text-anchor="middle">${r.temeObvezne}</text>` : "",
      r.temeIzbirne > 0 && wIz > 14 ? `<text class="wl-count" x="${xIz + wIz / 2}" y="${ty}" text-anchor="middle">${r.temeIzbirne}</text>` : "",
      r.temeOstale > 0 && wOs > 14 ? `<text class="wl-count on-ostale" x="${xOs + wOs / 2}" y="${ty}" text-anchor="middle">${r.temeOstale}</text>` : "",
      r.zadolzitvePre > 0 && wPre > 14 ? `<text class="wl-count on-zad" x="${xPre + wPre / 2}" y="${ty}" text-anchor="middle">${r.zadolzitvePre}</text>` : "",
      r.zadolzitveDuring > 0 && wDur > 14 ? `<text class="wl-count on-zad" x="${xDur + wDur / 2}" y="${ty}" text-anchor="middle">${r.zadolzitveDuring}</text>` : "",
      `<text class="wl-total" x="${padL + innerW + 8}" y="${ty}">${r.total}</text>`,
    ].join("");
    return `<g class="wl-row" data-slug="${esc(r.slug)}" tabindex="0" role="link" aria-label="${esc(r.name)}: ${r.temeObvezne} obveznih, ${r.temeIzbirne} izbirnih, ${r.temeOstale} ostalih tem, ${r.zadolzitvePre} pred, ${r.zadolzitveDuring} med">
      <rect class="wl-hit" x="0" y="${i * rowH}" width="${width}" height="${rowH}" />
      <text class="wl-name" x="${useShort ? 0 : labelW - 6}" y="${ty}" text-anchor="${useShort ? "start" : "end"}">${esc(label)}</text>
      <rect class="wl-bar teme-obvezne" x="${x0}" y="${y}" width="${Math.max(wOb, r.temeObvezne ? 2 : 0)}" height="${barH}" rx="3" />
      <rect class="wl-bar teme-izbirne" x="${xIz}" y="${y}" width="${Math.max(wIz, r.temeIzbirne ? 2 : 0)}" height="${barH}" rx="3" />
      <rect class="wl-bar teme-ostale" x="${xOs}" y="${y}" width="${Math.max(wOs, r.temeOstale ? 2 : 0)}" height="${barH}" rx="3" />
      <rect class="wl-bar zad-pre" x="${xPre}" y="${y}" width="${Math.max(wPre, r.zadolzitvePre ? 2 : 0)}" height="${barH}" rx="3" />
      <rect class="wl-bar zad-during" x="${xDur}" y="${y}" width="${Math.max(wDur, r.zadolzitveDuring ? 2 : 0)}" height="${barH}" rx="3" />
      ${labels}
    </g>`;
  }).join("");

  root.innerHTML = `<svg class="workload-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${bars}</svg>`;

  const showTip = (slug, evt) => {
    if (!tip) return;
    tip.hidden = false;
    tip.textContent = tipBySlug[slug] || "";
    const rect = root.getBoundingClientRect();
    const x = (evt.clientX || rect.left + 40) - rect.left + 12;
    const y = (evt.clientY || rect.top + 20) - rect.top + 12;
    tip.style.left = `${Math.min(Math.max(8, x), Math.max(8, rect.width - 240))}px`;
    tip.style.top = `${Math.min(Math.max(8, y), Math.max(8, root.offsetHeight - 20))}px`;
  };
  const hideTip = () => { if (tip) tip.hidden = true; };

  root.querySelectorAll(".wl-row").forEach((g) => {
    g.addEventListener("click", () => openPerson(g.dataset.slug));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPerson(g.dataset.slug); }
    });
    g.addEventListener("mousemove", (e) => showTip(g.dataset.slug, e));
    g.addEventListener("mouseenter", (e) => showTip(g.dataset.slug, e));
    g.addEventListener("mouseleave", hideTip);
    g.addEventListener("focus", () => showTip(g.dataset.slug, { clientX: 0, clientY: 0 }));
    g.addEventListener("blur", hideTip);
  });
}

/* Draw the chart only when it's visible and its width is known; redraw only when the width changes
   (mobile URL-bar collapse changes only the height → no redraw, stable px fonts). */
function ensureWorkloadChart(force = false) {
  requestAnimationFrame(() => {
    const r = $("#workload-chart");
    if (!r || !r.clientWidth) return;
    if (force || r.clientWidth !== state.wlWidth) renderWorkloadChart();
  });
}

/* Round avatar: Trop photo (assets/people/<slug>.webp via build_photos.py) or initials fallback */
function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function avatarHtml(p, cls = "") {
  const name = p?.name || "";
  return p?.photo
    ? `<img class="avatar ${cls}" src="${esc(p.photo)}" alt="" loading="lazy" width="256" height="256" />`
    : `<span class="avatar avatar-initials ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

function renderEkipa() {
  const list = state.data.peopleList || [];
  const grid = $("#ekipa-grid");
  if (!grid) return;
  state.wlWidth = null;
  ensureWorkloadChart(true);
  grid.innerHTML = list.map((p) => {
    const c = p.counts || {};
    const bits = [];
    if (c.teme) bits.push(`${c.teme} tem`);
    if (c.zadolzitve) bits.push(`${c.zadolzitve} zad.`);
    if (c.activity) bits.push(`${c.activity} akt.`);
    if (c.guest) bits.push(`${c.guest} gost`);
    if (c.other) bits.push(`${c.other} drugo`);
    return `<a class="ekipa-card card" href="#oseba-${esc(p.slug)}">
      <div class="ekipa-card-head">${avatarHtml(state.data.people?.[p.slug] || p, "avatar-md")}<div>
      <h3>${esc(displayName(p))}</h3>
      <p class="muted-text">${c.total || 0} odgovornosti</p></div></div>
      <p class="ekipa-bits">${bits.map((b) => `<span class="chip">${esc(b)}</span>`).join("") || '<span class="chip">—</span>'}</p>
    </a>`;
  }).join("");
}

function renderPerson(slug) {
  const listView = $("#ekipa-list-view");
  const personView = $("#person-view");
  if (!listView || !personView) return;

  const person = state.data.people?.[slug];
  if (!person) {
    listView.hidden = false;
    personView.hidden = true;
    state.personSlug = null;
    return;
  }

  state.personSlug = slug;
  listView.hidden = true;
  listView.setAttribute("hidden", "");
  personView.hidden = false;
  personView.removeAttribute("hidden");

  const c = person.counts || {};
  $("#person-name").textContent = person.name;
  const av = $("#person-avatar"); if (av) av.innerHTML = avatarHtml(person, "avatar-lg");
  const tkRoles = (person.roles || []).filter((r) => r.type === "timekeeper");
  const tkBox = $("#person-tk-badges");
  if (tkBox) {
    if (tkRoles.length) {
      tkBox.innerHTML = tkRoles.map((r) => {
        const label = r.dayLabel || r.label || "";
        const href = r.href || (r.dayId ? `#day-${r.dayId}` : "");
        if (href) {
          return `<a class="person-tk-day" href="${esc(href)}" data-role-href="${esc(href)}" title="Time keeper dneva">⏱ ${esc(label)}</a>`;
        }
        return `<span class="person-tk-day">⏱ ${esc(label)}</span>`;
      }).join("");
    } else {
      tkBox.innerHTML = "";
    }
  }
  const parts = [];
  if (c.teme) parts.push(`${c.teme} tem`);
  if (c.zadolzitve) parts.push(`${c.zadolzitve} zadolžitev`);
  if (c.activity) parts.push(`${c.activity} aktivnosti`);
  if (c.guest) parts.push(`${c.guest} gostovanj`);
  if (c.other) parts.push(`${c.other} drugih`);
  $("#person-summary").textContent = `${c.total || 0} odgovornosti` + (parts.length ? ` · ${parts.join(" · ")}` : "");

  const byType = {};
  for (const r of person.roles || []) {
    (byType[r.type] ||= []).push(r);
  }

  const renderRoleItems = (roles) => roles.map((r) => {
    const meta = [];
    if (r.slots?.length > 1) {
      // one zadolžitev spanning several slots → one item with slot links
      const sl = r.slots.map((x) => `<a class="slot-link" href="${esc(x.href)}" data-role-href="${esc(x.href)}">${esc(`${(x.weekday || "").slice(0, 3)} ${Number(x.date.slice(8))}. ${Number(x.date.slice(5, 7))}. ${x.start}`)}</a>`).join(" ");
      return `<li><a class="role-link" href="${esc(r.href)}" data-role-href="${esc(r.href)}">${esc(`${zadEmoji(r.title || r.label)} ${r.title || r.label}`)}</a>
        <span class="role-meta role-slots">${sl}</span>${r.note ? `<span class="role-note">${esc(r.note)}</span>` : ""}${r.source ? `<span class="role-source">${esc(r.source)}</span>` : ""}</li>`;
    }
    if (r.dayLabel) meta.push(r.dayLabel);
    if (r.start && r.end) meta.push(`${r.start}–${r.end}`);
    else if (r.start) meta.push(r.start);
    const metaStr = meta.length ? `<span class="role-meta">${esc(meta.join(" · "))}</span>` : "";
    const note = r.note ? `<span class="role-note">${esc(r.note)}</span>` : "";
    const source = r.source ? `<span class="role-source">${esc(r.source)}</span>` : "";
    const title = (r.type === "zadolzitev" ? `${zadEmoji(r.title || r.label)} ` : "") + (r.title || r.label || "");
    const parts = (r.parts >= 2)
      ? `<span class="badge parts">${esc(r.partsLabel || (r.parts === 2 ? "1. in 2. del" : `${r.parts} delov`))}</span>`
      : "";
    const link = r.href
      ? `<a class="role-link" href="${esc(r.href)}" data-role-href="${esc(r.href)}">${esc(title || r.label)}</a>`
      : `<span class="role-title">${esc(title || r.label)}</span>`;
    return `<li>
      <div class="role-head">${link}${parts}</div>
      ${metaStr}
      ${note}
      ${source}
    </li>`;
  }).join("");

  const rolesEl = $("#person-roles");
  let html = "";
  for (const g of ROLE_GROUPS) {
    const roles = byType[g.type];
    if (!roles?.length) continue;
    if (g.type === "zadolzitev") {
      const pre = roles.filter((r) => r.phase === "pre" || (!r.phase && !r.href));
      const during = roles.filter((r) => r.phase === "during" || (!r.phase && r.href));
      const parts = [];
      if (pre.length) parts.push(`<ul class="role-list">${renderRoleItems(pre)}</ul>`);
      if (pre.length && during.length) parts.push(`<hr class="zad-divider" aria-hidden="true" />`);
      if (during.length) parts.push(`<ul class="role-list">${renderRoleItems(during)}</ul>`);
      html += `<section class="role-group card role-group-zad">
        <h3>${esc(g.title)} <span class="role-count">${roles.length}</span></h3>
        ${parts.join("")}
      </section>`;
      continue;
    }
    if (g.type === "tema") {
      // Same buckets as Teme tab (temaGroup); label Ostale → Drugo on person pages
      const buckets = [
        { key: "obvezne", title: "Obvezne", items: [] },
        { key: "izbirne", title: "Izbirne", items: [] },
        { key: "drugo", title: "Drugo", items: [] },
      ];
      const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
      for (const r of roles) {
        const gkey = temaGroup(r.category);
        const dest = gkey === "izbirne" ? "izbirne" : (gkey === "ostale" ? "drugo" : "obvezne");
        byKey[dest].items.push(r);
      }
      const parts = buckets.filter((b) => b.items.length).map((b) => `
        <div class="role-subgroup">
          <h4 class="role-subhead">${esc(b.title)} <span class="role-count">${b.items.length}</span></h4>
          <ul class="role-list">${renderRoleItems(b.items)}</ul>
        </div>`).join("");
      if (!parts) continue;
      html += `<section class="role-group card">
        <h3>${esc(g.title)} <span class="role-count">${roles.length}</span></h3>
        ${parts}
      </section>`;
      continue;
    }
    html += `<section class="role-group card">
      <h3>${esc(g.title)} <span class="role-count">${roles.length}</span></h3>
      <ul class="role-list">${renderRoleItems(roles)}</ul>
    </section>`;
  }
  if (!html) html = `<p class="empty-detail">Ni zabeleženih odgovornosti.</p>`;
  rolesEl.innerHTML = html;

  const bindRoleHrefs = (root) => {
    root.querySelectorAll("[data-role-href]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.dataset.roleHref || "";
        if (href.startsWith("#sid-")) {
          e.preventDefault();
          setTab("casovnica");
          openSession(href.slice(5));
        } else if (href.startsWith("#day-")) {
          e.preventDefault();
          setTab("casovnica");
          openDay(href.slice(5), true);
        }
      });
    });
  };
  bindRoleHrefs(rolesEl);
  const tkBoxEl = $("#person-tk-badges");
  if (tkBoxEl) bindRoleHrefs(tkBoxEl);
}

window.addEventListener("resize", () => {
  if (!$("#tab-ekipa")?.hidden && !$("#ekipa-list-view")?.hidden) ensureWorkloadChart();
});


function showEkipaList() {
  state.personSlug = null;
  const listView = $("#ekipa-list-view");
  let personView = $("#person-view") || document.querySelector("#tab-ekipa [id^='oseba-']");
  if (personView) personView.id = "person-view";
  if (listView) { listView.hidden = false; listView.removeAttribute("hidden"); }
  if (personView) { personView.hidden = true; personView.setAttribute("hidden", ""); }
  ensureWorkloadChart();
}

function openPerson(slug) {
  const resolved = resolvePersonSlug(slug);
  setTab("ekipa");
  renderPerson(resolved);
  // Keep requested hash if it was a legacy alias so old links still "work";
  // canonical slug is preferred in the URL.
  history.replaceState(null, "", `#oseba-${resolved}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash || hash === "casovnica") { setTab("casovnica"); return; }
  if (hash === "izrocki") { setTab("gradiva"); history.replaceState(null, "", "#gradiva"); return; }
  if (hash === "zadolzitve") {
    setTab("teme"); showTemeList();
    $("#zadolzitve-section")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (hash === "info") { setTab("domov"); history.replaceState(null, "", "#domov"); return; }
  if (["domov", "gradiva", "ekipa", "teme", "os", "uu", "preverbe", "zabava", "analitika"].includes(hash)) {
    setTab(hash);
    if (hash === "ekipa") showEkipaList();
    if (hash === "teme") showTemeList();
    return;
  }
  if (/^uu\/.+$/.test(hash)) { setTab("uu"); return; }
  if (/^preverbe\/(teme|generalno)$/.test(hash)) { setTab("preverbe"); return; }
  if (/^os\/\d+$/.test(hash)) { setTab("os"); window.scrollTo(0, 0); return; }
  if (hash.startsWith("day-")) { setTab("casovnica"); openDay(hash.slice(4), true); return; }
  if (hash.startsWith("sid-")) { setTab("casovnica"); openSession(hash.slice(4)); return; }
  if (hash.startsWith("oseba-")) {
    openPerson(hash.slice(6));
    return;
  }
  if (hash.startsWith("tema-")) {
    openTema(hash.slice(5));
    return;
  }
  setTab("casovnica");
}

function bindControls() {
  $$(".tab").forEach((btn) => btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "ekipa") showEkipaList();
    if (tab === "teme") showTemeList();
    if (tab === "os") history.replaceState(null, "", "#os"); // leave group detail
    if (tab === "uu") history.replaceState(null, "", "#uu");
    setTab(tab);
    if (tab === "casovnica") history.replaceState(null, "", "#casovnica");
    else history.replaceState(null, "", `#${tab}`);
  }));
  $$("[data-tab-link]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const tab = a.dataset.tabLink;
    if (tab === "ekipa") showEkipaList();
    if (tab === "teme") showTemeList();
    if (tab === "os") history.replaceState(null, "", "#os");
    if (tab === "uu") history.replaceState(null, "", "#uu");
    setTab(tab);
    history.replaceState(null, "", `#${tab}`);
  }));
  // Timeline: tapping a date block clears search and scrolls to that day; filter toggle in the search row
  $("#timetable-tree").addEventListener("click", (e) => {
    const d = e.target.closest("[data-jump-day]");
    if (d) { e.preventDefault(); jumpToDay(d.dataset.jumpDay); }
  });
  $("#btn-tema-only").addEventListener("click", () => {
    state.temaOnly = !state.temaOnly;
    try { localStorage.setItem("uvodja.temaOnly", state.temaOnly ? "1" : "0"); } catch {}
    renderTimetable();
  });
  window.addEventListener("scroll", () => {
    if (state.spyRaf) return;
    state.spyRaf = requestAnimationFrame(() => { state.spyRaf = 0; spyDay(); });
  }, { passive: true });
  try { state.temaOnly = localStorage.getItem("uvodja.temaOnly") === "1"; } catch { state.temaOnly = false; }
  $("#tt-search").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderTimetable();
  });
  $("#hide-logistics").addEventListener("change", (e) => {
    state.hideLogistics = e.target.checked;
    renderTimetable();
  });
  window.addEventListener("hashchange", applyHash);
  // Person links use hashchange; prevent summary toggle when clicking person link inside day header
  document.addEventListener("click", (e) => {
    const temaLink = e.target.closest("a[data-tema], a.session-title-link, a.tema-open-btn");
    if (temaLink) {
      const slug = temaLink.dataset.tema || (temaLink.getAttribute("href") || "").replace(/^#tema-/, "");
      if (slug && findTemaBySlug(slug)) {
        e.preventDefault();
        e.stopPropagation();
        openTema(slug);
        return;
      }
    }
    const link = e.target.closest("a.person-link");
    if (!link) return;
    // Let hash navigation work; stop details toggle
    e.stopPropagation();
  }, true);
}

/* Theme: "default" or "cgp" (CGP Vodja 2026 colours + Ubuntu/Alegreya). Applied early by the inline <head> script. */
function applyTheme(t) {
  const cgp = t === "cgp";
  document.documentElement.toggleAttribute("data-theme", cgp);
  if (cgp) document.documentElement.setAttribute("data-theme", "cgp");
  try { localStorage.setItem("uvodja.theme", cgp ? "cgp" : "default"); } catch {}
  if (cgp && !document.getElementById("cgp-fonts")) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.id = "cgp-fonts";
    l.href = "https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=Alegreya:wght@500;700;800&display=swap";
    document.head.appendChild(l);
  }
  const sw = $("#theme-toggle"); if (sw) sw.setAttribute("aria-checked", cgp ? "true" : "false");
  const badge = $(".home-badge-sm"); if (badge) badge.src = cgp ? "assets/logos/grb-vodja-2026.svg" : "assets/logos/vodja-badge.png";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cgp ? "#1c0a10" : "#0b1622");
}

/* —— Zabava: daily Wordle (data/wordle.json, answers XOR+base64 obfuscated — NOT secure) —— */
const WD_ROWS = ["QWERTZUIOPŠ", "ASDFGHJKLČŽ", "↵YXCVBNM⌫"];
const WD_MAX = 6;
const wd = { data: null, puzzle: null, answer: null, guesses: [], cur: [], done: false, won: false, busy: false };

function wdDeobf(b64, key) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length));
  return new TextDecoder().decode(bytes);
}
const wdLetters = (w) => Array.from(String(w).normalize("NFC").toLowerCase());
/* Standard Wordle scoring incl. duplicates: greens first, then yellows from remaining letter counts */
function wdScore(guess, answer) {
  const g = wdLetters(guess), a = wdLetters(answer), res = Array(g.length).fill("absent"), left = {};
  g.forEach((ch, i) => { if (ch === a[i]) res[i] = "correct"; else left[a[i]] = (left[a[i]] || 0) + 1; });
  g.forEach((ch, i) => { if (res[i] !== "correct" && left[ch] > 0) { res[i] = "present"; left[ch]--; } });
  return res;
}
const wdKey = (date) => `uvodja.wordle.${date}`;
function wdStats() { try { return JSON.parse(localStorage.getItem("uvodja.wordle.stats")) || null; } catch { return null; } }
function wdSaveGame() {
  try { localStorage.setItem(wdKey(wd.puzzle.date), JSON.stringify({ guesses: wd.guesses, done: wd.done, won: wd.won })); } catch {}
}
function wdRecordResult() {
  const st = wdStats() || { played: 0, wins: 0, streak: 0, maxStreak: 0, lastN: null, dist: [0, 0, 0, 0, 0, 0] };
  if (st.lastPlayed === wd.puzzle.date) return st;
  st.played++; st.lastPlayed = wd.puzzle.date;
  if (wd.won) {
    st.wins++; st.dist[wd.guesses.length - 1]++;
    st.streak = st.lastN === wd.puzzle.n - 1 ? st.streak + 1 : 1; // streak = consecutive puzzles
    st.lastN = wd.puzzle.n;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
  } else { st.streak = 0; st.lastN = null; }
  try { localStorage.setItem("uvodja.wordle.stats", JSON.stringify(st)); } catch {}
  return st;
}
function wdFmtDate(iso) { return `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`; }
function wdMsg(t) { const m = $("#wd-msg"); if (m) m.textContent = t || ""; }

async function renderWordle() {
  if (!wd.data) {
    try { const r = await fetch("data/wordle.json", { cache: "no-store" }); wd.data = r.ok ? await r.json() : null; } catch { wd.data = null; }
  }
  const box = $("#wordle");
  if (!box) return;
  if (!wd.data) { wdMsg("Uganke ni bilo mogoče naložiti."); return; }
  loadScoreboard();
  const today = ljNow().date;
  const p = wd.data.puzzles.find((x) => x.date === today);
  const L = wd.data.length;
  document.documentElement.style.setProperty("--wd-len", L);
  if (!p) {
    const next = wd.data.puzzles.find((x) => x.date > today);
    $("#wd-sub").textContent = "";
    $("#wd-board").innerHTML = ""; $("#wd-kb").innerHTML = ""; $("#wd-actions").hidden = true;
    wdMsg(next ? `Danes ni uganke. Naslednja: ${wdFmtDate(next.date)} 🧩` : "Vse uganke so rešene — hvala za igro! 🎉");
    renderWdStats();
    return;
  }
  if (wd.puzzle?.date !== p.date) {
    wd.puzzle = p;
    wd.answer = wdDeobf(p.w, wd.data.key);
    wd.valid = wd.data.valid ? new Set(wd.data.valid.map((v) => wdDeobf(v, wd.data.key))) : null;
    let saved = null; try { saved = JSON.parse(localStorage.getItem(wdKey(p.date))); } catch {}
    wd.guesses = saved?.guesses || []; wd.done = !!saved?.done; wd.won = !!saved?.won; wd.cur = [];
  }
  $("#wd-sub").textContent = `#${p.n} · ${wdFmtDate(p.date)}`;
  wdMsg(wd.done ? (wd.won ? "Bravo! 🎉" : `Beseda je bila: ${wd.answer.toUpperCase()}`) : "");
  drawWordle();
}

function drawWordle() {
  const L = wd.data.length;
  const rows = [];
  for (let r = 0; r < WD_MAX; r++) {
    const g = wd.guesses[r];
    const letters = g ? wdLetters(g) : (r === wd.guesses.length ? wd.cur : []);
    const score = g ? wdScore(g, wd.answer) : null;
    let cells = "";
    for (let i = 0; i < L; i++) {
      const ch = letters[i] || "";
      cells += `<span class="wd-cell${ch ? " filled" : ""}${score ? " " + score[i] : ""}">${esc(ch.toUpperCase())}</span>`;
    }
    rows.push(`<div class="wd-row${r === wd.guesses.length && !wd.done ? " current" : ""}">${cells}</div>`);
  }
  $("#wd-board").innerHTML = rows.join("");
  // keyboard colours: best state per letter
  const rank = { correct: 3, present: 2, absent: 1 }, keyState = {};
  wd.guesses.forEach((g) => wdScore(g, wd.answer).forEach((st, i) => {
    const ch = wdLetters(g)[i];
    if ((rank[st] || 0) > (rank[keyState[ch]] || 0)) keyState[ch] = st;
  }));
  $("#wd-kb").innerHTML = WD_ROWS.map((row) => `<div class="wd-kb-row">${Array.from(row).map((k) => {
    if (k === "↵") return `<button type="button" class="wd-key wide" data-k="enter" aria-label="Potrdi">Potrdi</button>`;
    if (k === "⌫") return `<button type="button" class="wd-key wide" data-k="back" aria-label="Briši">⌫</button>`;
    const st = keyState[k.toLowerCase()] || "";
    return `<button type="button" class="wd-key ${st}" data-k="${k.toLowerCase()}">${k}</button>`;
  }).join("")}</div>`).join("");
  const act = $("#wd-actions");
  act.hidden = !wd.done;
  act.innerHTML = wd.done ? `<button type="button" class="btn primary" id="wd-share">Deli rezultat</button>` : "";
  renderWdStats();
}

function renderWdStats() {
  const st = wdStats();
  const el = $("#wd-stats");
  if (!el) return;
  if (!st) { el.innerHTML = ""; return; }
  const max = Math.max(1, ...st.dist);
  el.innerHTML = `<div class="wd-stat-nums">
      <span><strong>${st.played}</strong>odigranih</span>
      <span><strong>${st.played ? Math.round((st.wins / st.played) * 100) : 0}%</strong>zmag</span>
      <span><strong>${st.streak}</strong>niz</span>
      <span><strong>${st.maxStreak}</strong>najdaljši niz</span>
    </div>
    <div class="wd-dist">${st.dist.map((n, i) => `<div class="wd-dist-row"><span>${i + 1}</span><span class="wd-bar" style="width:${Math.max(8, (n / max) * 100)}%">${n}</span></div>`).join("")}</div>`;
}

function wdInput(k) {
  if (!wd.puzzle || wd.done || wd.busy) return;
  const L = wd.data.length;
  if (k === "back") { wd.cur.pop(); drawWordle(); return; }
  if (k === "enter") {
    if (wd.cur.length < L) { wdMsg(`Premalo črk (potrebnih ${L}).`); shakeRow(); return; }
    const guess = wd.cur.join("");
    if (wd.valid && !wd.valid.has(guess) && guess !== wd.answer) { wdMsg("Te besede ni na seznamu."); shakeRow(); return; }
    wd.guesses.push(guess); wd.cur = [];
    if (guess === wd.answer) { wd.done = true; wd.won = true; }
    else if (wd.guesses.length >= WD_MAX) { wd.done = true; }
    wdSaveGame();
    if (wd.done) {
      wdRecordResult();
      wdSubmit({ date: wd.puzzle.date, guesses: wd.guesses.length, solved: wd.won,
        grid: wd.guesses.map((g) => wdScore(g, wd.answer).map((x) => (x === "correct" ? "G" : x === "present" ? "Y" : ".")).join("")).join("/") });
    }
    wdMsg(wd.done ? (wd.won ? ["Genialno!", "Odlično!", "Super!", "Bravo!", "Dobro!", "Za las!"][wd.guesses.length - 1] + " 🎉" : `Beseda je bila: ${wd.answer.toUpperCase()}`) : "");
    drawWordle();
    return;
  }
  if (wd.cur.length < L && /^\p{L}$/u.test(k)) { wd.cur.push(k.toLowerCase()); wdMsg(""); drawWordle(); }
}
function shakeRow() {
  const r = $("#wd-board .wd-row.current");
  if (!r) return;
  r.classList.remove("shake"); void r.offsetWidth; r.classList.add("shake");
}
async function wdShare() {
  const L = wd.data.length;
  const grid = wd.guesses.map((g) => wdScore(g, wd.answer).map((s) => (s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛")).join("")).join("\n");
  const text = `U Vodja Wordle #${wd.puzzle.n} ${wd.won ? wd.guesses.length : "X"}/${WD_MAX}\n${grid}`;
  try { await navigator.clipboard.writeText(text); wdMsg("Rezultat kopiran v odložišče 📋"); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); wdMsg("Rezultat kopiran v odložišče 📋"); } catch { wdMsg(text); }
    ta.remove();
  }
}
document.addEventListener("click", (e) => {
  const k = e.target.closest("#wd-kb [data-k]");
  if (k) { wdInput(k.dataset.k); return; }
  if (e.target.closest("#wd-share")) wdShare();
});
document.addEventListener("keydown", (e) => {
  if (!state.wordleActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, textarea")) return;
  if (e.key === "Enter") { e.preventDefault(); wdInput("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); wdInput("back"); }
  else if (e.key.length === 1 && /^\p{L}$/u.test(e.key)) wdInput(e.key);
});

/* —— Wordle results → Apps Script (data/wordle_config.json scriptUrl) + scoreboard —— */
async function wdConfig() {
  if (wd.config !== undefined) return wd.config;
  try { const r = await fetch("data/wordle_config.json", { cache: "no-store" }); wd.config = r.ok ? await r.json() : null; } catch { wd.config = null; }
  return wd.config;
}
const WD_QUEUE = "uvodja.wordle.queue";
function wdQueue() { try { return JSON.parse(localStorage.getItem(WD_QUEUE)) || []; } catch { return []; } }
function wdSetQueue(q) { try { localStorage.setItem(WD_QUEUE, JSON.stringify(q)); } catch {} }
/* Fresh ID token: stored one if valid ≥2 min, else GIS silent prompt (One Tap/auto-select) up to 15 s */
async function wdFreshToken() {
  const u = state.user;
  if (u?.credential && u.credExp > Date.now() + 120000) return u.credential;
  const g = window.google?.accounts?.id;
  if (!g) return null;
  if (!state.gsiReady) { initGsi(); }
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 15000);
    (state.tokenWaiters ||= []).push((c) => { clearTimeout(t); resolve(c); });
    try { g.prompt(); } catch { clearTimeout(t); resolve(null); }
  });
}
async function wdPost(url, item, credential) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...item, credential }) });
  return r.json();
}
async function wdSubmit(item) {
  const cfg = await wdConfig();
  if (!cfg?.scriptUrl || !state.user) return;
  const q = wdQueue().filter((x) => x.date !== item.date);
  q.push(item); wdSetQueue(q);
  await wdFlushQueue(true);
}
async function wdFlushQueue(interactive = false) {
  const cfg = await wdConfig();
  if (!cfg?.scriptUrl || !state.user || wd.flushing) return;
  let q = wdQueue();
  if (!q.length) return;
  wd.flushing = true;
  try {
    const cred = interactive ? await wdFreshToken() : (state.user.credExp > Date.now() + 120000 ? state.user.credential : null);
    if (!cred) { if (interactive) wdMsg("Rezultat bo poslan ob naslednji prijavi."); return; }
    for (const item of [...q]) {
      try {
        const res = await wdPost(cfg.scriptUrl, item, cred);
        if (res.ok || ["bad_date", "future_date", "not_a_puzzle_date", "bad_guesses", "not_allowed"].includes(res.error)) {
          q = q.filter((x) => x.date !== item.date);
          if (!res.ok && res.error === "not_allowed") wdMsg("Rezultat ni shranjen (račun ni na seznamu).");
        }
      } catch { /* network: keep queued */ }
    }
    wdSetQueue(q);
    loadScoreboard(true);
  } finally { wd.flushing = false; }
}

async function loadScoreboard(force = false) {
  const cfg = await wdConfig();
  const box = $("#wd-score");
  if (!box) return;
  if (!cfg?.scriptUrl) { box.hidden = true; return; }
  box.hidden = false;
  if (!wd.scores || force) {
    $("#wd-score-body").innerHTML = `<p class="muted-text">Nalagam lestvico …</p>`;
    try {
      const r = await fetch(`${cfg.scriptUrl}${cfg.scriptUrl.includes("?") ? "&" : "?"}t=${Date.now()}`);
      const j = await r.json();
      wd.scores = j.ok ? j.results || [] : [];
    } catch { wd.scores = null; }
  }
  renderScoreboard();
}
function wdWho(email, name) {
  const person = personForUser({ email, name });
  const label = person ? displayName(person) : (name || email).split(/\s+/)[0];
  const av = person?.photo ? `<img class="avatar avatar-sm" src="${esc(person.photo)}" alt="" loading="lazy" />`
    : `<span class="avatar avatar-sm avatar-initials" aria-hidden="true">${esc(initials(person?.name || name || email))}</span>`;
  return { label, av, title: person?.name || name || email };
}
function renderScoreboard() {
  const body = $("#wd-score-body");
  if (!body) return;
  if (wd.scores === null) { body.innerHTML = `<p class="muted-text">Lestvice ni bilo mogoče naložiti.</p>`; return; }
  const tab = wd.scoreTab || "danes";
  $$(".wd-stab").forEach((b) => b.setAttribute("aria-selected", b.dataset.stab === tab ? "true" : "false"));
  const today = ljNow().date;
  if (tab === "danes") {
    const rows = wd.scores.filter((r) => r.date === today)
      .sort((a, b) => (a.solved === b.solved ? a.guesses - b.guesses : a.solved ? -1 : 1));
    body.innerHTML = rows.length ? `<ol class="wd-board-list">${rows.map((r, i) => {
      const w = wdWho(r.email, r.name);
      return `<li><span class="wd-rank">${i + 1}.</span>${w.av}<span class="wd-name" title="${esc(w.title)}">${esc(w.label)}</span><span class="wd-res${r.solved ? "" : " fail"}">${r.solved ? `${r.guesses}/6` : "X/6"}</span><span class="wd-pts">${r.solved ? 7 - r.guesses : 0} t</span></li>`;
    }).join("")}</ol>` : `<p class="muted-text">Danes še ni rezultatov.</p>`;
    return;
  }
  const agg = {};
  for (const r of wd.scores) {
    const a = (agg[r.email] ||= { email: r.email, name: r.name, points: 0, solved: 0, played: 0, sumG: 0 });
    a.played++; if (r.solved) { a.solved++; a.points += 7 - r.guesses; a.sumG += r.guesses; }
  }
  const rows = Object.values(agg).sort((a, b) => b.points - a.points || b.solved - a.solved || (a.sumG / (a.solved || 1)) - (b.sumG / (b.solved || 1)));
  body.innerHTML = rows.length ? `<ol class="wd-board-list total">${rows.map((a, i) => {
    const w = wdWho(a.email, a.name);
    const rank = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    return `<li><span class="wd-rank${i < 3 ? " medal" : ""}">${rank}</span>${w.av}<span class="wd-name" title="${esc(w.title)}">${esc(w.label)}</span><span class="wd-res">${a.points} t</span></li>`;
  }).join("")}</ol>` : `<p class="muted-text">Še ni rezultatov.</p>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest(".wd-stab");
  if (t) { wd.scoreTab = t.dataset.stab; renderScoreboard(); }
});

async function init() {
  await loadData();
  state.mobileDay = upcomingDayId() || ttDays()[0]?.id;
  setInterval(() => { placeNowLine(); placeUuNow(); }, 60000);
  window.addEventListener("resize", () => { placeNowLine(); placeUuNow(); });
  state.user = loadUser();
  try { state.simRole = sessionStorage.getItem("uvodja.simRole"); } catch { state.simRole = null; }
  bindControls();
  applyTheme(document.documentElement.dataset.theme === "cgp" ? "cgp" : "default");
  $("#theme-toggle")?.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "cgp" ? "default" : "cgp"));
  bindNavMore();
  MOBILE_MQ.addEventListener("change", () => renderTimetable());
  renderHome();
  renderDayNav();
  renderTimetable();
  renderGradiva();
  renderTeme();
  renderZadolzitve();
  renderIzrocki();
  renderEkipa();
  applyAuth();
  applyHash();
  wdFlushQueue();
}

init().catch((err) => {
  document.getElementById("main").innerHTML = `<div class="card"><h2>Napaka</h2><p>${esc(err.message)}</p></div>`;
});

/* —— Page visit logging → Apps Script (type:'visit'), fire-and-forget; stats for admin on Domov —— */
// SHA-256 of the emails allowed to see Obiski (kept hashed so it isn't in public JS)
const VISIT_ADMIN_SHA = ["caed857b06ee83053725a689bcad9be98c48bfb40ed43ec208336da36e315807"]; // tilen.miklavic@gmail.com (not in the mails sheet → admin)
async function sha256hex(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
let visitAdminChecked = null;
function checkVisitAdmin(u) {
  const e = u?.email?.toLowerCase() || "";
  if (visitAdminChecked === e) return;
  visitAdminChecked = e;
  if (!e || !crypto?.subtle) { state.visitAdmin = null; state.visitAdminPending = false; return; }
  state.visitAdminPending = true;
  sha256hex(e).then((h) => {
    if (state.user?.email?.toLowerCase() === e) state.visitAdminPending = false;
    const v = VISIT_ADMIN_SHA.includes(h) ? e : null;
    if (state.user?.email?.toLowerCase() !== e) return;
    if (v === (state.visitAdmin || null)) { if (location.hash.replace(/^#/, "") !== currentTab) applyHash(); return; }
    state.visitAdmin = v;
    applyAuth(); applyHash();
  }).catch(() => { state.visitAdminPending = false; });
}
const visitLast = {};
/* Silent ID-token refresh (GIS auto_select prompt; no login modal). Shared promise; resolves token or null after ms. */
let tokenRefreshP = null;
function silentToken(ms = 5000) {
  const u = state.user;
  if (!u) return Promise.resolve(null);
  if (u.credential && u.credExp > Date.now() + 120000) return Promise.resolve(u.credential);
  if (tokenRefreshP) return tokenRefreshP;
  tokenRefreshP = new Promise((resolve) => {
    let done = false;
    const fin = (c) => { if (done) return; done = true; clearTimeout(t); resolve(c || null); setTimeout(() => { tokenRefreshP = null; }, c ? 0 : 60000); };
    const t = setTimeout(() => fin(null), ms);
    (state.tokenWaiters ||= []).push(fin);
    const go = (n = 0) => {
      const g = window.google?.accounts?.id;
      if (!g) { if (n < 25 && !done) setTimeout(() => go(n + 1), 200); return; }
      if (!state.gsiReady) initGsi();
      try { g.prompt(); } catch { fin(null); }
    };
    go();
  });
  return tokenRefreshP;
}
function logVisit(page) {
  try {
    const u = state.user;
    if (!u || !page) return;
    const now = Date.now();
    if (visitLast[page] && now - visitLast[page] < 30000) return;
    visitLast[page] = now;
    Promise.all([wdConfig(), silentToken(5000)]).then(([cfg, tok]) => {
      if (!cfg?.scriptUrl) return;
      const device = window.matchMedia("(max-width: 860px)").matches ? "mobile" : "desktop";
      const cur = state.user || u;
      const credential = tok || (cur.credExp > Date.now() + 30000 ? cur.credential : "");
      fetch(cfg.scriptUrl, { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "visit", credential, email: cur.email, name: cur.name, page, device, ts: now }) }).catch(() => {});
    }).catch(() => {});
  } catch {}
}
const PAGE_LABEL = { domov: "Domov", casovnica: "Časovnica", teme: "Teme", tema: "Tema (podstran)", ekipa: "Ekipa", oseba: "Oseba (podstran)", os: "OS", preverbe: "Preverbe", analitika: "Analitika", zabava: "Zabava", noaccess: "Brez dostopa" };
let visitsLoadedAt = 0;
async function renderVisits() {
  const box = $("#visits");
  if (!box) return;
  const isAdmin = canSee("analitika");
  box.hidden = !isAdmin;
  if (!isAdmin || Date.now() - visitsLoadedAt < 60000) return;
  visitsLoadedAt = Date.now();
  const body = $("#visits-body");
  body.innerHTML = `<p class="muted-text">Nalagam …</p>`;
  try {
    const cfg = await wdConfig();
    if (!cfg?.scriptUrl) throw new Error("no url");
    const credential = await silentToken(8000);
    if (!credential) throw new Error("no token");
    const r = await fetch(cfg.scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ type: "visitstats", credential }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "err");
    const days = [];
    const nowIso = ljNow().date;
    const base = new Date(nowIso + "T12:00:00Z");
    for (let i = 13; i >= 0; i--) {
      const iso = new Date(base.getTime() - i * 864e5).toISOString().slice(0, 10);
      days.push([iso, (d.perDay || {})[iso] || 0]);
    }
    const max = Math.max(1, ...days.map((x) => x[1]));
    const bars = days.map(([iso, n]) => `<div class="vbar" title="${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.: ${n}">
      <span class="vbar-n">${n || ""}</span><span class="vbar-fill" style="height:${(n / max) * 100}%"></span>
      <span class="vbar-d">${Number(iso.slice(8))}.</span></div>`).join("");
    const pages = Object.entries(d.perPage || {}).sort((a, b) => b[1] - a[1]);
    const pmax = Math.max(1, ...pages.map((x) => x[1]));
    const row = (label, n, m, extra = "") => `<li class="vrow"><span class="vrow-l">${label}${extra}</span><span class="vrow-bar"><span style="width:${(n / m) * 100}%"></span></span><span class="vrow-n">${n}</span></li>`;
    const people = d.perPerson || [];
    const hmax = Math.max(1, ...people.map((p) => p.count));
    body.innerHTML = `<p class="muted-text">Skupaj ${d.total || 0} ogledov</p>
      <h3 class="visits-h">Zadnjih 14 dni</h3><div class="vbars">${bars}</div>
      <h3 class="visits-h">Po straneh</h3><ul class="vrows">${pages.map(([p, n]) => row(esc(PAGE_LABEL[p] || p), n, pmax)).join("") || "<li class='muted-text'>Ni podatkov</li>"}</ul>
      <h3 class="visits-h">Po osebah</h3><ul class="vrows">${people.map((p) => row(esc(displayName(p.name || p.email)), p.count, hmax)).join("") || "<li class='muted-text'>Ni podatkov</li>"}</ul>`;
  } catch {
    visitsLoadedAt = 0;
    body.innerHTML = `<p class="muted-text">Statistike trenutno niso na voljo.</p>`;
  }
}

/* —— OS: participant groups per spremljevalec (data/os.json ← Drive 02_Program/OS/skupine) —— */
let osData, osDays;
/** OS content per day (data/os_days.json ← Drive 02_Program/OS, doc »OS«). */
async function renderOsDays() {
  const el = $("#os-days-list");
  if (!el) return;
  if (osDays === undefined) {
    try { const r = await fetch("data/os_days.json", { cache: "no-store" }); osDays = r.ok ? await r.json() : null; } catch { osDays = null; }
  }
  const segHtml = (segs) => segs.map((s) => {
    const t = esc(s.t).replace(/\n/g, "<br>");
    return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${t}</a>` : t;
  }).join("");
  const para = (p) => p.bullet ? `<li>${segHtml(p.segs)}</li>` : `<p>${segHtml(p.segs)}</p>`;
  const group = (paras) => {
    let html = "", open = false;
    for (const p of paras) {
      if (p.bullet && !open) { html += "<ul>"; open = true; }
      if (!p.bullet && open) { html += "</ul>"; open = false; }
      html += para(p);
    }
    return html + (open ? "</ul>" : "");
  };
  const labels = osDays.sections || {};
  const body = (paras) => {
    const blocks = [];
    for (const p of paras) {
      const last = blocks[blocks.length - 1];
      if (last && last.sec === p.sec) last.items.push(p); else blocks.push({ sec: p.sec, items: [p] });
    }
    return blocks.map((b) => `<section class="os-sec os-sec-${esc(b.sec || "")}">
      ${b.sec ? `<h4 class="os-sec-label">${esc(labels[b.sec] || b.sec)}</h4>` : ""}${group(b.items)}</section>`).join("");
  };
  if (!osDays?.days?.length) { el.innerHTML = `<p class="muted-text">Vsebina še ni objavljena.</p>`; return; }
  el.innerHTML = osDays.days.map((d) => {
    const extra = (d.extra || []).map((x) => x.url
      ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text)).join(" · ");
    return `<details class="card os-day"><summary><span class="os-day-n">${d.n}. dan</span>
        <span class="os-day-title">${esc(d.title || "")}</span></summary>
      ${extra ? `<p class="muted-text os-day-extra">${extra}</p>` : ""}
      <div class="os-day-body">${body(d.content)}</div></details>`;
  }).join("");
}

/* —— Preverbe: Teme = today's tema feedback forms (embedded Google Forms), Generalno = 3 free-text forms → Apps Script → Preverbe/Vprašanja sheets —— */
let pvData;
async function renderPreverbe(sub = "teme") {
  const teme = $("#pv-teme"), gen = $("#pv-generalno");
  if (!teme) return;
  $$(".pv-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.pvTab === sub)));
  teme.hidden = sub !== "teme"; gen.hidden = sub !== "generalno";
  if (pvData === undefined) {
    try { const r = await fetch("data/preverbe.json", { cache: "no-store" }); pvData = r.ok ? await r.json() : null; } catch { pvData = null; }
  }
  if (sub === "teme") renderPvTeme(teme); else renderPvGeneral(gen);
}
function renderPvTeme(box) {
  const today = ljNow().date, temas = state.data?.temas || {};
  const forms = (pvData?.temaForms || []).flatMap((f) => {
    const t = temas[f.tema];
    const occ = (t?.occurrences || []).filter((o) => o.date === today).sort((a, b) => a.start.localeCompare(b.start))[0];
    return occ ? [{ ...f, name: t.title, occ }] : [];
  }).sort((a, b) => a.occ.start.localeCompare(b.occ.start));
  if (!forms.length) {
    const next = (pvData?.temaForms || []).flatMap((f) => (temas[f.tema]?.occurrences || []).map((o) => o.date)).filter((d) => d > today).sort()[0];
    box.innerHTML = `<div class="card pv-empty"><p>Danes ni preverb tem.</p>${next ? `<p class="muted-text">Naslednje preverbe: ${Number(next.slice(8))}. ${Number(next.slice(5, 7))}.</p>` : ""}</div>`;
    return;
  }
  const key = forms.map((f) => f.formId).join() + today;
  if (box.dataset.key === key) return; // keep iframes (and half-filled forms) when switching tabs
  box.dataset.key = key;
  box.innerHTML = `<p class="muted-text pv-lede">Preverbe tem za danes – izpolni po vsaki temi.</p>` + forms.map((f) => `<details class="card pv-form"${forms.length === 1 ? " open" : ""}>
      <summary><span class="pv-form-title">${esc(f.name)}</span><span class="muted-text">${esc(f.occ.start)}–${esc(f.occ.end)}</span></summary>
      <iframe src="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform?embedded=true" title="${esc(f.title)}" loading="lazy">Nalagam …</iframe>
      <p class="pv-open"><a href="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform" target="_blank" rel="noopener">Odpri obrazec v novem oknu ↗</a></p>
    </details>`).join("");
}
function renderPvGeneral(box) {
  if (box.dataset.ready) return;
  box.dataset.ready = "1";
  box.innerHTML = (pvData?.general || []).map((g) => `<form class="card pv-gen" data-pv-kind="${esc(g.key)}">
      <label for="pv-${esc(g.key)}"><strong>${esc(g.label)}</strong><span class="muted-text">${esc(g.hint)}</span></label>
      <textarea id="pv-${esc(g.key)}" name="text" rows="4" maxlength="5000" required></textarea>
      <div class="pv-gen-foot">
        <label class="pv-anon"><input type="checkbox" name="anon" /> Pošlji anonimno</label>
        <button type="submit" class="btn primary">Pošlji</button>
      </div>
      <p class="pv-status" role="status" aria-live="polite"></p>
    </form>`).join("");
}
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-pv-kind]");
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim(), status = $(".pv-status", form), btn = $("button[type=submit]", form);
  if (!text) return;
  btn.disabled = true; status.className = "pv-status"; status.textContent = "Pošiljam …";
  try {
    const cfg = await wdConfig();
    if (!cfg?.scriptUrl) throw new Error("ni povezave");
    const credential = await wdFreshToken();
    if (!credential) throw new Error("prijava je potekla – osveži stran");
    const u = state.user, anon = form.anon.checked;
    const res = await wdPost(cfg.scriptUrl, { type: "preverba", kind: form.dataset.pvKind, text, anon, email: anon ? "" : u.email, name: anon ? "" : u.name, ts: Date.now() }, credential);
    if (!res?.ok) throw new Error(res?.error || "napaka strežnika");
    form.reset(); status.classList.add("is-ok"); status.textContent = "Hvala! Odgovor je poslan.";
  } catch (err) {
    status.classList.add("is-err"); status.textContent = `Pošiljanje ni uspelo (${err.message || err}). Poskusi znova.`;
  } finally { btn.disabled = false; }
});
/* —— UU: Gantt of participant presence (data/prisotnost.json, derived from the UU sheet "Opombe") —— */
let uuAbsences;
/* Contact details are read live from the UU sheet with the viewer's own Google access (repo is public, so nothing is stored here).
   Requires the Sheets API enabled + spreadsheets.readonly scope on the GSI_CLIENT_ID project. Token and rows stay in memory only. */
const UU_SHEET_ID = "1a_8ghLlrhMexb5VS-U9M5aPcP4yK6mAnDLdp0Eg74NQ", UU_SHEET_TAB = "Seznam udeležencev";
const UU_SHEET_URL = `https://docs.google.com/spreadsheets/d/${UU_SHEET_ID}/edit#gid=0`;
let uuToken = null, uuContacts = null;
const uuNorm = (x) => String(x || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const UU_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
/* prompt "" = silent if already granted; "select_account" lets the viewer pick another Google account */
function uuRequestToken(prompt = "") {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) return reject(new Error("Google prijava ni naložena"));
    if (!prompt && uuToken && uuToken.exp > Date.now() + 60000) return resolve(uuToken);
    const hint = state.user?.email || "";
    oauth.initTokenClient({
      client_id: GSI_CLIENT_ID, scope: `${UU_SCOPE} https://www.googleapis.com/auth/userinfo.email`, hint, login_hint: hint,
      callback: async (r) => {
        if (r.error) return reject(Object.assign(new Error(r.error), { code: r.error }));
        // Which account did Google actually issue the token for, and was the Sheets scope granted?
        let info = {}; try { info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(r.access_token)}`)).json(); } catch {}
        uuToken = { value: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000, email: info.email || "", scoped: String(info.scope || r.scope || "").includes(UU_SCOPE) };
        resolve(uuToken);
      },
      error_callback: (e) => reject(Object.assign(new Error(e?.type || "popup"), { code: e?.type || "popup" })),
    }).requestAccessToken({ prompt });
  });
}
async function uuLoadContacts(prompt = "") {
  if (uuContacts && !prompt) return uuContacts;
  const tok = await uuRequestToken(prompt);
  if (!tok.scoped) throw Object.assign(new Error("scope"), { code: "scope", email: tok.email });
  const ranges = [`'${UU_SHEET_TAB}'!A2:B`, `'${UU_SHEET_TAB}'!F2:G`].map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${UU_SHEET_ID}/values:batchGet?${ranges}`, { headers: { Authorization: `Bearer ${tok.value}` } });
  if (!r.ok) {
    if (r.status === 401) uuToken = null;
    let e = {}; try { e = (await r.json()).error || {}; } catch {}
    const reason = (e.details || []).map((d) => d.reason).find(Boolean) || (e.errors || []).map((d) => d.reason).find(Boolean) || e.status || "";
    throw Object.assign(new Error(e.message || `HTTP ${r.status}`), { status: r.status, code: reason, email: tok.email });
  }
  const [names, contacts] = (await r.json()).valueRanges.map((v) => v.values || []);
  uuContacts = new Map(names.map(([ime, priimek], i) => [uuNorm(`${ime} ${priimek}`), { email: contacts[i]?.[0] || "", phone: contacts[i]?.[1] || "" }]));
  return uuContacts;
}
function uuContactError(err) {
  const acc = err.email ? ` (${esc(err.email)})` : "";
  if (/SERVICE_DISABLED|accessNotConfigured/i.test(err.code) || /has not been used|is disabled/i.test(err.message))
    return "Google Sheets API v projektu Google Cloud za to stran še ni vklopljen.";
  if (err.code === "scope" || /SCOPE_INSUFFICIENT|insufficientPermissions/i.test(err.code))
    return `Dostop do Google Sheets ni bil odobren${acc}.`;
  if (err.code === "access_denied") return "Dostop do Google Sheets je bil zavrnjen.";
  if (/popup/.test(err.code)) return "Okno za Google prijavo je bilo zaprto ali blokirano.";
  if (err.status === 403 || err.status === 404) return `Račun ${err.email ? esc(err.email) : "v uporabi"} nima dostopa do tabele UU.`;
  return `Kontakta ni bilo mogoče naložiti (${esc(err.message || err)}).`;
}
async function uuShowContact(btn) {
  const box = btn.closest(".uu-contact");
  btn.disabled = true; btn.textContent = "Nalagam …";
  try {
    const c = (await uuLoadContacts(btn.dataset.uuContact || "")).get(uuNorm(box.dataset.name));
    box.innerHTML = !c ? `<span class="muted-text">Ni najden v tabeli UU.</span> <a href="${UU_SHEET_URL}" target="_blank" rel="noopener">Odpri tabelo ↗</a>`
      : [c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, c.phone && `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a>`].filter(Boolean).join(" · ") || `<span class="muted-text">Brez kontakta v tabeli.</span>`;
  } catch (err) {
    box.innerHTML = `<span class="muted-text">${uuContactError(err)}</span> <button type="button" class="btn ghost uu-contact-btn" data-uu-contact="select_account">Poskusi z drugim računom</button> <a href="${UU_SHEET_URL}" target="_blank" rel="noopener">Odpri tabelo ↗</a>`;
    console.warn("UU contact", err.status || "", err.code || "", err.message, err.email || "");
  }
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-uu-contact]"); if (b) { e.preventDefault(); uuShowContact(b); } });
const hm = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hh = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const uuSlug = (name) => String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const shortDay = (label) => label.replace(/,\s*(\d+\. \d+)\. \d+$/, " $1.");
async function renderUU(slug = null) {
  const box = $("#uu-chart"), list = $("#uu-list-view"), detail = $("#uu-detail-view");
  if (!box) return;
  if (osData === undefined) {
    try { const r = await fetch("data/os.json", { cache: "no-store" }); osData = r.ok ? await r.json() : null; } catch { osData = null; }
  }
  if (uuAbsences === undefined) {
    try { const r = await fetch("data/prisotnost.json", { cache: "no-store" }); uuAbsences = r.ok ? (await r.json()).absences : null; } catch { uuAbsences = null; }
    // Late on the 2nd-weekend Friday (absent from the start of the day) ⇒ not there on Thursday evening either
    (uuAbsences || []).filter((a) => a.day === "vikend2-petek" && !a.from).forEach((a) => {
      if (!uuAbsences.some((x) => x.name === a.name && x.day === "vikend2-cetrtek"))
        uuAbsences.push({ name: a.name, day: "vikend2-cetrtek", ...(a.tentative ? { tentative: true } : {}), note: `četrtek 5. 11. ni (zaradi petka: ${a.note})` });
    });
  }
  const days = (state.data?.days || []).map((d) => {
    const ss = d.sessions.filter((s) => !/^Spanje/.test(s.title));
    return { id: d.id, date: d.date, label: d.label, weekend: d.weekend, start: Math.min(...ss.map((s) => hm(s.start))), end: Math.max(...ss.map((s) => hm(s.end))) };
  });
  const members = (osData?.groups || []).flatMap((g) => g.members.map((m) => ({ ...m, group: g.n, spr: g.spremljevalec, sprSlug: g.slug, slug: uuSlug(m.name) })));
  if (!days.length || !members.length) { box.innerHTML = `<p class="muted-text">Podatki še niso na voljo.</p>`; return; }
  const byName = new Map();
  (uuAbsences || []).forEach((a) => { if (!byName.has(a.name)) byName.set(a.name, []); byName.get(a.name).push(a); });
  const pct = (d, t) => ((Math.min(Math.max(t, d.start), d.end) - d.start) / (d.end - d.start)) * 100;
  const segsFor = (m, d) => (byName.get(m.name) || []).filter((a) => a.day === d.id)
    .map((a) => ({ a, from: a.from ? hm(a.from) : d.start, to: a.to ? hm(a.to) : d.end }));
  const barsFor = (m, d) => segsFor(m, d).map(({ a, from, to }) => {
    const l = pct(d, from), w = pct(d, to) - l;
    return w > 0 ? `<i class="uu-bar ${a.tentative ? "uu-tentative" : "uu-absent"}" style="left:${l}%;width:${w}%" title="${esc(`${m.name}: odsoten/a ${hh(from)}–${hh(to)}${a.tentative ? " (ni potrjeno)" : ""} – ${a.note}`)}"></i>` : "";
  }).join("");
  const cell = (m, d) => `<div class="uu-cell" style="flex:${d.end - d.start}"><i class="uu-bar uu-present" style="left:0;width:100%"></i>${barsFor(m, d)}</div>`;
  const weekends = [1, 2].map((w) => days.filter((d) => d.weekend === w));
  const wkFlex = (ds) => ds.reduce((a, d) => a + d.end - d.start, 0);
  const m = slug && members.find((x) => x.slug === slug);
  list.hidden = !!m; detail.hidden = !m;
  if (m) {
    const people = state.data?.people || {};
    const sp = m.sprSlug && people[m.sprSlug];
    let total = 0, away = 0;
    const rows = days.map((d) => {
      const segs = segsFor(m, d);
      total += d.end - d.start;
      away += segs.filter((x) => !x.a.tentative).reduce((acc, x) => acc + Math.max(0, x.to - x.from), 0);
      const ticks = []; for (let t = Math.ceil(d.start / 120) * 120; t < d.end; t += 120) ticks.push(`<span class="uu-tick" style="left:${pct(d, t)}%">${t / 60}</span>`);
      const text = segs.length
        ? `<ul class="uu-abs-list">${segs.map(({ a, from, to }) => `<li class="${a.tentative ? "is-tentative" : ""}"><strong>${a.from || a.to ? `${hh(from)}–${hh(to)}` : "ves dan"}</strong>${a.tentative ? " <span class=\"muted-text\">(ni potrjeno)</span>" : ""} · ${esc(a.note)}</li>`).join("")}</ul>`
        : `<p class="muted-text uu-allday">Prisoten/a ves čas</p>`;
      return `<div class="uu-drow"><div class="uu-dlabel"><strong>${esc(shortDay(d.label))}</strong><span class="muted-text">${hh(d.start)}–${hh(d.end)}</span></div>
        <div class="uu-dbody"><div class="uu-cell uu-big" data-uu-date="${d.date}" data-uu-span="${d.start}-${d.end}"><i class="uu-bar uu-present" style="left:0;width:100%"></i>${barsFor(m, d)}</div><div class="uu-ticks">${ticks.join("")}</div>${text}</div></div>`;
    }).join("");
    const presentPct = Math.round(((total - away) / total) * 100);
    const known = uuContacts?.get(uuNorm(m.name));
    const contact = `<p class="uu-contact" data-name="${esc(m.name)}">${known
      ? [known.email && `<a href="mailto:${esc(known.email)}">${esc(known.email)}</a>`, known.phone && `<a href="tel:${esc(known.phone.replace(/[^\d+]/g, ""))}">${esc(known.phone)}</a>`].filter(Boolean).join(" · ")
      : `<button type="button" class="btn ghost uu-contact-btn" data-uu-contact>Pokaži kontakt</button>`}</p>`;
    detail.innerHTML = `<p class="person-back"><a href="#uu" data-tab-link="uu">← Nazaj na prisotnost</a></p>
      <header class="card uu-person"><div class="uu-person-head">${avatarHtml(m, "avatar-os")}<div><h2>${esc(m.name)}</h2>
        <p class="muted-text">${m.steg ? `${esc(m.steg)} · ` : ""}<a href="#os/${m.group}">Skupina ${m.group}</a> · spremljevalec ${esc(sp ? displayName(sp) : displayName(m.spr))}</p>${contact}</div></div>
        <p class="uu-summary">Prisotnost: <strong>${presentPct} %</strong> programa${(byName.get(m.name) || []).some((a) => a.tentative) ? ` <span class="muted-text">(brez nepotrjenih odsotnosti)</span>` : ""}</p></header>
      <div class="uu-legend" aria-hidden="true"><span><i class="uu-key uu-present"></i>prisoten/a</span><span><i class="uu-key uu-tentative"></i>odsotnost ni potrjena</span><span><i class="uu-key uu-absent"></i>odsoten/a</span></div>
      <div class="card uu-days-detail">${rows}</div>`;
    window.scrollTo(0, 0);
    placeUuNow();
    return;
  }
  // Short labels: "Anže M."; extend the surname prefix only when two people would collide
  const short = new Map();
  for (let n = 1; short.size < members.length && n < 12; n++) {
    members.filter((x) => !short.has(x.name)).forEach((x) => {
      const [first, ...rest] = x.name.split(" ");
      const lab = `${first} ${rest.join(" ").slice(0, n)}.`;
      if (members.filter((y) => y.name.split(" ")[0] === first && y.name !== x.name).every((y) => { const [f2, ...r2] = y.name.split(" "); return `${f2} ${r2.join(" ").slice(0, n)}.` !== lab; })) short.set(x.name, lab);
    });
  }
  const body = members.slice().sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, "sl")).map((x, i, arr) => {
    const first = i === 0 || arr[i - 1].group !== x.group;
    const gap = byName.get(x.name) || [];
    return `${first ? `<div class="uu-grouphead"><span>Skupina ${x.group}</span></div>` : ""}<div class="uu-row"><div class="uu-name"><a href="#uu/${x.slug}" title="${esc(x.name)}">${esc(short.get(x.name) || x.name)}</a>${gap.length ? `<span class="uu-flag" title="${esc(gap.map((a) => a.note).join(" · "))}">!</span>` : ""}</div>
      <div class="uu-days">${weekends.map((ds) => `<div class="uu-weekend" style="flex:${wkFlex(ds)}">${ds.map((d) => cell(x, d)).join("")}</div>`).join("")}</div></div>`;
  }).join("");
  $("#uu-sub").textContent = `${members.length} udeležencev · ${new Set((uuAbsences || []).map((a) => a.name)).size} z odsotnostmi`;
  box.innerHTML = `<div class="uu-scroll"><div class="uu-row uu-head"><div class="uu-name">Ime</div>
    <div class="uu-days">${weekends.map((ds, i) => `<div class="uu-weekend" style="flex:${wkFlex(ds)}"><div class="uu-wk-title">${i + 1}. vikend</div><div class="uu-daysrow">${ds.map((d) => `<div class="uu-cell uu-dayhead" data-uu-date="${d.date}" data-uu-span="${d.start}-${d.end}" style="flex:${d.end - d.start}"><strong>${esc(shortDay(d.label))}</strong></div>`).join("")}</div></div>`).join("")}</div></div>${body}</div>`;
  placeUuNow();
}
/* Live "now" marker (Europe/Ljubljana) on the UU chart: inside today's column, or in the gap between weekends on non-event days */
function placeUuNow() {
  $$(".uu-now, .uu-now-d").forEach((n) => n.remove());
  const now = ljNow();
  const frac = (el) => { const [a, b] = el.dataset.uuSpan.split("-").map(Number); return Math.min(1, Math.max(0, (now.min - a) / (b - a))); };
  const big = $(`#uu-detail-view:not([hidden]) .uu-big[data-uu-date="${now.date}"]`);
  if (big) big.insertAdjacentHTML("beforeend", `<i class="uu-now-d" style="left:${frac(big) * 100}%" title="Zdaj ${now.label}"></i>`);
  const scroll = $("#uu-chart .uu-scroll");
  if (!scroll || !scroll.offsetParent) return;
  const heads = $$(".uu-dayhead[data-uu-date]", scroll), x0 = scroll.getBoundingClientRect().left - scroll.scrollLeft;
  const today = heads.find((h) => h.dataset.uuDate === now.date);
  let x;
  if (today) { const r = today.getBoundingClientRect(); x = r.left - x0 + frac(today) * r.width; }
  else {
    const i = heads.findIndex((h) => h.dataset.uuDate > now.date);
    if (i <= 0) return; // before the first or after the last day
    x = (heads[i - 1].getBoundingClientRect().right + heads[i].getBoundingClientRect().left) / 2 - x0;
  }
  const line = document.createElement("div");
  line.className = "uu-now";
  line.style.left = `${x}px`;
  line.style.height = `${scroll.scrollHeight}px`;
  line.setAttribute("aria-label", `Zdaj ${now.label}`);
  line.innerHTML = `<span class="uu-now-label">${today ? now.label : "Danes"}</span>`;
  scroll.appendChild(line);
}
async function renderOs(groupN = null) {
  const box = $("#os-groups"), list = $("#os-list-view"), detail = $("#os-detail-view");
  if (!box) return;
  if (osData === undefined) {
    box.innerHTML = `<p class="muted-text">Nalagam …</p>`;
    try { const r = await fetch("data/os.json", { cache: "no-store" }); osData = r.ok ? await r.json() : null; } catch { osData = null; }
  }
  const people = state.data?.people || {};
  const sprLabel = (g) => esc(g.slug && people[g.slug] ? displayName(people[g.slug]) : displayName(g.spremljevalec));
  const g = groupN && osData?.groups?.find((x) => String(x.n) === String(groupN));
  list.hidden = !!g; detail.hidden = !g;
  if (!g) renderOsDays();
  if (g) {
    const p = g.slug && people[g.slug];
    const who = p && canSee("ekipa") ? `<a class="os-spr-link" href="#oseba-${esc(g.slug)}">${avatarHtml(p, "avatar-sm")}<span>${sprLabel(g)}</span></a>`
      : `<span class="os-spr-link">${p ? avatarHtml(p, "avatar-sm") : ""}<span>${sprLabel(g)}</span></span>`;
    $("#os-detail").innerHTML = `<header class="os-detail-head"><h2>Skupina ${g.n}</h2>
        <p class="os-spr"><span class="muted-text">Spremljevalec</span> <strong>${who}</strong></p>
        <p class="muted-text">${g.members.length} udeležencev</p></header>
      <ul class="os-people">${g.members.map((m) => `<li class="card os-person">${avatarHtml(m, "avatar-os")}
        <div class="os-person-txt"><span class="os-name">${esc(m.name)}</span>${m.steg ? `<span class="os-steg muted-text">${esc(m.steg)}</span>` : ""}</div></li>`).join("")}</ul>`;
    return;
  }
  if (!osData?.groups?.length) { box.innerHTML = `<p class="muted-text">Skupine še niso objavljene.</p>`; return; }
  const total = osData.groups.reduce((a, x) => a + x.members.length, 0);
  $("#os-sub").textContent = `${osData.groups.length} skupin · ${total} udeležencev`;
  const me = personForUser(state.user)?.slug;
  box.innerHTML = osData.groups.map((x) => `<a class="card os-card${x.slug && x.slug === me ? " is-mine" : ""}" href="#os/${x.n}" aria-label="Skupina ${x.n}, spremljevalec ${sprLabel(x)}">
      <header class="os-card-head"><h3>Skupina ${x.n}</h3><p class="os-spr"><span class="muted-text">Spremljevalec</span> <strong>${sprLabel(x)}</strong></p></header>
      <div class="os-faces">${x.members.map((m) => avatarHtml(m, "avatar-xs")).join("")}<span class="os-more" aria-hidden="true">›</span></div>
      <ul class="os-members">${x.members.map((m) => `<li><span class="os-name">${esc(m.name)}</span>${m.steg ? `<span class="os-steg muted-text">${esc(m.steg)}</span>` : ""}</li>`).join("")}</ul>
    </a>`).join("");
}
