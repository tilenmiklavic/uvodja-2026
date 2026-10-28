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
  const h = Math.round($(".site-header")?.getBoundingClientRect().height || 0) || 60;
  document.documentElement.style.setProperty("--hdr-h", `${h}px`);
}

/* Account dropdown (avatar in header / row in ≡ menu); delegated so it survives applyAuth re-renders */
function setUserMenu(open) {
  const m = $("#user-menu"), b = $("#user-btn");
  if (!m || !b) return;
  m.hidden = !open;
  b.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && m.closest(".nav-more.open")) m.scrollIntoView({ block: "nearest" }); // mobile ≡ menu scrolls; bring Odjava into view
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
  // --hdr-h positions the sticky day strip / dates under the header: follow the header's real size (rotation,
  // wrapping tabs, app resumed from the background) instead of measuring only on window resize
  syncHeaderHeight();
  window.addEventListener("resize", syncHeaderHeight);
  window.addEventListener("orientationchange", () => setTimeout(syncHeaderHeight, 300));
  window.addEventListener("pageshow", syncHeaderHeight);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncHeaderHeight(); });
  if ("ResizeObserver" in window && $(".site-header")) new ResizeObserver(syncHeaderHeight).observe($(".site-header"));
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
const ALL_PAGES = ["domov", "casovnica", "teme", "gradiva", "ekipa", "os", "uu", "preverbe", "zabava", "vprasanja", "analitika"];

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
    const prev = state.user && state.user.email.toLowerCase() === String(c.email || "").toLowerCase() ? state.user : null;
    if (prev?.session) { u.session = prev.session; u.sessionExp = prev.sessionExp; }
    localStorage.setItem("uvodja.user", JSON.stringify(u));
    const wasSignedIn = !!state.user;
    if (wasSignedIn && state.user.email.toLowerCase() !== String(c.email || '').toLowerCase()) { (state.tokenWaiters || []).splice(0).forEach((f) => f(null)); return; }
    state.user = u;
    (state.tokenWaiters || []).splice(0).forEach((f) => f(u.credential));
    applyAuth();
    if (!wasSignedIn) applyHash();
    wdFlushQueue();
    ensureSession();
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
  scriptData = {};
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
  // Mobile bar next to Časovnica: SVOD/admin get Zabava, everyone else UU; roles that can see neither Časovnica nor UU
  // (UU participants) get Preverbe + Zabava. The rest sit in ≡ in their usual order.
  const nav = $("#main-nav"), more = $("#nav-more"), toggle = $("#nav-more-toggle");
  const barTabs = u && !["casovnica", "uu"].some((x) => state.allowed.has(x)) ? ["preverbe", "zabava"]
    : u && ["svod", "admin"].includes(effectiveRole(u.email)) ? ["zabava"] : ["uu"];
  const MORE_ORDER = ["domov", "teme", "gradiva", "ekipa", "os", "uu", "preverbe", "zabava", "vprasanja", "analitika"];
  ["uu", "preverbe", "zabava"].forEach((x) => {
    const b = $(`.tab[data-tab="${x}"]`, nav);
    if (!b || barTabs.includes(x)) return;
    const next = MORE_ORDER.slice(MORE_ORDER.indexOf(x) + 1).map((y) => $(`.tab[data-tab="${y}"]`, more)).find(Boolean);
    more.insertBefore(b, next || $("#nav-user"));
  });
  barTabs.forEach((x) => { const b = $(`.tab[data-tab="${x}"]`, nav); if (b) nav.insertBefore(b, toggle); });
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
  nu.innerHTML = `<button type="button" class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false" aria-controls="user-menu" title="${esc(u.name)} · ${esc(u.email)}"><span class="tok-wrap">${av}<i class="tok-dot is-${tokState()}"></i></span><span class="nav-user-name">${esc(u.name)}</span></button>
    <div class="user-menu" id="user-menu" hidden>
      <p class="user-menu-name">${esc(u.name)}</p><p class="user-menu-email">${esc(u.email)}</p>
      ${roleOf(u.email) === "admin" ? `<div class="sim-switch" role="group" aria-label="Pogled kot"><span class="sim-label">Pogled kot</span>${SIM_ROLES.map((r) =>
        `<button type="button" class="sim-opt" data-sim-role="${r}" aria-pressed="${effectiveRole(u.email) === r}">${r.toUpperCase()}</button>`).join("")}</div>` : ""}
      <div class="tok-box"><p class="tok-line" id="tok-line"></p><button type="button" class="user-menu-item" id="tok-refresh" data-tok-refresh>Osveži prijavo</button><div id="tok-gsi" class="tok-gsi"></div></div>
      ${own}<button type="button" class="user-menu-item" data-install hidden>Namesti aplikacijo</button><button type="button" class="user-menu-item user-signout" data-signout>Odjava</button>
    </div>`;
  ar.hidden = false;
  prefetchScriptData();
  setTimeout(updateInstallUI, 0);
  const who = person && state.allowed.has("ekipa")
    ? `<a href="#oseba-${esc(person.slug)}">${esc(u.name)}</a>` : esc(u.name);
  setTimeout(tokRender, 0);
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
  if (name === "ekipa") { ensureWorkloadChart(); renderOcene(); }
  if (name === "teme") decorateTemeScores();
  if (name === "vprasanja") renderVprasanja();
  const zbm = /^zabava\/(wordle|stavnica)(?:\/(.+))?$/.exec(location.hash.replace(/^#/, "")), zb = zbm?.[1] || null; // null = chooser
  state.wordleActive = name === "zabava" && zb === "wordle";
  updateInstallUI();
  if (name === "zabava") {
    $("#zb-pick").hidden = !!zb; $("#zb-back").hidden = !zb;
    $("#wordle").hidden = zb !== "wordle"; $("#stavnica").hidden = zb !== "stavnica";
    if (zb === "wordle") renderWordle(); else if (zb === "stavnica") { sv.view = zbm[2] || ""; renderStavnica(); }
    if (zb) window.scrollTo(0, 0);
  }
  $("#nav-more-toggle")?.classList.toggle("has-active", !!$(`#nav-more [data-tab="${name}"]`));
  closeNavMore();
  const hash = location.hash.replace(/^#/, "");
  logVisit(blocked ? "noaccess" : (/^(oseba|tema)-/.test(hash) ? hash.split("-")[0] : name));
  if (name === "analitika") renderAnalitika(/^analitika\/(obiski|svod|teme|wordle)$/.exec(location.hash.replace(/^#/, ""))?.[1] || "obiski");
  if (name === "preverbe") renderPreverbe(/^preverbe\/(teme|generalno|svod)$/.exec(location.hash.replace(/^#/, ""))?.[1] || null);
  if (name === "uu") renderUU(/^uu\/(.+)$/.exec(location.hash.replace(/^#/, ""))?.[1] || null);
  if (name === "os") renderOs(/^os\/(\d+)$/.exec(location.hash.replace(/^#/, ""))?.[1] || null);
  currentTab = name;
  if (!blocked && !hash.startsWith("sid-") && !hash.startsWith("os/") && !hash.startsWith("uu/") && !hash.startsWith("preverbe/") && !hash.startsWith("analitika/") && !hash.startsWith("zabava/") && !hash.startsWith("day-") && !hash.startsWith("oseba-") && !hash.startsWith("tema-")) {
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

/* Time label: "23:00 –" for sleep (open-ended); start only when no end/length is known (start == end) */
function sessionTimeLabel(s) {
  if (/^spanje/i.test(s.title)) return `${s.start} –`;
  if (!s.end || s.end === s.start) return s.start;
  return `${s.start} – ${s.end}`;
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
  // Re-place the now line whenever the timeline's layout changes (cards expanded/collapsed, incl. animations)
  if (!state.nowObserver && window.ResizeObserver) {
    let raf = 0;
    state.nowObserver = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(placeNowLine); });
    state.nowObserver.observe(root);
  }
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
          <span class="time-badge">${esc(sessionTimeLabel(s))}</span>
        </div>
        ${(s.trainers || []).length && s.kind !== "logistics" ? `<div class="sh-people">${s.trainers.map((t) => personLink(t, "trainer-pill")).join("")}</div>` : ""}
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
    <section class="card tema-section tema-score" id="tema-score" hidden></section>
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
  decorateTemeScores();
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
  if (["domov", "gradiva", "ekipa", "teme", "os", "uu", "preverbe", "zabava", "vprasanja", "analitika"].includes(hash)) {
    setTab(hash);
    if (hash === "ekipa") showEkipaList();
    if (hash === "teme") showTemeList();
    return;
  }
  if (/^uu\/.+$/.test(hash)) { setTab("uu"); return; }
  if (/^preverbe\/(teme|generalno|svod)$/.test(hash)) { setTab("preverbe"); return; }
  if (/^analitika\/(obiski|svod|teme|wordle)$/.test(hash)) { setTab("analitika"); return; }
  if (/^zabava\/(wordle|stavnica(\/.+)?)$/.test(hash)) { setTab("zabava"); return; }
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
  try { localStorage.setItem(wdKey(wd.puzzle.date), JSON.stringify({ guesses: wd.guesses, done: wd.done, won: wd.won, startTs: wd.startTs, endTs: wd.endTs })); } catch {}
}
/* Timer: starts on the first letter of the first word, stops when the game ends (wall clock, survives reloads) */
const wdFmtMs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const wdElapsed = () => (wd.startTs ? (wd.endTs || Date.now()) - wd.startTs : 0);
function wdTick() {
  const el = $("#wd-timer");
  if (!el) return;
  el.hidden = !wd.startTs;
  el.classList.toggle("is-done", !!wd.endTs);
  $("span", el).textContent = wdFmtMs(wdElapsed());
  clearTimeout(wd.timer);
  if (wd.startTs && !wd.endTs && state.wordleActive) wd.timer = setTimeout(wdTick, 1000 - (wdElapsed() % 1000));
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
    $("#wd-board").innerHTML = ""; $("#wd-kb").innerHTML = "";
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
    wd.startTs = saved?.startTs || null; wd.endTs = saved?.endTs || null;
  }
  $("#wd-sub").textContent = `#${p.n} · ${wdFmtDate(p.date)}`;
  wdMsg(wd.done ? (wd.won ? "Bravo! 🎉" : `Beseda je bila: ${wd.answer.toUpperCase()}`) : "");
  drawWordle();
  wdTick();
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
    if (wd.done) wd.endTs = Date.now();
    wdSaveGame();
    wdTick();
    if (wd.done) {
      wdRecordResult();
      wdSubmit(wdResultItem(wd.puzzle.date, { guesses: wd.guesses, won: wd.won, startTs: wd.startTs, endTs: wd.endTs }, wd.answer));
    }
    wdMsg(wd.done ? (wd.won ? ["Genialno!", "Odlično!", "Super!", "Bravo!", "Dobro!", "Za las!"][wd.guesses.length - 1] + " 🎉" : `Beseda je bila: ${wd.answer.toUpperCase()}`) : "");
    drawWordle();
    return;
  }
  if (wd.cur.length < L && /^\p{L}$/u.test(k)) {
    if (!wd.startTs) { wd.startTs = Date.now(); wdSaveGame(); wdTick(); }
    wd.cur.push(k.toLowerCase()); wdMsg(""); drawWordle();
  }
}
function shakeRow() {
  const r = $("#wd-board .wd-row.current");
  if (!r) return;
  r.classList.remove("shake"); void r.offsetWidth; r.classList.add("shake");
}
document.addEventListener("click", (e) => {
  const k = e.target.closest("#wd-kb [data-k]");
  if (k) wdInput(k.dataset.k);
});
document.addEventListener("keydown", (e) => {
  if (!state.wordleActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, textarea")) return;
  if (e.key === "Enter") { e.preventDefault(); wdInput("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); wdInput("back"); }
  else if (e.key.length === 1 && /^\p{L}$/u.test(e.key)) wdInput(e.key);
});

/* —— Wordle results → Apps Script (data/wordle_config.json scriptUrl) + scoreboard —— */
let wdConfigP = null; // one fetch even when the prefetch asks for it several times at once
function wdConfig() {
  return (wdConfigP ||= (async () => {
    try { const r = await fetch("data/wordle_config.json", { cache: "no-store" }); wd.config = r.ok ? await r.json() : null; } catch { wd.config = null; }
    return wd.config;
  })());
}
const WD_QUEUE = "uvodja.wordle.queue";
function wdQueue() { try { return JSON.parse(localStorage.getItem(WD_QUEUE)) || []; } catch { return []; } }
function wdSetQueue(q) { try { localStorage.setItem(WD_QUEUE, JSON.stringify(q)); } catch {} }
/* Fresh ID token: stored one if valid ≥2 min, else GIS silent prompt (One Tap/auto-select) up to 15 s */
async function wdFreshToken() { return silentToken(15000); }
/* POST to Apps Script with a time limit; errors carry a kind for user-facing messages */
const SCRIPT_TIMEOUT_MS = 25000;
async function wdPost(url, item, credential) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), SCRIPT_TIMEOUT_MS);
  let r;
  try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...item, credential }), signal: ctl.signal }); }
  catch (err) { throw Object.assign(new Error(err.name === "AbortError" ? "timeout" : "network"), { kind: err.name === "AbortError" ? "timeout" : navigator.onLine === false ? "offline" : "network" }); }
  finally { clearTimeout(t); }
  let res;
  try { res = await r.json(); } catch { throw Object.assign(new Error(`HTTP ${r.status}`), { kind: "server" }); }
  // A rejected site session (expired, or all signed out on the server): forget it, so the next request falls back to Google sign-in
  if (res && res.ok === false && String(credential || "").startsWith("s1.") && /invalid_token|prijava ni veljavna/i.test(res.error || "") && state.user?.session === credential) {
    delete state.user.session; delete state.user.sessionExp;
    try { localStorage.setItem("uvodja.user", JSON.stringify(state.user)); } catch {}
    tokRender();
  }
  return res;
}

/* —— Install as an app (PWA): Chrome/Edge/Android get the browser's install dialog (beforeinstallprompt);
   iPhone/iPad Safari has no such dialog, so the bar explains »Deli → Dodaj na začetni zaslon« —— */
const INSTALL_DISMISSED = "uvodja.install.dismissed"; // any tap on the bar hides it for good on this device (menu item stays)
const installDismiss = () => { try { localStorage.setItem(INSTALL_DISMISSED, "1"); } catch {} };
let installEvt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const canInstall = () => !isStandalone() && (!!installEvt || isIos());
function updateInstallUI() {
  const bar = $("#install-bar");
  $$("[data-install]").forEach((b) => { b.hidden = !canInstall(); });
  if (!bar) return;
  let snoozed = false; try { snoozed = !!localStorage.getItem(INSTALL_DISMISSED) || !!localStorage.getItem("uvodja.install.snooze"); } catch {} // old 7/14-day snooze counts as dismissed
  bar.hidden = !state.user || !canInstall() || snoozed || !!state.wordleActive;
  if (!bar.hidden && !installEvt) {
    $("#install-sub").textContent = "Tapni Deli ⬆︎ in nato »Dodaj na začetni zaslon«.";
    $("#install-go").textContent = "V redu";
  }
}
async function runInstall() {
  if (installEvt) {
    const evt = installEvt; installEvt = null;
    evt.prompt();
    try { await evt.userChoice; } catch {}
  }
  installDismiss();
  updateInstallUI();
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; updateInstallUI(); });
window.addEventListener("appinstalled", () => { installEvt = null; updateInstallUI(); });
document.addEventListener("click", (e) => {
  if (e.target.closest("#install-go, [data-install]")) { setUserMenu(false); closeNavMore(); runInstall(); }
  else if (e.target.closest("#install-x")) { installDismiss(); updateInstallUI(); }
});
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

/* —— Apps Script data for the whole session: on load (any page) everything the signed-in user may see is requested at once
   and kept until reload/sign-out; a page awaits the request still in flight or, if it failed, retries it —— */
let scriptData = {}; // key → { data, error, p }
function scriptLoad(key, force = false) {
  const e = (scriptData[key] ||= {});
  if (e.p) return e.p;
  if ("data" in e && !force) return Promise.resolve(e.data);
  const p = SCRIPT_FETCH[key]().then((d) => { e.data = d; e.at = Date.now(); e.error = null; return d; }, (err) => { e.error = err; throw err; })
    .finally(() => { if (e.p === p) e.p = null; });
  return (e.p = p);
}
const scriptHas = (key) => !!scriptData[key] && "data" in scriptData[key];
const scriptSet = (key, data) => { (scriptData[key] ||= {}).data = data; };
/* Signed-in POST of { type, … }; a reply without ok becomes an error with a kind (auth / denied / server) */
async function scriptPost(item, token = wdFreshToken) {
  const cfg = await wdConfig();
  if (!cfg?.scriptUrl) throw Object.assign(new Error("config"), { kind: "config" });
  const credential = await token();
  if (!credential) throw Object.assign(new Error("auth"), { kind: "auth" });
  const res = await wdPost(cfg.scriptUrl, item, credential);
  if (!res?.ok) throw Object.assign(new Error(res?.error || "napaka"), { kind: /prijava/i.test(res?.error) ? "auth" : /dostop/i.test(res?.error) ? "denied" : "server" });
  return res;
}
const SCRIPT_FETCH = {
  scores: async () => {
    const cfg = await wdConfig();
    if (!cfg?.scriptUrl) throw new Error("config");
    const j = await (await fetch(`${cfg.scriptUrl}${cfg.scriptUrl.includes("?") ? "&" : "?"}t=${Date.now()}`)).json();
    return j.ok ? j.results || [] : [];
  },
  stavnica: () => svCall(),
  ocene: () => scriptPost({ type: "ocene" }),
  vprasanja: () => scriptPost({ type: "vprasanja" }),
  analitika: () => scriptPost({ type: "analitika" }),
  visitstats: () => scriptPost({ type: "visitstats" }, () => silentToken(8000)),
};
function prefetchScriptData() {
  if (!state.user) return;
  const want = [
    ...(canSee("zabava") ? ["scores", "stavnica"] : []),
    ...(canSeeOcene() ? ["ocene"] : []),
    ...(canSee("vprasanja") ? ["vprasanja"] : []),
    ...(canSee("analitika") ? ["analitika", "visitstats"] : []),
  ];
  want.forEach((k) => { if (!scriptHas(k)) scriptLoad(k).catch(() => {}); });
}

/* —— Google sign-in token status: navbar dot, menu line, background refresh —— */
function tokState() {
  const u = state.user;
  if (!u) return "none";
  if (sessionOk(u, 60000)) return "ok";
  if (tokenRefreshP && !state.tokenFailed && !(u.credExp > Date.now() + 120000)) return "busy";
  return u.credential && u.credExp > Date.now() + 60000 ? "ok" : "bad";
}
function tokRender() {
  const st = tokState(), u = state.user;
  const label = { ok: "Prijava velja", busy: "Osvežujem prijavo …", bad: "Prijava je potekla", none: "" }[st];
  $$(".tok-dot").forEach((d) => { d.className = `tok-dot is-${st}`; d.title = label; });
  const line = $("#tok-line");
  if (line) {
    const min = u?.credExp ? Math.max(0, Math.round((u.credExp - Date.now()) / 60000)) : 0;
    line.className = `tok-line is-${st}`;
    const until = sessionOk(u, 60000) ? new Date(u.sessionExp) : null;
    line.innerHTML = `<i class="tok-dot is-${st}"></i>${until ? `Prijavljen/a do ${until.getDate()}. ${until.getMonth() + 1}.` : st === "ok" ? `Prijava velja še ${min} min` : esc(label)}${state.tokenFailed && st === "bad" ? `<span class="muted-text"> – samodejna osvežitev ni uspela</span>` : ""}`;
  }
  const g = $("#tok-gsi");
  if (g && st === "bad" && state.tokenFailed && !g.childElementCount && window.google?.accounts?.id) {
    window.google.accounts.id.renderButton(g, { theme: "filled_black", size: "medium", shape: "pill", text: "signin_with", locale: "sl" });
  }
  if (g && st === "ok") g.innerHTML = "";
}
async function tokRefreshNow() {
  const b = $("#tok-refresh");
  if (b) { b.disabled = true; b.textContent = "Osvežujem …"; }
  const c = await silentToken(12000, true);
  if (b) { b.disabled = false; b.textContent = "Osveži prijavo"; }
  tokRender();
  return c;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-tok-refresh]")) { e.preventDefault(); tokRefreshNow().then((c) => { if (c && !$("#stavnica")?.hidden) renderStavnica(true); }); } });
// Renew in the background ~5 min before expiry (and when the tab becomes visible); repaint the dot every 30 s
/* —— Site session (apps-script/common.gs): after one Google sign-in the server issues its own signed token, valid
   60 days and renewed when it has under 30 days left, so the hourly Google refresh (One Tap) is only a fallback —— */
const sessionOk = (u, ms = 0) => !!(u?.session && u.sessionExp > Date.now() + ms);
/* Best credential right now without any prompt: the site session, else a still-valid Google ID token */
function currentCred(ms = 120000) {
  const u = state.user;
  if (!u) return null;
  if (sessionOk(u, ms)) return u.session;
  return u.credential && u.credExp > Date.now() + ms ? u.credential : null;
}
let sessionP = null;
function ensureSession() {
  const u = state.user;
  if (!u || sessionP || sessionOk(u, 30 * 864e5)) return sessionP || Promise.resolve();
  const cred = currentCred(60000);
  if (!cred) return Promise.resolve();
  sessionP = (async () => {
    try {
      const cfg = await wdConfig();
      if (!cfg?.scriptUrl) return;
      const res = await wdPost(cfg.scriptUrl, { type: "session" }, cred);
      const cur = state.user;
      if (!res?.ok || !String(res.session || "").startsWith("s1.") || !cur || cur.email.toLowerCase() !== u.email.toLowerCase()) return; // older script: keep using Google tokens
      cur.session = res.session; cur.sessionExp = Number(res.exp) || Date.now() + 60 * 864e5;
      try { localStorage.setItem("uvodja.user", JSON.stringify(cur)); } catch {}
      state.tokenFailed = false; tokRender();
    } catch { /* offline / server error: try again on the next page load */ }
  })();
  return sessionP;
}
function tokMaintain() {
  const u = state.user;
  if (u && !document.hidden && !sessionOk(u, 5 * 60000) && !(u.credExp > Date.now() + 5 * 60000)) silentToken(10000);
  tokRender();
}
setInterval(tokMaintain, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tokMaintain(); });
function wdResultItem(date, g, answer) {
  return { date, guesses: g.guesses.length, solved: !!g.won, ms: g.startTs && g.endTs ? g.endTs - g.startTs : null,
    grid: g.guesses.map((x) => wdScore(x, answer).map((c) => (c === "correct" ? "G" : c === "present" ? "Y" : ".")).join("")).join("/") };
}
/* Finished games saved on this device that are missing from the scoreboard (rejected or lost earlier) are sent again, once per page load */
function wdResendMissing() {
  const u = state.user;
  if (!u || !wd.data || !Array.isArray(wd.scores)) return;
  const mine = new Set(wd.scores.filter((r) => String(r.email || "").toLowerCase() === u.email.toLowerCase()).map((r) => r.date));
  const today = ljNow().date, q = wdQueue();
  wd.resent ||= new Set();
  let added = false;
  for (const p of wd.data.puzzles) {
    if (p.date > today || mine.has(p.date) || wd.resent.has(p.date) || q.some((x) => x.date === p.date)) continue;
    let g = null; try { g = JSON.parse(localStorage.getItem(wdKey(p.date))); } catch {}
    if (!g?.done || !g.guesses?.length) continue;
    q.push(wdResultItem(p.date, g, wdDeobf(p.w, wd.data.key)));
    wd.resent.add(p.date); added = true;
  }
  if (added) { wdSetQueue(q); wdFlushQueue(); }
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
    const cred = interactive ? await wdFreshToken() : currentCred();
    if (!cred) { if (interactive) wdMsg("Rezultat bo poslan ob naslednji prijavi."); return; }
    for (const item of [...q]) {
      try {
        const res = await wdPost(cfg.scriptUrl, item, cred);
        if (res.ok || ["bad_date", "future_date", "not_a_puzzle_date", "bad_guesses", "not_allowed"].includes(res.error)) {
          q = q.filter((x) => x.date !== item.date);
        }
        if (!res.ok && interactive) wdMsg(res.error === "not_allowed" ? "Rezultat ni shranjen (račun ni na seznamu)." : `Rezultat ni shranjen (strežnik: ${res.error || "napaka"}).`);
      } catch { /* network: keep queued */ }
    }
    wdSetQueue(q);
    loadScoreboard(true);
  } finally { wd.flushing = false; }
}

/* Scoreboard: what is already loaded shows at once; it is fetched again in the background when older than
   WD_SCORES_FRESH (opening Wordle, back from the background, a timer while Wordle is on screen) or on »Osveži« */
const WD_SCORES_FRESH = 90 * 1000;
async function loadScoreboard(force = false) {
  const cfg = await wdConfig();
  const box = $("#wd-score");
  if (!box) return;
  if (!cfg?.scriptUrl) { box.hidden = true; return; }
  box.hidden = false;
  if (osData === undefined) { try { const r = await fetch("data/os.json", { cache: "no-store" }); osData = r.ok ? await r.json() : null; } catch { osData = null; } }
  if (!wd.scores && scriptHas("scores")) wd.scores = scriptData.scores.data;
  const stale = !wd.scores || Date.now() - (scriptData.scores?.at || 0) > WD_SCORES_FRESH;
  if (wd.scores) { wdResendMissing(); renderScoreboard(); } else $("#wd-score-body").innerHTML = `<p class="muted-text">Nalagam lestvico …</p>`;
  if (!force && !stale) return;
  wd.scoresLoading = true; renderScoreMeta();
  try { wd.scores = await scriptLoad("scores", true); } catch { wd.scores ||= null; } // keep showing the old results if the refresh fails
  wd.scoresLoading = false;
  wdResendMissing();
  renderScoreboard();
}
function renderScoreMeta() {
  const el = $("#wd-score-meta");
  if (!el) return;
  const at = scriptData.scores?.at;
  const t = at ? new Date(at).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" }) : "";
  el.innerHTML = wd.scoresLoading ? `Osvežujem …` : `${t ? `Posodobljeno ob ${t} · ` : ""}<button type="button" class="link-btn" data-wd-refresh>Osveži</button>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-wd-refresh]")) loadScoreboard(true); });
/* While Wordle is on screen: new puzzle after midnight, fresh results every ~1.5 min and when the app comes back */
function wdKeepFresh() {
  if (!state.wordleActive || document.hidden || !wd.data) return;
  if (wd.puzzle && wd.puzzle.date !== ljNow().date) { renderWordle(); return; } // renderWordle also loads the scoreboard
  loadScoreboard();
}
setInterval(wdKeepFresh, 30 * 1000);
document.addEventListener("visibilitychange", wdKeepFresh);
/* OS participant photo for a scoreboard account without one: unique match on the full name, else on the e-mail name (ime.priimek) */
function osPhotoFor(email, name) {
  const norm = (x) => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.\-_]/g, " ").replace(/\s+/g, " ").trim();
  if (!osData?.groups) return null;
  const byName = (wd.osPhotos ||= osData.groups.flatMap((g) => g.members).filter((m) => m.photo)
    .reduce((m, x) => { const k = norm(x.name); m[k] = m[k] === undefined ? x.photo : null; return m; }, {})); // null = ambiguous
  return byName[norm(name)] || byName[norm(String(email || "").split("@")[0])] || null;
}
function wdWho(email, name) {
  const person = personForUser({ email, name });
  const label = person ? displayName(person) : (name || email).split(/\s+/)[0];
  const own = state.user && String(email || "").toLowerCase() === state.user.email.toLowerCase() ? state.user.picture : "";
  const photo = person?.photo || own || osPhotoFor(email, name);
  const av = photo ? `<img class="avatar avatar-sm" src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="avatar avatar-sm avatar-initials" aria-hidden="true">${esc(initials(person?.name || name || email))}</span>`;
  return { label, av, title: person?.name || name || email };
}
function renderScoreboard() {
  const body = $("#wd-score-body");
  if (!body) return;
  renderScoreMeta();
  if (wd.scores === null) { body.innerHTML = `<p class="muted-text">Lestvice ni bilo mogoče naložiti.</p>`; return; }
  const tab = wd.scoreTab || "danes";
  $$(".wd-stab").forEach((b) => b.setAttribute("aria-selected", b.dataset.stab === tab ? "true" : "false"));
  const today = ljNow().date;
  if (tab === "danes") {
    const ms = (r) => (Number(r.ms) > 0 ? Number(r.ms) : Infinity); // no time (older results) sorts last within the same guesses
    const rows = wd.scores.filter((r) => r.date === today)
      .sort((a, b) => (a.solved === b.solved ? a.guesses - b.guesses || ms(a) - ms(b) : a.solved ? -1 : 1));
    body.innerHTML = rows.length ? `<ol class="wd-board-list">${rows.map((r, i) => {
      const w = wdWho(r.email, r.name);
      return `<li><span class="wd-rank">${i + 1}.</span>${w.av}<span class="wd-name" title="${esc(w.title)}">${esc(w.label)}</span>${Number(r.ms) > 0 ? `<span class="wd-time muted-text">⏱ ${wdFmtMs(Number(r.ms))}</span>` : ""}<span class="wd-res${r.solved ? "" : " fail"}">${r.solved ? `${r.guesses}/6` : "X/6"}</span><span class="wd-pts">${r.solved ? 7 - r.guesses : 0} t</span></li>`;
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
  setInterval(() => { placeNowLine(); placeUuNow(); const t = $("#pv-teme"); if (t && !t.hidden && currentTab === "preverbe") renderPvTeme(t); }, 60000);
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
  tokMaintain(); // renew an expired/expiring sign-in right away, on whatever page the user lands
  ensureSession(); // swap the Google sign-in for a 60-day site session (or renew one that is getting old)
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
function silentToken(ms = 5000, force = false) {
  const u = state.user;
  if (!u) return Promise.resolve(null);
  if (!force && sessionOk(u, 120000)) return Promise.resolve(u.session);
  if (!force && u.credential && u.credExp > Date.now() + 120000) return Promise.resolve(u.credential);
  if (tokenRefreshP && !force) return tokenRefreshP;
  state.tokenFailed = false; tokRender();
  tokenRefreshP = new Promise((resolve) => {
    let done = false;
    const fin = (c) => {
      if (done) return; done = true; clearTimeout(t); resolve(c || null);
      state.tokenFailed = !c; tokRender();
      setTimeout(() => { tokenRefreshP = null; }, c || force ? 0 : 60000);
    };
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
      const credential = tok || currentCred(30000) || "";
      fetch(cfg.scriptUrl, { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "visit", credential, email: cur.email, name: cur.name, page, device, ts: now }) }).catch(() => {});
    }).catch(() => {});
  } catch {}
}
const PAGE_LABEL = { domov: "Domov", casovnica: "Časovnica", teme: "Teme", tema: "Tema (podstran)", ekipa: "Ekipa", oseba: "Oseba (podstran)", os: "OS", preverbe: "Preverbe", vprasanja: "Vprašanja", analitika: "Analitika", zabava: "Zabava", noaccess: "Brez dostopa" };
/* Role for an Analitika row: by e-mail, else by matching the name to a listed person (access.json people), else the default role */
function visitRole(p) {
  if (p.email) return roleOf(p.email);
  const norm = (x) => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const hit = Object.entries(state.access?.people || {}).find(([, slug]) => norm(state.data?.people?.[slug]?.name) === norm(p.name));
  return hit ? roleOf(hit[0]) : (p.name ? state.access?.defaultRole || "uu" : "");
}
async function renderVisits() {
  const box = $("#visits");
  if (!box) return;
  const isAdmin = canSee("analitika");
  box.hidden = !isAdmin;
  if (!isAdmin) return;
  const body = $("#visits-body");
  if (!scriptHas("visitstats")) body.innerHTML = `<p class="muted-text">Nalagam …</p>`;
  try {
    const d = await scriptLoad("visitstats");
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
      <h3 class="visits-h">Po osebah</h3><ul class="vrows">${people.map((p) => { const r = visitRole(p); return row(esc(displayName(p.name || p.email)), p.count, hmax, r ? ` <span class="role-badge role-${esc(r)}" title="Vloga: ${esc(r.toUpperCase())}">${esc(r.toUpperCase())}</span>` : ""); }).join("") || "<li class='muted-text'>Ni podatkov</li>"}</ul>`;
  } catch {
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

/* —— Zabava → Stavnica: fixed-odds bets with virtual zlatniki via Apps Script (apps-script/stavnica.gs) —— */
/* Gold coin icon (the 🪙 emoji renders silver/grey on some devices) */
const SV_COIN = `<svg class="sv-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#f5b82e" stroke="#a8711a" stroke-width="1.6"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#a8711a" stroke-width="1.3" opacity=".8"/><path d="M9.2 8.4a5 5 0 0 1 4.4-1.2" stroke="#ffe7a3" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
const sv = { state: null, loading: false, open: null, error: "", media: undefined, view: "" }; // view: "" = Stave, "profil", or a question slug
async function svCall(extra = {}, onStage = () => {}) {
  const err = (kind, msg) => Object.assign(new Error(msg || kind), { kind });
  if (navigator.onLine === false) throw err("offline");
  const cfg = await wdConfig();
  if (!cfg?.scriptUrl) throw err("config");
  onStage("auth");
  const credential = await wdFreshToken();
  if (!credential) throw err("auth");
  onStage("load");
  const res = await wdPost(cfg.scriptUrl, { type: "stavnica", action: "state", name: state.user?.name || "", ...extra }, credential);
  if (!res?.ok) throw err(/prijava/i.test(res?.error || "") ? "auth" : "server", res?.error || "napaka strežnika");
  return res;
}
/* User-facing explanation per error kind */
function svErrorHtml(e) {
  const k = e?.kind || "other";
  const t = {
    auth: ["Prijava je potekla.", "Google prijave ni bilo mogoče samodejno osvežiti. Osveži prijavo (ali se odjavi in znova prijavi)."],
    offline: ["Ni internetne povezave.", "Naprava je brez povezave. Ko se povežeš, poskusi znova."],
    network: ["Strežnik ni dosegljiv.", "Zahteva ni prišla do strežnika – najverjetneje slaba internetna povezava."],
    timeout: ["Strežnik se ni odzval.", `Odgovora ni bilo v ${SCRIPT_TIMEOUT_MS / 1000} s – slaba povezava ali preobremenjen strežnik.`],
    server: ["Napaka na strežniku.", `Strežnik je vrnil napako: ${e?.message || "neznano"}.`],
    config: ["Stavnica ni povezana.", "Manjka naslov strežnika (wordle_config.json)."],
  }[k] || ["Stavnice ni bilo mogoče naložiti.", e?.message || ""];
  return `<div class="card sv-empty sv-error is-${esc(k)}"><p class="sv-err-title">${esc(t[0])}</p><p class="muted-text">${esc(t[1])}</p>
    <div class="sv-err-actions">${k === "auth" ? `<button type="button" class="btn primary" data-tok-refresh>Osveži prijavo</button>` : ""}<button type="button" class="btn ghost" data-sv-reload>Poskusi znova</button></div></div>`;
}
const svSlug = (q) => uuSlug(q.id);
const svLabel = (q, o) => q.type === "boolean" ? ({ yes: "Da", no: "Ne" }[String(o).toLowerCase()] || o) : o;
const svOdds = (q) => q.odds || q.options.length;
/* Sheet image first, then keyword image, then a generated cover (also used if the sheet image fails to load) */
function svImgFallback(q) { return (sv.media?.images || []).find((m) => new RegExp(m.match, "i").test(q.question))?.src || svGenImg(q); }
/* Generated cover for questions without an image: gradient in a colour derived from the text, the main word's
   two-letter abbreviation and a bet-type badge (DA/NE or #). Deterministic → the same question always looks the same. */
const SV_STOP = new Set("ali bo bomo bodo bi je so se v na za pri iz po do od in ali ter kot ki ko kaj kdo koliko kolikrat kateri katera katero tekom med pred prvega drugega vikenda vikendu temo tema dan dneva".split(" "));
function svGenImg(q) {
  const text = String(q.question || "");
  let h = 0; for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hue = Math.round((h % 1000) * 137.508) % 360, hue2 = (hue + 35) % 360; // golden angle → well-spread colours
  const raw = text.normalize("NFC").match(/[\p{L}]+/gu) || [];
  // a name mid-sentence ("Tonka", "Matej") wins; otherwise the longest meaningful word
  const name = raw.slice(1).find((w) => /^\p{Lu}\p{Ll}{2,}$/u.test(w) && !SV_STOP.has(w.toLowerCase()));
  const main = name || raw.map((w) => w.toLowerCase()).filter((w) => !SV_STOP.has(w) && w.length > 2).sort((x, y) => y.length - x.length)[0] || "?";
  const mono = main.slice(0, 2).toUpperCase().replace(/[<&>"]/g, "");
  const glyph = q.type === "number" ? "#" : "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${hue},58%,42%)"/><stop offset="1" stop-color="hsl(${hue2},62%,20%)"/></linearGradient></defs>`
    + `<rect width="96" height="96" fill="url(#g)"/><circle cx="80" cy="14" r="32" fill="#fff" opacity=".08"/><circle cx="8" cy="94" r="28" fill="#000" opacity=".14"/>`
    + `<text x="44" y="60" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="38" font-weight="800" fill="#fbf1d6">${mono}</text>`
    + `<circle cx="78" cy="78" r="13" fill="#f8a418"/><text x="78" y="85" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="19" font-weight="900" fill="#16242f">${glyph}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
/* Google Sheets images come at =s2048; ask for a small version (cards show 48 px, the detail page 96 px) */
function svImg(q, size = 192) { return q.image ? q.image.replace(/=s\d+(?=\?|$)/, `=s${size}`) : svImgFallback(q); }
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img?.tagName === "IMG" && img.dataset.fb && img.getAttribute("src") !== img.dataset.fb) img.src = img.dataset.fb;
}, true);
function svShare(q) {
  const n = q.options.reduce((a, o) => a + (q.people?.[o] || 0), 0);
  return { n, pct: (o) => (n ? Math.round(((q.people?.[o] || 0) / n) * 100) : 0) };
}
const svCount = (n) => `${n} ${n === 1 ? "stava" : n === 2 ? "stavi" : n < 5 ? "stave" : "stav"}`;
function svAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (!ts || !Number.isFinite(m)) return "";
  if (m < 1) return "pravkar";
  if (m < 60) return `pred ${m} min`;
  if (m < 1440) return `pred ${Math.round(m / 60)} h`;
  return new Date(ts).toLocaleDateString("sl-SI", { day: "numeric", month: "numeric" });
}
/* One bet: who/when + question, then Izbira · Vložek · Dobitek (potential while open, won/lost once resolved) */
function svBetRow(b, { who = true, question = true } = {}) {
  const q = sv.state.questions.find((x) => x.id === b.question);
  const odds = b.odds || (q ? svOdds(q) : 1), pot = b.amount * odds;
  const resolved = q?.result ? (b.option === q.result ? "won" : "lost") : null;
  const w = who ? wdWho("", b.name) : null;
  const out = resolved === "won" ? `<strong class="is-win" title="Zadel">+${b.payout ?? pot} ${SV_COIN}</strong>`
    : resolved === "lost" ? `<strong class="is-lost" title="Ni zadel">0 ${SV_COIN}</strong>`
    : `<strong title="Če zadene: vložek × ${odds}"><span class="sv-pot-pre">do</span> ${pot} ${SV_COIN}<span class="sv-pot-x">×${odds}</span></strong>`;
  return `<li class="sv-bet-item${resolved ? ` is-${resolved}` : ""}">
    <div class="sv-bi-top${w ? " has-who" : ""}">${!who ? `<span class="sv-state ${resolved ? `is-${resolved}` : "is-open"}">${resolved === "won" ? "Zadel" : resolved === "lost" ? "Ni zadel" : "V igri"}</span>` : ""}${w ? `${w.av}<span class="sv-bi-who" title="${esc(w.title)}">${esc(w.label)}</span>` : ""}${question && q ? `<a class="sv-bi-q" href="#zabava/stavnica/${svSlug(q)}">${esc(b.question)}</a>` : question ? `<span class="sv-bi-q">${esc(b.question)}</span>` : ""}<span class="sv-bi-time muted-text">${esc(svAgo(b.ts))}</span></div>
    <div class="sv-bi-facts">
      <span class="sv-fact sv-fact-pick"><small>Izbira</small><strong>${esc(q ? svLabel(q, b.option) : b.option)}</strong></span>
      <span class="sv-fact"><small>Vložek</small><strong>${b.amount} ${SV_COIN}</strong></span>
      <span class="sv-fact sv-fact-out${resolved ? "" : " is-potential"}"><small>${resolved ? "Dobitek" : "Možen dobitek"}</small>${out}</span>
    </div>
  </li>`;
}
/* Admin adjustment (+/−) as a distinct card in Moje stave / Pregled */
function svAdjRow(a) {
  const plus = a.amount > 0;
  return `<li class="sv-adj-item ${plus ? "is-plus" : "is-minus"}">
    <span class="sv-adj-ico" aria-hidden="true">${plus ? "🎁" : "⚠️"}</span>
    <div class="sv-adj-main"><strong>${plus ? `Admin je dodal +${a.amount} ${SV_COIN}` : `Admin je odvzel ${Math.abs(a.amount)} ${SV_COIN}`}</strong>${a.reason ? `<span>${esc(a.reason)}</span>` : ""}</div>
    <span class="sv-bi-time muted-text">${esc(svAgo(a.ts))}</span>
  </li>`;
}
/* Bets split into Aktivne (open) / Zaključene (resolved) sections + admin adjustments, newest first */
function svSections(bets, adjs) {
  const byTs = (a, b) => (b.ts || 0) - (a.ts || 0);
  const open = bets.filter((b) => b.payout === null).sort(byTs), done = bets.filter((b) => b.payout !== null).sort(byTs);
  const ad = [...(adjs || [])].sort(byTs);
  const sec = (cls, title, items, render, empty) => (items.length || empty) ? `<div class="sv-sec sv-sec-${cls}">
      <h4 class="sv-sec-h"><span class="sv-sec-dot" aria-hidden="true"></span>${title}<span class="sv-sec-n">${items.length}</span></h4>
      ${items.length ? `<ul class="sv-bets">${items.map(render).join("")}</ul>` : `<p class="muted-text sv-sec-empty">${empty}</p>`}</div>` : "";
  const row = (b) => svBetRow(b, { who: false });
  return sec("active", "Aktivne stave", open, row, "Ni aktivnih stav.")
    + sec("done", "Zaključene stave", done, row, "")
    + sec("adj", "Popravki admina", ad, svAdjRow, "");
}
/* Zadnje stave: one simple line per bet (who · pick · stake · when), winners marked; question below only on the all-bets list */
/* "25. 10. · 17:04" for every bet; "pred 12 min" / "pred 3 h" tag only for bets from the last 24 h */
function svLogWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getDate()}. ${d.getMonth() + 1}. · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function svLogAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (!ts || !(m >= 0) || m >= 1440) return "";
  return m < 1 ? "pravkar" : m < 60 ? `pred ${m} min` : `pred ${Math.floor(m / 60)} h`;
}
function svLogRow(b, withQuestion) {
  const q = sv.state.questions.find((x) => x.id === b.question), w = wdWho("", b.name);
  const won = !!q?.result && b.option === q.result, lost = !!q?.result && !won, pay = b.amount * (b.odds || (q ? svOdds(q) : 1));
  return `<li class="sv-log-item${won ? " is-won" : lost ? " is-lost" : ""}">${w.av}
    <div class="sv-log-main">
      <p class="sv-log-line"><strong class="sv-log-who" title="${esc(w.title)}">${esc(w.label)}</strong><span class="sv-log-amt">${b.amount} ${SV_COIN}</span><span class="sv-log-na muted-text">na</span><span class="sv-log-pick">${esc(q ? svLabel(q, b.option) : b.option)}</span>${svLogAgo(b.ts) ? `<span class="sv-log-ago">${svLogAgo(b.ts)}</span>` : ""}</p>
      ${withQuestion && q ? `<a class="sv-log-q" href="#zabava/stavnica/${svSlug(q)}">${esc(b.question)}</a>` : ""}
    </div>
    <span class="sv-log-end">${won ? `<span class="sv-log-won" title="Zadel">✓ +${pay}</span>` : lost ? `<span class="sv-log-lost" title="Ni zadel">✗ −${b.amount}</span>` : ""}<time class="sv-log-time muted-text" datetime="${b.ts ? new Date(b.ts).toISOString() : ""}">${esc(svLogWhen(b.ts))}</time></span>
  </li>`;
}
function svRecent(list, withQuestion) {
  if (!list.length) return `<p class="muted-text">Še ni stav.</p>`;
  return `<ul class="sv-log">${list.map((b) => svLogRow(b, withQuestion)).join("")}</ul>`;
}
async function renderStavnica(force = false) {
  const box = $("#stavnica");
  if (!box) return;
  if (!sv.state && scriptHas("stavnica")) { sv.state = scriptData.stavnica.data; sv.fetchedAt = scriptData.stavnica.at; }
  if (sv.media === undefined || osData === undefined) {
    if (!sv.state) box.innerHTML = `<p class="muted-text sv-loading">Nalagam stave …</p>`;
    if (sv.media === undefined) { try { const r = await fetch("data/stavnica.json", { cache: "no-store" }); sv.media = r.ok ? await r.json() : null; } catch { sv.media = null; } }
    if (osData === undefined) { try { const r = await fetch("data/os.json", { cache: "no-store" }); osData = r.ok ? await r.json() : null; } catch { osData = null; } } // OS photos for players' avatars
  }
  if (!sv.state) {
    if (sv.loading) return;
    sv.loading = true;
    box.innerHTML = `<p class="muted-text sv-loading">Nalagam stave …</p>`;
    try { sv.state = await scriptLoad("stavnica", force); sv.error = null; sv.fetchedAt = Date.now(); } catch (err) { sv.error = err; }
    sv.loading = false;
  } else if (force || Date.now() - (sv.fetchedAt || 0) > SV_FRESH) svRefresh(force); // show what we have, refresh in the background
  if (!sv.state) { box.innerHTML = svErrorHtml(sv.error); return; }
  const st = sv.state, me = st.me || { balance: st.budget, bets: [] };
  const qi = st.questions.findIndex((q) => svSlug(q) === sv.view);
  const isAdminView = !!st.people && effectiveRole(state.user?.email) === "admin"; // overview only in the admin view (not when simulating)
  const playerSlug = isAdminView && /^igralec\//.test(sv.view) ? sv.view.slice(8) : null;
  const tab = playerSlug ? "pregled" : sv.view === "profil" || sv.view === "pretekle" || (sv.view === "pregled" && isAdminView) ? sv.view : qi >= 0 && st.questions[qi].result ? "pretekle" : "stave";
  const tabs = `<div class="pv-ftabs" role="tablist" aria-label="Stavnica">
      <a role="tab" class="pv-tab pv-ftab" href="#zabava/stavnica" aria-selected="${tab === "stave"}">Stave</a>
      <a role="tab" class="pv-tab pv-ftab" href="#zabava/stavnica/pretekle" aria-selected="${tab === "pretekle"}">Pretekle stave</a>
      <a role="tab" class="pv-tab pv-ftab" href="#zabava/stavnica/profil" aria-selected="${tab === "profil"}">Profil <span class="sv-tab-bal">${SV_COIN} ${me.balance}</span></a>
      ${isAdminView ? `<a role="tab" class="pv-tab pv-ftab" href="#zabava/stavnica/pregled" aria-selected="${tab === "pregled"}">Pregled</a>` : ""}
    </div>`;
  let body;
  if (tab === "profil") body = svProfile(st, me);
  else if (playerSlug) body = svPlayer(st, playerSlug);
  else if (tab === "pregled") body = svOverview(st);
  else if (qi >= 0) body = svDetail(st, me, qi);
  else body = svList(st, tab === "pretekle");
  box.innerHTML = `<div class="pv-folder">${tabs}<div class="pv-fpanel sv-panel">${body}<p class="sv-updated muted-text" id="sv-updated"></p></div></div>`;
  svMeta();
  svUpdatePayout();
}
/* past = resolved bets ("Pretekle stave"); otherwise open ones. Zadnje stave only on the open list */
function svList(st, past = false) {
  const card = (q) => {
    const sh = svShare(q);
    return `<a class="card sv-card sv-card-link${q.result ? " is-resolved" : ""}" href="#zabava/stavnica/${svSlug(q)}">
      <div class="sv-card-head">${svImg(q) ? `<img class="sv-img" src="${esc(svImg(q))}" data-fb="${esc(svImgFallback(q))}" referrerpolicy="no-referrer" alt="" loading="lazy" width="48" height="48" />` : ""}<h3 class="sv-q">${esc(q.question)}</h3>${q.options.length ? `<span class="sv-odds">×${svOdds(q)}</span>` : ""}</div>
      ${q.options.length ? `<div class="sv-mini" style="--n:${q.options.length}">${q.options.map((o) => `<span class="sv-mini-opt${q.result === o ? " is-win" : ""}"><span>${esc(svLabel(q, o))}</span><strong>${sh.pct(o)} %</strong><i style="width:${sh.pct(o)}%"></i></span>`).join("")}</div>` : ""}
      <p class="sv-foot muted-text">${q.result ? `<strong class="sv-res">Zaprto · ${esc(svLabel(q, q.result))}</strong> · ` : ""}${!q.options.length ? "Možnosti še niso določene." : sh.n ? svCount(sh.n) : "Še nihče ni stavil"}<span class="sv-go">Odpri ›</span></p>
    </a>`;
  };
  const qs = st.questions.filter((q) => !!q.result === past);
  if (!past) qs.reverse(); // sheet rows are appended, so the last row is the newest bet
  if (past) return qs.length ? qs.map(card).join("") : `<div class="card sv-empty"><p>Še ni razrešenih stav.</p><p class="muted-text">Ko je vprašanje razrešeno, se preseli sem.</p></div>`;
  return `${qs.length ? qs.map(card).join("") : `<div class="card sv-empty"><p>Ni odprtih stav.</p><p class="muted-text">Razrešene stave so pod <a href="#zabava/stavnica/pretekle">Pretekle stave</a>.</p></div>`}
    <section class="sv-list"><h3>Zadnje stave</h3>${svRecent(st.recent.slice(0, 25), true)}</section>
    ${sv.media?.images?.some((m) => m.source) ? `<p class="sv-credits muted-text">Slike: ${sv.media.images.filter((m) => m.source).map((m) => `<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.credit)}</a>`).join(" · ")} (Wikimedia Commons)</p>` : ""}`;
}
function svDetail(st, me, i) {
  const q = st.questions[i], sh = svShare(q);
  const sel = sv.open?.q === i && !q.result ? sv.open.o : null;
  return `<p class="person-back sv-back">${q.result ? `<a href="#zabava/stavnica/pretekle">← Pretekle stave</a>` : `<a href="#zabava/stavnica">← Vse stave</a>`}</p>
    <article class="sv-detail">
      <header class="sv-detail-head">${svImg(q) ? `<img class="sv-detail-img" src="${esc(svImg(q, 288))}" data-fb="${esc(svImgFallback(q))}" referrerpolicy="no-referrer" alt="" width="96" height="96" />` : ""}
        <div><h2 class="sv-q">${esc(q.question)}</h2>
        <p class="muted-text sv-detail-meta">${q.options.length ? `<span class="sv-odds">×${svOdds(q)}</span> zadetek vrne ${svOdds(q)}-kratni vložek · ` : ""}${sh.n ? svCount(sh.n) : "še brez stav"}</p></div></header>
      ${q.result ? `<p class="sv-meta"><strong class="sv-res">Zaprto · rezultat: ${esc(svLabel(q, q.result))}</strong></p>` : ""}
      ${q.options.length ? `<div class="sv-opts" style="--n:${q.options.length}">${q.options.map((o) => `<button type="button" class="sv-opt${o === sel ? " is-sel" : ""}${q.result === o ? " is-win" : ""}" data-sv-q="${i}" data-sv-o="${esc(o)}"${q.result ? " disabled" : ""}>
          <span class="sv-opt-label">${esc(svLabel(q, o))}</span><span class="sv-pct">${sh.pct(o)} %</span><span class="sv-meter" style="width:${sh.pct(o)}%"></span></button>`).join("")}</div>
        <p class="sv-foot muted-text">${q.result ? "Stave so zaprte." : "Izberi možnost za stavo · odstotek = delež ljudi na možnosti"}</p>`
      : `<p class="sv-foot muted-text">Možnosti še niso določene.</p>`}
      ${sel ? `<form class="sv-bet" data-sv-q="${i}" data-sv-o="${esc(sel)}">
        <p class="sv-bet-title">Stava: <strong>${esc(svLabel(q, sel))}</strong> <span class="muted-text">· stanje ${SV_COIN} ${me.balance}</span></p>
        <div class="sv-chips">${[1, 2, 5].filter((n) => n < me.balance).map((n) => `<button type="button" class="sv-chip" data-sv-amt="${n}">${n}</button>`).join("")}${me.balance ? `<button type="button" class="sv-chip" data-sv-amt="${me.balance}">Vse</button>` : ""}</div>
        <div class="sv-bet-row"><input type="number" name="amount" min="1" max="${me.balance}" step="1" value="${Math.min(1, me.balance)}" inputmode="numeric" aria-label="Vložek v zlatnikih" />
          <button type="submit" class="btn primary"${me.balance ? "" : " disabled"}>Stavi</button><button type="button" class="btn ghost sv-cancel" data-sv-cancel>Prekliči</button></div>
        <p class="sv-payout muted-text" data-sv-payout></p>
        <p class="sv-status" role="status" aria-live="polite"></p>
      </form>` : ""}
    </article>
    ${st.people && effectiveRole(state.user?.email) === "admin" && q.options.length ? svResolveBox(q, i) : ""}
    <section class="sv-list"><h3>Zadnje stave na to vprašanje</h3>${svRecent(st.recent.filter((b) => b.question === q.id), false)}</section>`;
}
/* Admin: new question (written to the sheet "questions" by Apps Script) */
function svCreateForm() {
  return `<details class="card sv-adj-new sv-create"${sv.createOpen ? " open" : ""}><summary>➕ Nova stava</summary>
    <form class="sv-create-form" data-sv-create>
      <label><span>Vprašanje</span><textarea name="question" rows="2" maxlength="300" required placeholder="npr. Ali bo v soboto deževalo?"></textarea></label>
      <label><span>Možnosti <span class="muted-text">· ločene z vejico, 2–8</span></span>
        <span class="sv-create-opts"><input type="text" name="options" required placeholder="Da, Ne" autocomplete="off" />
        <button type="button" class="btn ghost" data-sv-preset="Da, Ne">Da / Ne</button></span></label>
      <label><span>Rok <span class="muted-text">· neobvezno, npr. 31.10.</span></span><input type="text" name="expires" maxlength="20" autocomplete="off" /></label>
      <p class="muted-text sv-help">Kvota = število možnosti (×2 pri Da/Ne). Sliko lahko dodaš kasneje v listu.</p>
      <div class="sv-adj-btns"><button type="submit" class="btn primary">Dodaj stavo</button></div>
      <p class="sv-status" role="status" aria-live="polite"></p>
    </form></details>`;
}
/* Admin: pick the winning option (pays out right away) or reopen a resolved question */
function svResolveBox(q, i) {
  return `<section class="card sv-resolve" aria-label="Razreši stavo">
    <h3>Razreši stavo <span class="muted-text">· samo admin</span></h3>
    <p class="muted-text sv-help">${q.result ? `Rezultat je <strong>${esc(svLabel(q, q.result))}</strong>. Lahko ga spremeniš ali stavo znova odpreš.` : "Izberi pravilno možnost – zmagovalci takoj dobijo izplačilo, stave se zaprejo."}</p>
    <div class="sv-resolve-btns">${q.options.map((o) => `<button type="button" class="btn ${q.result === o ? "primary" : "ghost"}" data-sv-resolve="${i}" data-result="${esc(o)}"${q.result === o ? " disabled" : ""}>${esc(svLabel(q, o))}</button>`).join("")}
      ${q.result ? `<button type="button" class="btn ghost" data-sv-resolve="${i}" data-result="">↺ Znova odpri</button>` : ""}</div>
    <p class="sv-status" role="status" aria-live="polite"></p>
  </section>`;
}
const svErrText = (err) => ({ auth: "prijava je potekla", offline: "ni povezave", network: "strežnik ni dosegljiv", timeout: "strežnik se ni odzval" }[err.kind] || err.message);
document.addEventListener("click", (e) => {
  const pre = e.target.closest("[data-sv-preset]");
  if (pre) { const f = pre.closest("form"); f.options.value = pre.dataset.svPreset; f.options.focus(); }
});
document.addEventListener("toggle", (e) => { if (e.target.matches?.("#stavnica .sv-create")) sv.createOpen = e.target.open; }, true);
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("#stavnica form[data-sv-create]");
  if (!f) return;
  e.preventDefault();
  const question = f.question.value.replace(/\s+/g, " ").trim(), expires = f.expires.value.trim();
  const options = f.options.value.split(/[,;/]/).map((o) => o.trim()).filter(Boolean);
  const status = $(".sv-status", f), btn = $("button[type=submit]", f);
  if (options.length < 2 || options.length > 8) { status.className = "sv-status is-err"; status.textContent = "Vpiši 2–8 možnosti, ločenih z vejico."; return; }
  btn.disabled = true; status.className = "sv-status"; status.textContent = "Dodajam …";
  try {
    sv.state = await svCall({ action: "create", question, options, expires });
    sv.fetchedAt = Date.now(); scriptSet("stavnica", sv.state); sv.createOpen = false;
    const q = sv.state.questions.find((x) => x.id.toLowerCase() === question.toLowerCase());
    if (q) location.hash = `#zabava/stavnica/${svSlug(q)}`; else renderStavnica();
  } catch (err) {
    status.className = "sv-status is-err"; status.textContent = `Ni uspelo (${svErrText(err)}).`; btn.disabled = false;
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("#stavnica [data-sv-resolve]");
  if (!b) return;
  const q = sv.state.questions[Number(b.dataset.svResolve)], result = b.dataset.result, box = b.closest(".sv-resolve"), status = $(".sv-status", box);
  if (!q || !confirm(result ? `Razrešim stavo »${q.question}«?\nRezultat: ${svLabel(q, result)} – zmagovalci dobijo izplačilo.` : `Znova odprem stavo »${q.question}«?\nIzplačila se umaknejo, dokler je ne razrešiš.`)) return;
  $$("button", box).forEach((x) => (x.disabled = true)); status.className = "sv-status"; status.textContent = "Shranjujem …";
  try {
    sv.state = await svCall({ action: "resolve", question: q.id, result });
    sv.fetchedAt = Date.now(); scriptSet("stavnica", sv.state); renderStavnica();
  } catch (err) {
    status.className = "sv-status is-err"; status.textContent = `Ni uspelo (${svErrText(err)}).`;
    $$("button", box).forEach((x) => (x.disabled = false));
  }
});
/* Admin: all players with balances; each links to their detail page */
const svPlayerSlug = (email) => uuSlug(email);
function svAdjForm(p) {
  return `<form class="sv-adj-form" data-sv-adj data-email="${esc(p?.email || "")}" data-name="${esc(p?.name || "")}">
      ${p ? "" : `<input type="email" name="email" placeholder="e-naslov igralca" list="sv-emails" required autocomplete="off" aria-label="E-naslov" />`}
      <input type="number" name="amount" min="1" max="1000" step="1" value="1" required aria-label="Znesek" />
      <input type="text" name="reason" placeholder="Razlog (vidi ga igralec)" maxlength="200" required aria-label="Razlog" />
      <div class="sv-adj-btns"><button type="submit" class="btn primary" name="dir" value="1">+ Dodaj</button><button type="submit" class="btn ghost" name="dir" value="-1">− Odvzemi</button></div>
      <p class="sv-status" role="status" aria-live="polite"></p>
    </form>`;
}
function svOverview(st) {
  const people = [...(st.people || [])].sort((a, b) => b.balance - a.balance || b.staked - a.staked || a.name.localeCompare(b.name, "sl"));
  const sum = (k) => people.reduce((a, p) => a + (p[k] || 0), 0);
  const nBets = people.reduce((a, p) => a + p.bets.length, 0);
  const row = (p, i) => {
    const w = wdWho(p.email, p.name), open = p.bets.filter((b) => b.payout === null).length;
    return `<a class="sv-person-link" href="#zabava/stavnica/igralec/${esc(svPlayerSlug(p.email))}">
      <span class="sv-p-rank">${i + 1}.</span>${w.av}
      <span class="sv-p-main"><span class="sv-p-name">${esc(p.name || p.email)}</span><span class="sv-p-sub muted-text">${p.bets.length} stav${open ? ` · ${open} aktivnih` : ""}${p.adjusted ? ` · popravki ${p.adjusted > 0 ? "+" : ""}${p.adjusted}` : ""}</span></span>
      <span class="sv-p-bal" title="Stanje">${SV_COIN} ${p.balance}</span><span class="sv-go" aria-hidden="true">›</span></a>`;
  };
  return `<div class="sv-stats">
      <div class="card"><span class="muted-text">Igralcev</span><strong>${people.length}</strong></div>
      <div class="card"><span class="muted-text">Stav</span><strong>${nBets}</strong></div>
      <div class="card"><span class="muted-text">Vloženo</span><strong>${sum("staked")}</strong></div>
      <div class="card"><span class="muted-text">Izplačano</span><strong>${sum("won")}</strong></div>
    </div>
    <p class="muted-text sv-help">Samo za admina. Stanje = ${st.budget} − vloženo + priigrano + popravki. Klikni igralca za podrobnosti, graf in popravek stanja.</p>
    ${svCreateForm()}
    <details class="card sv-adj-new"><summary>Popravek za drugega igralca (po e-naslovu)</summary>${svAdjForm(null)}
      <datalist id="sv-emails">${people.map((p) => `<option value="${esc(p.email)}">${esc(p.name)}</option>`).join("")}</datalist></details>
    <section class="sv-list"><h3>Igralci</h3>${people.length ? `<div class="sv-people">${people.map(row).join("")}</div>` : `<p class="muted-text">Še nihče ni stavil.</p>`}</section>`;
}
/* Stanje (free coins) and portfelj (stanje + stakes still in play) after every event, oldest first */
function svSeries(st, p) {
  const qById = Object.fromEntries(st.questions.map((q) => [q.id, q]));
  const ev = [];
  for (const b of p.bets) {
    const q = qById[b.question], label = (q ? svLabel(q, b.option) : b.option);
    ev.push({ ts: b.ts, dB: -b.amount, dP: 0, kind: "bet", text: `Stava ${b.amount} na »${label}« · ${b.question}` });
    if (b.payout !== null) {
      const ts = q?.resolvedAt || Math.max(b.ts + 1, Date.now() - 1);
      ev.push({ ts, dB: b.payout, dP: b.payout - b.amount, kind: b.payout ? "win" : "loss", text: `${b.payout ? `Zadel +${b.payout}` : `Ni zadel (−${b.amount})`} · ${b.question}` });
    }
  }
  for (const a of p.adjustments || []) ev.push({ ts: a.ts, dB: a.amount, dP: a.amount, kind: "adj", text: `Popravek ${a.amount > 0 ? "+" : ""}${a.amount} · ${a.reason}` });
  ev.sort((x, y) => x.ts - y.ts || (x.kind === "bet" ? -1 : 1));
  let bal = st.budget, port = st.budget;
  const t0 = ev.length ? ev[0].ts - 60000 : Date.now() - 3600000;
  const pts = [{ ts: t0, bal, port, text: `Začetek: ${st.budget}` }];
  for (const e of ev) { bal += e.dB; port += e.dP; pts.push({ ts: e.ts, bal, port, text: e.text, kind: e.kind }); }
  pts.push({ ts: Math.max(Date.now(), pts[pts.length - 1].ts + 60000), bal, port, text: "Zdaj", now: true });
  return pts;
}
const SV_C_BAL = "#c08214", SV_C_PORT = "#3a84c9";
function svChart(pts) {
  // drawn at (roughly) the on-screen width so text stays readable on phones
  const W = Math.round(Math.min(680, Math.max(300, (document.querySelector("#stavnica")?.clientWidth || 640) - 60))), H = W < 420 ? 220 : 250, L = 30, R = W < 420 ? 58 : 66, T = 14, B = 28;
  const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
  const vals = pts.flatMap((p) => [p.bal, p.port]);
  const lo = Math.min(0, ...vals), hiRaw = Math.max(...vals), step = hiRaw - lo > 40 ? 10 : hiRaw - lo > 16 ? 5 : 2;
  const hi = Math.ceil((hiRaw + 1) / step) * step;
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const stepPath = (k) => pts.map((p, i) => (i ? `H${x(p.ts).toFixed(1)}V${y(p[k]).toFixed(1)}` : `M${x(p.ts).toFixed(1)},${y(p[k]).toFixed(1)}`)).join("");
  const grid = []; for (let v = lo; v <= hi; v += step) grid.push(`<line class="svc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="svc-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const fmt = (t) => new Date(t).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const xs = W < 420 ? [[t0, "start"], [t1, "end"]] : [[t0, "start"], [t0 + (t1 - t0) / 2, "middle"], [t1, "end"]];
  const xt = xs.map(([t, anchor]) => `<text class="svc-tick" x="${x(t)}" y="${H - 8}" text-anchor="${anchor}">${esc(fmt(t))}</text>`).join("");
  const last = pts[pts.length - 1];
  const dots = pts.slice(1, -1).map((p) => `<circle class="svc-dot" cx="${x(p.ts)}" cy="${y(p.bal)}" r="3.5" fill="${SV_C_BAL}"/><circle class="svc-dot" cx="${x(p.ts)}" cy="${y(p.port)}" r="3.5" fill="${SV_C_PORT}"/>`).join("");
  // end labels (nudged apart when the lines end close together)
  let yb = y(last.bal), yp = y(last.port); if (Math.abs(yb - yp) < 14) { if (yb <= yp) { yb -= 7; yp += 7; } else { yb += 7; yp -= 7; } }
  return `<svg class="svc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stanje in portfelj skozi čas" data-pts='${esc(JSON.stringify(pts.map((p) => [p.ts, p.bal, p.port, p.text])))}' data-geo="${[W, H, L, R, T, B, t0, t1, lo, hi].join(",")}">
      ${grid.join("")}${xt}
      <path class="svc-line" d="${stepPath("port")}" stroke="${SV_C_PORT}"/><path class="svc-line" d="${stepPath("bal")}" stroke="${SV_C_BAL}"/>${dots}
      <text class="svc-end" x="${W - R + 6}" y="${yp + 4}" fill="currentColor">Portfelj ${last.port}</text>
      <text class="svc-end" x="${W - R + 6}" y="${yb + 4}" fill="currentColor">Stanje ${last.bal}</text>
      <line class="svc-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <rect class="svc-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg>`;
}
function svPlayer(st, slug) {
  const p = (st.people || []).find((x) => svPlayerSlug(x.email) === slug);
  if (!p) return `<p class="person-back sv-back"><a href="#zabava/stavnica/pregled">← Pregled</a></p><div class="card sv-empty"><p>Igralec ni najden.</p></div>`;
  const w = wdWho(p.email, p.name), pts = svSeries(st, p), open = p.bets.filter((b) => b.payout === null);
  const potential = open.reduce((a, b) => a + b.amount * (b.odds || 1), 0), last = pts[pts.length - 1];
  const fmt = (t) => new Date(t).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  return `<p class="person-back sv-back"><a href="#zabava/stavnica/pregled">← Pregled</a></p>
    <header class="card sv-player-head">${w.av.replace("avatar-sm", "avatar-os")}<div><h2>${esc(p.name || p.email)}</h2><p class="muted-text">${esc(p.email)}</p></div>
      <div class="sv-player-bal"><small>Stanje</small><strong>${SV_COIN} ${p.balance}</strong></div></header>
    <div class="sv-stats">
      <div class="card"><span class="muted-text">Portfelj</span><strong>${last.port}</strong></div>
      <div class="card"><span class="muted-text">V igri</span><strong>${p.open}</strong></div>
      <div class="card"><span class="muted-text">Vloženo</span><strong>${p.staked}</strong></div>
      <div class="card"><span class="muted-text">Priigrano</span><strong>${p.won}</strong></div>
      <div class="card"><span class="muted-text">Možen dobitek</span><strong>${potential}</strong></div>
      <div class="card"><span class="muted-text">Popravki</span><strong>${p.adjusted > 0 ? "+" : ""}${p.adjusted || 0}</strong></div>
    </div>
    <section class="card svc-card"><div class="svc-head"><h3>Stanje in portfelj</h3>
        <span class="svc-legend"><span><i style="background:${SV_C_BAL}"></i>Stanje</span><span><i style="background:${SV_C_PORT}"></i>Portfelj (stanje + vložki v igri)</span></span></div>
      ${svChart(pts)}
      <details class="pvc-table"><summary>Dogodki</summary><table><thead><tr><th>Čas</th><th>Dogodek</th><th>Stanje</th><th>Portfelj</th></tr></thead><tbody>${pts.slice(1, -1).reverse().map((x) => `<tr><td>${esc(fmt(x.ts))}</td><td>${esc(x.text)}</td><td>${x.bal}</td><td>${x.port}</td></tr>`).join("")}</tbody></table></details>
    </section>
    <section class="card sv-p-adj-card"><h3>Popravek stanja</h3>${svAdjForm(p)}</section>
    <section class="sv-list">${svSections(p.bets, p.adjustments)}</section>`;
}
/* Chart hover: crosshair + tooltip at the last event before the pointer */
document.addEventListener("pointermove", (e) => {
  const svg = e.target.closest?.(".svc-svg"); const tipEl = $("#svc-tip");
  if (!svg) { if (tipEl) tipEl.hidden = true; $$(".svc-cross").forEach((c) => c.setAttribute("visibility", "hidden")); return; }
  const [W, H, L, R, T, B, t0, t1] = svg.dataset.geo.split(",").map(Number), pts = JSON.parse(svg.dataset.pts);
  const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * W;
  const t = t0 + ((sx - L) / (W - L - R)) * (t1 - t0);
  let i = 0; while (i + 1 < pts.length && pts[i + 1][0] <= t) i++;
  const p = pts[i], cx = L + ((p[0] - t0) / (t1 - t0 || 1)) * (W - L - R);
  const cross = $(".svc-cross", svg); cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
  const tip = tipEl || document.body.appendChild(Object.assign(document.createElement("div"), { id: "svc-tip", className: "pvc-tip", role: "tooltip" }));
  tip.innerHTML = `<strong>${esc(new Date(p[0]).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }))}</strong><br>${esc(p[3])}<br><span style="color:${SV_C_BAL}">●</span> Stanje <b>${p[1]}</b> · <span style="color:${SV_C_PORT}">●</span> Portfelj <b>${p[2]}</b>`;
  tip.hidden = false; tip.style.whiteSpace = "normal";
  const tr = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - tr.width - 8, Math.max(8, e.clientX - tr.width / 2))}px`;
  tip.style.top = `${Math.max(8, r.top + (T / H) * r.height - tr.height - 6)}px`;
});
function svProfile(st, me) {
  const open = me.bets.filter((b) => b.payout === null), done = me.bets.filter((b) => b.payout !== null);
  const pending = open.reduce((a, b) => a + b.amount * (b.odds || 1), 0);

  return `<div class="sv-top card"><div><span class="sv-bal-label">Tvoje stanje</span><strong class="sv-bal">${SV_COIN} ${me.balance} <small>zlatnikov</small></strong></div>
      <button type="button" class="btn ghost sv-refresh" data-sv-reload>Osveži</button></div>
    <div class="sv-stats">
      <div class="card"><span class="muted-text">Začetno</span><strong>${st.budget}</strong></div>
      <div class="card"><span class="muted-text">Vloženo</span><strong>${me.staked ?? me.bets.reduce((a, b) => a + b.amount, 0)}</strong></div>
      <div class="card"><span class="muted-text">Priigrano</span><strong>${me.won ?? done.reduce((a, b) => a + (b.payout || 0), 0)}</strong></div>
      <div class="card"><span class="muted-text">Možen dobitek</span><strong>${pending}</strong></div>
      ${me.adjusted ? `<div class="card sv-stat-adj"><span class="muted-text">Popravki admina</span><strong>${me.adjusted > 0 ? "+" : ""}${me.adjusted}</strong></div>` : ""}
    </div>
    <p class="muted-text sv-help">Vsak začne z ${st.budget} zlatniki. Če zadeneš, dobiš vložek pomnožen s številom možnosti (da/ne ×2, tri možnosti ×3 …). Izplačilo dobiš, ko je vprašanje razrešeno.</p>
    <section class="sv-list"><h3>Moje stave</h3>${me.bets.length || me.adjustments?.length ? svSections(me.bets, me.adjustments) : `<p class="muted-text">Še nisi stavil/a. <a href="#zabava/stavnica">Na stave ›</a></p>`}</section>`;
}
/* Hourly background check (and on return to the tab after >1 h): re-render only if bets changed and no bet slip is open */
/* Fresh data while Stavnica is open: what is loaded shows at once and is re-fetched in the background when older than
   SV_FRESH (opening the page, back from the background, a 30 s check, »Osveži«). The page is not redrawn while the
   user is betting or typing in a form; the new data waits until then. */
const SV_FRESH = 90 * 1000;
const svSig = (x) => JSON.stringify([x.questions, x.recent, x.me, x.people]);
function svBusy() {
  const a = document.activeElement;
  return !!($("#stavnica form.sv-bet") || (a && a.closest?.("#stavnica form"))
    || $$("#stavnica .sv-create-form textarea, #stavnica .sv-create-form input, #stavnica .sv-adj-form input[type=text], #stavnica .sv-adj-form input[type=email]").some((x) => x.value.trim()));
}
function svMeta() {
  const el = $("#sv-updated");
  if (!el) return;
  const t = sv.fetchedAt ? new Date(sv.fetchedAt).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" }) : "";
  el.innerHTML = sv.loading ? "Osvežujem …" : `${t ? `Posodobljeno ob ${t} · ` : ""}<button type="button" class="link-btn" data-sv-reload>Osveži</button>`;
}
async function svRefresh(force = false) {
  if (sv.loading || !sv.state) return;
  sv.loading = true; svMeta();
  let next = null;
  try { next = await scriptLoad("stavnica", true); } catch { sv.fetchedAt = Date.now() - SV_FRESH + 60 * 1000; } // failed: keep the old data, try again in a minute
  sv.loading = false;
  if (next) {
    if (svSig(next) !== svSig(sv.state)) sv.dirty = true;
    sv.state = next; sv.fetchedAt = Date.now();
  }
  if (sv.dirty && !svBusy()) { sv.dirty = false; renderStavnica(); } else svMeta();
}
function svKeepFresh() {
  const box = $("#stavnica");
  if (currentTab !== "zabava" || !box || box.hidden || document.hidden || !sv.state) return;
  if (sv.dirty && !svBusy()) { sv.dirty = false; renderStavnica(); return; }
  if (Date.now() - (sv.fetchedAt || 0) > SV_FRESH) svRefresh();
}
setInterval(svKeepFresh, 30 * 1000);
document.addEventListener("visibilitychange", svKeepFresh);
function svUpdatePayout() {
  const f = $("#stavnica form.sv-bet"), q = f && sv.state?.questions[f.dataset.svQ];
  if (!q) return;
  const amt = Math.max(0, Math.floor(Number(f.amount.value) || 0)), n = svOdds(q);
  $("[data-sv-payout]", f).textContent = amt ? `Če zadeneš, dobiš ${amt * n} zlatnikov (×${n}).` : "";
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#stavnica")) return;
  const opt = e.target.closest(".sv-opt"), chip = e.target.closest("[data-sv-amt]");
  if (opt) { sv.open = { q: Number(opt.dataset.svQ), o: opt.dataset.svO }; renderStavnica(); $("#stavnica form.sv-bet input")?.focus(); }
  else if (chip) { const f = chip.closest("form"); f.amount.value = chip.dataset.svAmt; svUpdatePayout(); }
  else if (e.target.closest("[data-sv-cancel]")) { sv.open = null; renderStavnica(); }
  else if (e.target.closest("[data-sv-reload]")) renderStavnica(true);
  else if (e.target.closest("a[href^='#zabava/stavnica']")) sv.open = null;
});
document.addEventListener("input", (e) => { if (e.target.closest("#stavnica form.sv-bet")) svUpdatePayout(); });
/* Admin: add / take away zlatniki */
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("#stavnica form[data-sv-adj]");
  if (!f) return;
  e.preventDefault();
  const dir = Number(e.submitter?.value || 1), amount = Math.abs(Math.trunc(Number(f.amount.value))) * dir;
  const email = (f.dataset.email || f.email?.value || "").trim().toLowerCase(), reason = f.reason.value.trim(), status = $(".sv-status", f);
  if (!email || !amount || !reason) return;
  const name = f.dataset.name || sv.state.people?.find((p) => p.email === email)?.name || "";
  if (!confirm(`${amount > 0 ? "Dodam" : "Odvzamem"} ${Math.abs(amount)} ${Math.abs(amount) === 1 ? "zlatnik" : Math.abs(amount) === 2 ? "zlatnika" : Math.abs(amount) < 5 ? "zlatnike" : "zlatnikov"} igralcu ${name || email}?\nRazlog: ${reason}`)) return;
  $$("button", f).forEach((b) => (b.disabled = true)); status.className = "sv-status"; status.textContent = "Shranjujem …";
  try {
    sv.state = await svCall({ action: "adjust", email, amount, reason, name });
    sv.fetchedAt = Date.now(); renderStavnica();
  } catch (err) {
    status.className = "sv-status is-err"; status.textContent = `Ni uspelo (${{ auth: "prijava je potekla", offline: "ni povezave", network: "strežnik ni dosegljiv", timeout: "strežnik se ni odzval" }[err.kind] || err.message}).`;
    $$("button", f).forEach((b) => (b.disabled = false));
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target.closest("#stavnica form.sv-bet");
  if (!f) return;
  e.preventDefault();
  const q = sv.state.questions[f.dataset.svQ], amount = Math.floor(Number(f.amount.value)), status = $(".sv-status", f), btn = $("button[type=submit]", f);
  if (!(amount >= 1) || amount > sv.state.me.balance) { status.className = "sv-status is-err"; status.textContent = `Vložek mora biti med 1 in ${sv.state.me.balance}.`; return; }
  btn.disabled = true; status.className = "sv-status"; status.textContent = "Stavim …";
  try {
    sv.state = await svCall({ action: "bet", question: q.id, option: f.dataset.svO, amount });
    sv.open = null; renderStavnica();
    const ok = $("#stavnica .sv-foot"); if (ok) { ok.innerHTML = `Stava sprejeta: ${amount} ${SV_COIN} na »${esc(svLabel(q, f.dataset.svO))}«.`; ok.classList.add("is-ok"); }
  } catch (err) {
    const why = { auth: "prijava je potekla – osveži prijavo v meniju", offline: "ni internetne povezave", network: "strežnik ni dosegljiv", timeout: "strežnik se ni odzval" }[err.kind] || err.message || err;
    status.className = "sv-status is-err"; status.textContent = `Stava ni uspela (${why}).`; btn.disabled = false;
  }
});
/* —— Ekipa → Lestvica ocen tem: tema grades (Apps Script type "ocene", SVOD/admin only) × facilitators (data.temas.odgovorni) —— */
const ocene = { data: null, at: 0, loading: false, error: null };
/* Shared loader (leaderboard + Teme scores); one request in flight, reused for 10 min */
let oceneP = null;
function loadOcene(force = false) {
  if (ocene.data && !force) return Promise.resolve(ocene.data);
  if (oceneP) return oceneP;
  ocene.loading = true;
  oceneP = (async () => {
    try {
      if (pvData === undefined) { try { const r = await fetch("data/preverbe.json", { cache: "no-store" }); pvData = r.ok ? await r.json() : null; } catch { pvData = null; } }
      ocene.data = await scriptLoad("ocene", force); ocene.at = Date.now(); ocene.error = null;
    } catch (err) { ocene.error = err; }
    ocene.loading = false; oceneP = null;
    return ocene.data;
  })();
  return oceneP;
}
const canSeeOcene = () => ["svod", "admin"].includes(effectiveRole(state.user?.email));
/* Scored feedback per tema: one entry per tema form, plus one per "split" part of a shared form (Izbirne teme:
   responses filtered per tema into their own tab, optionally with its own facilitators instead of the tema's odgovorni) */
function pvScoreEntries() {
  return (pvData?.temaForms || []).flatMap((f, i) => f.split
    ? f.split.map((x) => ({ tema: x.tema, responsesTab: x.responsesTab, occs: pvFormOccs(f), who: x.odgovorni || null }))
    : f.tema ? [{ tema: f.tema, responsesTab: f.responsesTab, i, occs: pvFormOccs(f), who: null }] : []);
}
const pvTabFor = (tabs, e) => tabs.find((t) => t.name === e.responsesTab) || (e.i != null ? tabs.find((t) => parseInt(t.name, 10) === e.i + 1) : null);
/* Grade stats for one tema slug from the responses tabs, all parts merged (null if none yet) */
function temaScore(slug) {
  const tabs = ocene.data?.tabs || [];
  const hit = pvScoreEntries().filter((e) => e.tema === slug).map((e) => pvTabFor(tabs, e)).filter((t) => t?.n);
  if (!hit.length) return null;
  if (hit.length === 1) return hit[0];
  const n = hit.reduce((a, t) => a + t.n, 0), sum = hit.reduce((a, t) => a + t.sum, 0);
  return { ...hit[0], n, sum, avg: sum / n, dist: [0, 1, 2, 3, 4].map((k) => hit.reduce((a, t) => a + (t.dist?.[k] || 0), 0)) };
}
const scoreFmt = (x) => x.toFixed(2).replace(".", ",");
async function renderOcene(force = false) {
  const box = $("#ocene-body");
  if (!box || !canSee("ekipa")) return;
  if (!ocene.data) box.innerHTML = `<p class="muted-text">Nalagam ocene …</p>`;
  await loadOcene(force);
  if (!ocene.data) {
    const e = ocene.error, k = e?.kind;
    const msg = { auth: "Prijava je potekla – osveži prijavo v meniju.", denied: "Ocene vidijo le SVOD in admin.", offline: "Ni internetne povezave.", network: "Strežnik ni dosegljiv (slaba povezava?).", timeout: "Strežnik se ni odzval.", config: "Strežnik ni nastavljen." }[k]
      || (/unknown|neznan|doGet|Wordle|bad_date/i.test(e?.message || "") ? "Strežnik še ne pozna lestvice ocen (Apps Script ni posodobljen)." : `Ocen ni bilo mogoče naložiti (${e?.message || "napaka"}).`);
    box.innerHTML = `<p class="muted-text">${esc(msg)}</p><button type="button" class="btn ghost" data-ocene-reload>Poskusi znova</button>`;
    return;
  }
  const tabs = ocene.data.tabs || [], temas = state.data?.temas || {}, people = state.data?.people || {};
  const now = ljNow(), nowKey = `${now.date} ${now.label}`;
  const done = pvScoreEntries().map((e) => {
    const t = temas[e.tema], tab = pvTabFor(tabs, e);
    const last = e.occs.map((o) => `${o.date} ${o.end}`).sort().pop();
    const who = e.who ? e.who.map((slug) => ({ slug, name: people[slug]?.name || slug })) : t?.odgovorni || [];
    return t && tab?.n && last && last <= nowKey ? { slug: e.tema, title: t.title, tab, who } : null;
  }).filter(Boolean);
  const agg = {};
  done.forEach((d) => d.who.forEach((w) => {
    const a = (agg[w.slug] ||= { slug: w.slug, name: w.name, sum: 0, n: 0, temas: [] });
    a.sum += d.tab.sum; a.n += d.tab.n; a.temas.push(d);
  }));
  const rows = Object.values(agg).map((a) => ({ ...a, avg: a.sum / a.n })).sort((a, b) => b.avg - a.avg || b.n - a.n);
  const fmt = (x) => x.toFixed(2).replace(".", ",");
  // Shared rank for equal averages (co-facilitators of the same tema): 1, 1, 3, 3 …
  rows.forEach((r, i) => { r.rank = i && Math.abs(r.avg - rows[i - 1].avg) < 1e-9 ? rows[i - 1].rank : i + 1; });
  box.innerHTML = rows.length ? `<ol class="ocene-list">${rows.map((r) => {
    const p = people[r.slug] || { name: r.name };
    const rank = ["🥇", "🥈", "🥉"][r.rank - 1] || `${r.rank}.`;
    return `<li class="ocene-row">
      <span class="ocene-rank">${rank}</span>${avatarHtml(p, "avatar-sm")}
      <div class="ocene-main"><a class="ocene-name" href="#oseba-${esc(r.slug)}">${esc(displayName(p))}</a>
        <span class="ocene-temas">${r.temas.map((d) => `<span class="ocene-chip" title="${d.tab.n} ocen">${esc(d.title)} <strong>${fmt(d.tab.avg)}</strong></span>`).join("")}</span></div>
      <div class="ocene-score"><strong>★ ${fmt(r.avg)}</strong><small>${r.temas.length} ${r.temas.length === 1 ? "tema" : r.temas.length === 2 ? "temi" : r.temas.length < 5 ? "teme" : "tem"} · ${r.n} ocen</small></div>
    </li>`;
  }).join("")}</ol>` : `<p class="muted-text">Še ni končanih tem z ocenami.</p>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-ocene-reload]")) renderOcene(true); });
/* —— Vprašanja (SVOD + admin): "Kaj te še zanima o tej temi?" answers per tema (Apps Script type "vprasanja") —— */
const vq = { data: null, at: 0, loading: false, error: null };
async function renderVprasanja(force = false) {
  const box = $("#vq-body");
  if (!box || !canSee("vprasanja")) return;
  if (!vq.data || force) {
    if (vq.loading) return;
    vq.loading = true;
    try {
      if (pvData === undefined) { try { const r = await fetch("data/preverbe.json", { cache: "no-store" }); pvData = r.ok ? await r.json() : null; } catch { pvData = null; } }
      vq.data = await scriptLoad("vprasanja", force); vq.at = Date.now(); vq.error = null;
    } catch (err) { vq.error = err; }
    vq.loading = false;
  }
  if (!vq.data) {
    const e = vq.error, k = e?.kind;
    const msg = { auth: "Prijava je potekla – osveži prijavo v meniju.", denied: "Vprašanja vidita le SVOD in admin.", offline: "Ni internetne povezave.", network: "Strežnik ni dosegljiv (slaba povezava?).", timeout: "Strežnik se ni odzval.", config: "Strežnik ni nastavljen." }[k]
      || (/bad_date|invalid|unknown/i.test(e?.message || "") ? "Strežnik še ne pozna vprašanj (Apps Script ni posodobljen)." : `Vprašanj ni bilo mogoče naložiti (${e?.message || "napaka"}).`);
    box.innerHTML = `<p class="muted-text">${esc(msg)}</p><button type="button" class="btn ghost" data-vq-reload>Poskusi znova</button>`;
    return;
  }
  const forms = pvData?.temaForms || [], temas = state.data?.temas || {};
  const temaOf = (tab) => {
    const part = forms.flatMap((f) => f.split || []).find((x) => x.responsesTab === tab.name);
    if (part) return temas[part.tema]?.title || tab.name;
    const i = forms.findIndex((f) => f.responsesTab === tab.name), j = i >= 0 ? i : (parseInt(tab.name, 10) || 0) - 1;
    const f = forms[j];
    return f ? pvFormName(f) : tab.name.replace(/^\d+\s*[_.-]?\s*/, "") || `Tema ${tab.name}`;
  };
  const when = (ts) => ts ? new Date(ts).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const tabs = (vq.data.tabs || []).filter((t) => t.items?.length)
    .sort((a, b) => (parseInt(a.name, 10) || 99) - (parseInt(b.name, 10) || 99));
  const total = tabs.reduce((a, t) => a + t.items.length, 0);
  const done = vq.data.done || {}, isDone = (x) => !!(x.id && done[x.id]);
  const nDone = tabs.reduce((a, t) => a + t.items.filter(isDone).length, 0);
  let hide = false; try { hide = localStorage.getItem("uvodja.vq.hideDone") === "1"; } catch {}
  const cnt = (n) => `${n} ${n === 1 ? "vprašanje" : n === 2 ? "vprašanji" : n < 5 ? "vprašanja" : "vprašanj"}`;
  const card = (x) => `<article class="card vq-card${isDone(x) ? " is-done" : ""}"${hide && isDone(x) ? " hidden" : ""}>
      ${x.id ? `<button type="button" class="vq-check" data-vq-id="${esc(x.id)}" aria-pressed="${isDone(x)}" title="${isDone(x) ? "Odgovorjeno – klikni za razveljavitev" : "Označi kot odgovorjeno"}" aria-label="Odgovorjeno">✓</button>` : ""}
      <p>${esc(x.text).replace(/\n/g, "<br>")}</p>${x.ts ? `<time class="muted-text">${esc(when(x.ts))}</time>` : ""}</article>`;
  box.innerHTML = tabs.length ? `<div class="vq-bar"><p class="muted-text vq-sum"><strong>${nDone}</strong> od ${cnt(total)} odgovorjenih · ${tabs.length} ${tabs.length === 1 ? "tema" : tabs.length === 2 ? "temi" : tabs.length < 5 ? "teme" : "tem"} · <button type="button" class="link-btn" data-vq-reload>Osveži</button></p>
      <label class="pv-anon vq-hide"><input type="checkbox" data-vq-hide${hide ? " checked" : ""} /> Skrij odgovorjene</label></div>
      <p class="vq-err" role="status" aria-live="polite"></p>` + tabs.map((t) => {
        const open = t.items.filter((x) => !isDone(x)).length;
        return `<section class="vq-group"${hide && !open ? " hidden" : ""}>
      <h3 class="pv-sub-h">${esc(temaOf(t))} <span class="vq-count" title="neodgovorjena / vsa">${open} / ${t.items.length}</span></h3>
      <div class="vq-grid">${[...t.items].sort((a, b) => isDone(a) - isDone(b) || (b.ts || 0) - (a.ts || 0)).map(card).join("")}</div>
    </section>`; }).join("") : `<p class="muted-text">Še ni vprašanj.</p>`;
}
/* Tick a question as answered (optimistic; shared via Apps Script) */
async function vqMark(id, on) {
  vq.data.done = { ...(vq.data.done || {}) };
  if (on) vq.data.done[id] = Date.now(); else delete vq.data.done[id];
  renderVprasanja();
  try {
    const cfg = await wdConfig(), credential = await wdFreshToken();
    if (!credential) throw Object.assign(new Error("auth"), { kind: "auth" });
    const res = await wdPost(cfg.scriptUrl, { type: "vprasanja", action: "mark", id, done: on }, credential);
    if (!res?.ok) throw new Error(res?.error || "napaka");
    vq.data.done = res.done || vq.data.done;
  } catch (err) {
    if (on) delete vq.data.done[id]; else vq.data.done[id] = Date.now();
    renderVprasanja();
    const m = $("#vq-body .vq-err");
    if (m) m.textContent = `Oznake ni bilo mogoče shraniti (${{ auth: "prijava je potekla", offline: "ni povezave", network: "strežnik ni dosegljiv", timeout: "strežnik se ni odzval" }[err.kind] || err.message}).`;
  }
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-vq-id]"); if (b) vqMark(b.dataset.vqId, b.getAttribute("aria-pressed") !== "true"); });
document.addEventListener("change", (e) => {
  if (!e.target.matches?.("[data-vq-hide]")) return;
  try { localStorage.setItem("uvodja.vq.hideDone", e.target.checked ? "1" : "0"); } catch {}
  renderVprasanja();
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-vq-reload]")) renderVprasanja(true); });
/* Teme: ★ badge on list cards + "Ocena teme" card on a tema's page (SVOD/admin, same data as the leaderboard) */
async function decorateTemeScores() {
  if (!canSeeOcene()) return;
  await loadOcene();
  if (!ocene.data) return;
  $$("#teme-overview .tm-card").forEach((card) => {
    const slug = $(".tm-title", card)?.dataset.tema, sc = slug && temaScore(slug), badges = $(".tm-badges", card);
    $(".badge.score", card)?.remove();
    if (sc && badges) badges.insertAdjacentHTML("afterbegin", `<span class="badge score" title="Povprečna ocena (${sc.n} ocen)">★ ${scoreFmt(sc.avg)}</span>`);
  });
  const box = $("#tema-score"), slug = state.temaSlug;
  if (!box || !slug) return;
  const sc = temaScore(slug);
  box.hidden = !sc;
  if (!sc) return;
  const max = Math.max(1, ...sc.dist);
  box.innerHTML = `<h3>Ocena teme</h3>
    <div class="ts-wrap"><div class="ts-big"><strong>★ ${scoreFmt(sc.avg)}</strong><span class="muted-text">${sc.n} ocen · lestvica 1–5</span></div>
    <ul class="ts-dist">${[5, 4, 3, 2, 1].map((g) => `<li><span class="ts-g">${g}</span><span class="ts-bar"><i style="width:${(sc.dist[g - 1] / max) * 100}%"></i></span><span class="ts-n">${sc.dist[g - 1]}</span></li>`).join("")}</ul></div>
    <p class="muted-text ts-note">Iz preverb tem (zavihek Preverbe → Teme). Komentarji niso prikazani.</p>`;
}
/* —— Analitika → candle (box-plot) charts per Preverba SVODa day and per tema with feedback (Apps Script type "analitika", admin only) —— */
const pvc = { data: null, at: 0, loading: false, error: null };
function pvcStats(v) {
  const a = [...v].sort((x, y) => x - y), q = (p) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return { n: a.length, min: a[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: a[a.length - 1], mean: a.reduce((s, x) => s + x, 0) / a.length };
}
const pvcFmt = (x) => (Math.round(x * 100) / 100).toLocaleString("sl-SI");
/* opts.named: x axis shows each candle's name (wrapped to 2 lines) instead of V1, V2 … */
function pvcWrap(t, max = 14) {
  const words = String(t).split(/\s+/), lines = [""];
  for (const w of words) { const cur = lines[lines.length - 1]; if (cur && (cur + " " + w).length > max) { if (lines.length === 2) { lines[1] += "…"; break; } lines.push(w); } else lines[lines.length - 1] = cur ? cur + " " + w : w; }
  return lines.map((l) => (l.length > max + 1 ? l.slice(0, max) + "…" : l));
}
function pvcChart(form, opts = {}) {
  const qs = form.questions.filter((q) => q.values.length).map((q) => ({ ...q, s: pvcStats(q.values) }));
  if (!qs.length) return `<p class="muted-text">Ni številčnih odgovorov.</p>`;
  const vmax = Math.max(...qs.map((q) => q.s.max)), vmin = Math.min(...qs.map((q) => q.s.min));
  const hi = vmax <= 5 ? 5 : vmax <= 10 ? 10 : Math.ceil(vmax), lo = Math.min(1, Math.floor(vmin));
  const named = !!opts.named;
  const W = Math.max(320, qs.length * (named ? 96 : 64) + 48), H = named ? 240 : 220, L = 34, R = 10, T = 12, B = named ? 46 : 30, bw = (W - L - R) / qs.length;
  const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = []; const step = hi - lo > 6 ? 2 : 1;
  for (let v = lo; v <= hi; v += step) ticks.push(`<line class="pvc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="pvc-tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const candles = qs.map((q, i) => {
    const cx = L + bw * i + bw / 2, w = Math.min(28, bw * 0.45), s = q.s;
    const tip = `${named ? "" : `V${i + 1}: `}${q.title}\nn = ${s.n} · povprečje ${pvcFmt(s.mean)} · mediana ${pvcFmt(s.med)}\nmin ${pvcFmt(s.min)} · Q1 ${pvcFmt(s.q1)} · Q3 ${pvcFmt(s.q3)} · max ${pvcFmt(s.max)}`;
    return `<g class="pvc-candle" tabindex="0" data-tip="${esc(tip)}">
      <rect class="pvc-hit" x="${cx - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}"/>
      <line class="pvc-whisker" x1="${cx}" x2="${cx}" y1="${y(s.max)}" y2="${y(s.min)}"/>
      <line class="pvc-whisker" x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${y(s.max)}" y2="${y(s.max)}"/><line class="pvc-whisker" x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${y(s.min)}" y2="${y(s.min)}"/>
      <rect class="pvc-box" x="${cx - w / 2}" y="${y(s.q3)}" width="${w}" height="${Math.max(2, y(s.q1) - y(s.q3))}" rx="4"/>
      <line class="pvc-median" x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${y(s.med)}" y2="${y(s.med)}"/>
      <circle class="pvc-mean" cx="${cx}" cy="${y(s.mean)}" r="4"/>
      ${named ? `<text class="pvc-x" x="${cx}" y="${H - B + 16}" text-anchor="middle">${pvcWrap(q.title).map((l, j) => `<tspan x="${cx}" dy="${j ? 13 : 0}">${esc(l)}</tspan>`).join("")}</text>` : `<text class="pvc-x" x="${cx}" y="${H - 10}" text-anchor="middle">V${i + 1}</text>`}
    </g>`;
  }).join("");
  const table = `<details class="pvc-table"><summary>Tabela</summary><table><thead><tr><th>#</th><th>Vprašanje</th><th>n</th><th>min</th><th>Q1</th><th>mediana</th><th>Q3</th><th>max</th><th>povp.</th></tr></thead><tbody>${qs.map((q, i) => `<tr><td>${named ? i + 1 : `V${i + 1}`}</td><td>${esc(q.title)}</td><td>${q.s.n}</td>${["min", "q1", "med", "q3", "max", "mean"].map((k) => `<td>${pvcFmt(q.s[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  return `<div class="pvc-scroll"><svg class="pvc-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(form.title)}: porazdelitev odgovorov po vprašanjih">${ticks.join("")}${candles}</svg></div>
    <ol class="pvc-legend">${qs.map((q, i) => `<li>${named ? "" : `<span class="pvc-qn">V${i + 1}</span>`}${esc(q.title)} <span class="muted-text">· povp. ${pvcFmt(q.s.mean)} · n ${q.s.n}</span></li>`).join("")}</ol>${table}`;
}
/* Preverbe SVODa over time: one small panel per question (same 1–5 axis), x = days; line = daily mean, band = Q1–Q3 */
function pvcTrend(days) {
  const titles = [];
  days.forEach((d) => d.form.questions.forEach((q) => { if (q.values.length && !titles.includes(q.title)) titles.push(q.title); }));
  if (!titles.length) return `<p class="muted-text">Ni številčnih odgovorov.</p>`;
  const series = titles.map((title) => ({ title, pts: days.map((d) => { const q = d.form.questions.find((x) => x.title === title); return q?.values.length ? pvcStats(q.values) : null; }) }));
  const vmax = Math.max(...series.flatMap((x) => x.pts.filter(Boolean).map((s) => s.max)));
  const hi = vmax <= 5 ? 5 : vmax <= 10 ? 10 : Math.ceil(vmax), lo = 1;
  const W = 300, H = 156, L = 26, R = 14, T = 10, B = 32, n = days.length;
  const x = (i) => n === 1 ? (L + W - R) / 2 : L + 8 + (i * (W - L - R - 16)) / (n - 1);
  const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const step = hi - lo > 6 ? 2 : 1, colW = n === 1 ? W - L - R : (W - L - R - 16) / (n - 1);
  const panel = (sr) => {
    const idx = sr.pts.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    const last = sr.pts[idx[idx.length - 1]], prev = idx.length > 1 ? sr.pts[idx[idx.length - 2]] : null;
    const delta = prev ? last.mean - prev.mean : null;
    const trend = delta == null ? "" : Math.abs(delta) < 0.005 ? `<span class="pvt-delta">= 0</span>`
      : `<span class="pvt-delta ${delta > 0 ? "up" : "down"}" title="glede na prejšnji dan">${delta > 0 ? "▲ +" : "▼ −"}${Math.abs(delta).toFixed(2).replace(".", ",")}</span>`;
    let grid = "";
    for (let v = lo; v <= hi; v += step) grid += `<line class="pvc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="pvc-tick" x="${L - 7}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const band = idx.length > 1 ? `<path class="pvt-band" d="M${idx.map((i) => `${x(i)},${y(sr.pts[i].q3)}`).join("L")}L${[...idx].reverse().map((i) => `${x(i)},${y(sr.pts[i].q1)}`).join("L")}Z"/>` : "";
    const line = idx.length > 1 ? `<path class="pvt-line" d="M${idx.map((i) => `${x(i)},${y(sr.pts[i].mean)}`).join("L")}"/>` : "";
    const cols = days.map((d, i) => {
      const s = sr.pts[i];
      const tip = s ? `${d.label} – ${sr.title}\npovprečje ${pvcFmt(s.mean)} · mediana ${pvcFmt(s.med)} · n = ${s.n}\nQ1–Q3 ${pvcFmt(s.q1)}–${pvcFmt(s.q3)} · min–max ${pvcFmt(s.min)}–${pvcFmt(s.max)}` : `${d.label} – ni odgovorov`;
      return `<g class="pvc-candle pvt-col" tabindex="0" data-tip="${esc(tip)}">
        <rect class="pvc-hit" x="${x(i) - colW / 2}" y="${T}" width="${colW}" height="${H - T - B}"/>
        <line class="pvt-cross" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/>
        ${s && idx.length === 1 ? `<rect class="pvt-band" x="${x(i) - 6}" y="${y(s.q3)}" width="12" height="${Math.max(2, y(s.q1) - y(s.q3))}" rx="4"/>` : ""}
        ${s ? `<circle class="pvt-dot" cx="${x(i)}" cy="${y(s.mean)}" r="4.5"/>` : ""}
        <text class="pvc-tick pvt-x" x="${x(i)}" y="${H - 7}" text-anchor="middle">${esc(d.short)}</text>
      </g>`;
    }).join("");
    return `<figure class="pvt-panel">
      <figcaption><span class="pvt-q">${esc(sr.title)}</span><span class="pvt-now"><strong>${pvcFmt(last.mean)}</strong>${trend}</span></figcaption>
      <svg class="pvc-svg pvt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sr.title)}: povprečje po dnevih ${idx.map((i) => `${days[i].short} ${pvcFmt(sr.pts[i].mean)}`).join(", ")}">${grid}${band}${line}${cols}</svg>
    </figure>`;
  };
  const table = `<details class="pvc-table"><summary>Tabela</summary><table><thead><tr><th>#</th><th>Vprašanje</th>${days.map((d) => `<th>${esc(d.short)}</th>`).join("")}</tr></thead><tbody>${series.map((sr, i) => `<tr><td>${i + 1}</td><td>${esc(sr.title)}</td>${sr.pts.map((s) => `<td>${s ? `${pvcFmt(s.mean)} <span class="muted-text">(n ${s.n})</span>` : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  return `<p class="muted-text pvt-key"><span><span class="pvt-key-line"></span> povprečje</span><span><span class="pvt-key-band"></span> srednja polovica odgovorov (Q1–Q3)</span><span>lestvica ${lo}–${hi}</span></p>
    <div class="pvt-grid">${series.map(panel).join("")}</div>${table}`;
}
/* Analitika: folder tabs Obiski / Preverbe SVODa / Preverbe tem (#analitika/<tab>) */
function renderAnalitika(sub) {
  $$("#tab-analitika [data-an-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.anTab === sub)));
  ["obiski", "svod", "teme", "wordle"].forEach((k) => { $(`#an-${k}`).hidden = k !== sub; });
  if (sub === "obiski") renderVisits(); else if (sub === "wordle") renderWdAnalitika(); else renderPvCharts();
}
/* Analitika → Wordle: per puzzle day (up to today) players split into solved / not solved, and mean guesses of the solvers.
   Two charts on one shared day axis (two measures, two scales – never a dual axis) */
async function renderWdAnalitika(force = false) {
  const box = $("#wda-body");
  if (!box) return;
  if (!wd.data) { try { const r = await fetch("data/wordle.json", { cache: "no-store" }); wd.data = r.ok ? await r.json() : null; } catch { wd.data = null; } }
  let scores;
  try { scores = await scriptLoad("scores", force); } catch { scores = null; }
  if (!wd.data || !Array.isArray(scores)) { box.innerHTML = `<p class="muted-text">Rezultatov ni bilo mogoče naložiti.</p><button type="button" class="btn ghost" data-wda-reload>Poskusi znova</button>`; return; }
  const today = ljNow().date;
  const days = wd.data.puzzles.filter((p) => p.date <= today).map((p) => {
    const rows = scores.filter((r) => r.date === p.date), won = rows.filter((r) => r.solved);
    const mean = won.length ? won.reduce((a, r) => a + r.guesses, 0) / won.length : null;
    const dist = [1, 2, 3, 4, 5, 6].map((g) => won.filter((r) => r.guesses === g).length);
    return { date: p.date, n: p.n, short: `${Number(p.date.slice(8))}. ${Number(p.date.slice(5, 7))}.`, played: rows.length, solved: won.length, failed: rows.length - won.length, mean, dist };
  });
  if (!days.length) { box.innerHTML = `<p class="muted-text">Še ni bilo nobene uganke.</p>`; return; }
  const players = new Set(scores.filter((r) => days.some((d) => d.date === r.date)).map((r) => r.email)).size;
  const allWon = days.reduce((a, d) => a + d.solved, 0), allPlayed = days.reduce((a, d) => a + d.played, 0);
  const allMean = allWon ? days.reduce((a, d) => a + (d.mean || 0) * d.solved, 0) / allWon : null;
  const last = days[days.length - 1];
  const fmt = (x) => x == null ? "–" : x.toFixed(2).replace(".", ",");
  const L = 34, R = 12, T = 18, n = days.length, bw = Math.max(36, Math.min(64, ((box.clientWidth || 640) - L - R) / n)), W = L + R + bw * n;
  const cx = (i) => L + bw * i + bw / 2;
  const xLabels = (H, B) => days.map((d, i) => `<text class="pvc-tick pvt-x" x="${cx(i)}" y="${H - B + 16}" text-anchor="middle">${esc(d.short)}</text>`).join("");
  const col = (i, H, B, tip, inner) => `<g class="pvc-candle pvt-col" tabindex="0" data-tip="${esc(tip)}"><rect class="pvc-hit" x="${cx(i) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}"/>${inner}</g>`;
  const dayTip = (d) => `${wdFmtDate(d.date)} (#${d.n})\nigralcev ${d.played} · rešilo ${d.solved} · ni rešilo ${d.failed}\npovprečno poskusov ${fmt(d.mean)}${d.solved ? `\npo poskusih 1–6: ${d.dist.join(" · ")}` : ""}`;
  // 1) players per day: solved (gold) + not solved (muted) stacked, 2px gap, rounded top
  const H1 = 190, B1 = 26, ymax = Math.max(1, ...days.map((d) => d.played)), stepY = ymax > 12 ? 5 : ymax > 6 ? 2 : 1, top = Math.ceil(ymax / stepY) * stepY;
  const y1 = (v) => T + (1 - v / top) * (H1 - T - B1);
  let grid1 = ""; for (let v = 0; v <= top; v += stepY) grid1 += `<line class="pvc-grid" x1="${L}" x2="${W - R}" y1="${y1(v)}" y2="${y1(v)}"/><text class="pvc-tick" x="${L - 7}" y="${y1(v) + 4}" text-anchor="end">${v}</text>`;
  const bar = (x, yTop, yBot, w, cls) => { const h = yBot - yTop; if (h <= 0) return ""; const r = Math.min(4, h, w / 2);
    return `<path class="${cls}" d="M${x},${yBot}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yBot}Z"/>`; };
  const bars = days.map((d, i) => {
    const w = Math.min(26, bw * 0.55), x = cx(i) - w / 2, base = y1(0), ySolved = y1(d.solved), yAll = y1(d.played);
    const inner = bar(x, ySolved, base, w, "wda-solved") + (d.failed ? bar(x, yAll, ySolved - (d.solved ? 2 : 0), w, "wda-failed") : "")
      + (d.played ? `<text class="wda-val" x="${cx(i)}" y="${yAll - 5}" text-anchor="middle">${d.solved}</text>` : "");
    return col(i, H1, B1, dayTip(d), inner);
  }).join("");
  // 2) mean guesses of the solvers (1–6, fewer = easier), line broken on days nobody solved
  const H2 = 170, B2 = 26, y2 = (v) => T + (1 - (v - 1) / 5) * (H2 - T - B2);
  let grid2 = ""; for (let v = 1; v <= 6; v++) grid2 += `<line class="pvc-grid" x1="${L}" x2="${W - R}" y1="${y2(v)}" y2="${y2(v)}"/><text class="pvc-tick" x="${L - 7}" y="${y2(v) + 4}" text-anchor="end">${v}</text>`;
  const segs = []; let cur = [];
  days.forEach((d, i) => { if (d.mean != null) cur.push(`${cx(i)},${y2(d.mean)}`); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const line = segs.filter((sg) => sg.length > 1).map((sg) => `<path class="pvt-line" d="M${sg.join("L")}"/>`).join("");
  const dots = days.map((d, i) => col(i, H2, B2, dayTip(d), d.mean != null ? `<line class="pvt-cross" x1="${cx(i)}" x2="${cx(i)}" y1="${T}" y2="${H2 - B2}"/><circle class="pvt-dot" cx="${cx(i)}" cy="${y2(d.mean)}" r="4.5"/>` : "")).join("");
  const svg = (H, label, body) => `<div class="pvc-scroll"><svg class="pvc-svg wda-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${body}</svg></div>`;
  box.innerHTML = `<div class="wda-tiles">
      <div class="wda-tile"><span class="wda-tile-n">${last.solved}<small> / ${last.played}</small></span><span class="muted-text">rešilo danes (${esc(last.short)})</span></div>
      <div class="wda-tile"><span class="wda-tile-n">${players}</span><span class="muted-text">različnih igralcev</span></div>
      <div class="wda-tile"><span class="wda-tile-n">${allPlayed ? Math.round((allWon / allPlayed) * 100) : 0} %</span><span class="muted-text">iger rešenih</span></div>
      <div class="wda-tile"><span class="wda-tile-n">${fmt(allMean)}</span><span class="muted-text">povprečno poskusov</span></div>
    </div>
    <section class="pvc-block"><h4>Igralci po dnevih</h4>
      <p class="muted-text pvt-key"><span><span class="wda-key solved"></span> rešilo</span><span><span class="wda-key failed"></span> ni rešilo</span></p>
      ${svg(H1, `Igralci po dnevih: ${days.map((d) => `${d.short} rešilo ${d.solved} od ${d.played}`).join(", ")}`, grid1 + bars + xLabels(H1, B1))}</section>
    <section class="pvc-block"><h4>Povprečno število poskusov <span class="muted-text">· le rešene igre, višje = težja uganka</span></h4>
      ${svg(H2, `Povprečno število poskusov po dnevih: ${days.map((d) => `${d.short} ${fmt(d.mean)}`).join(", ")}`, grid2 + line + dots + xLabels(H2, B2))}</section>
    <details class="pvc-table"><summary>Tabela</summary><table><thead><tr><th>#</th><th>Dan</th><th>igralcev</th><th>rešilo</th><th>ni rešilo</th><th>povp. poskusov</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr></thead>
      <tbody>${days.map((d) => `<tr><td>${d.n}</td><td>${esc(wdFmtDate(d.date))}</td><td>${d.played}</td><td>${d.solved}</td><td>${d.failed}</td><td>${fmt(d.mean)}</td>${d.dist.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></details>
    <p class="muted-text pvc-note"><button type="button" class="link-btn" data-wda-reload>Osveži</button></p>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-wda-reload]")) renderWdAnalitika(true); });
async function renderPvCharts(force = false) {
  const boxSvod = $("#pvc-svod"), boxTeme = $("#pvc-teme");
  if (!boxSvod || !canSee("analitika")) return;
  if (!pvc.data || force) {
    if (pvc.loading) return;
    pvc.loading = true;
    try {
      if (pvData === undefined) { try { const r = await fetch("data/preverbe.json", { cache: "no-store" }); pvData = r.ok ? await r.json() : null; } catch { pvData = null; } }
      pvc.data = await scriptLoad("analitika", force); pvc.at = Date.now(); pvc.error = null;
    } catch (err) { pvc.error = err; }
    pvc.loading = false;
  }
  if (!pvc.data) {
    const e = pvc.error, k = e?.kind;
    const msg = { auth: "Prijava je potekla – osveži prijavo v meniju.", denied: "Grafe vidi le admin.", offline: "Ni internetne povezave.", network: "Strežnik ni dosegljiv (slaba povezava?).", timeout: "Strežnik se ni odzval.", config: "Strežnik ni nastavljen." }[k]
      || (/bad_date|invalid|unknown/i.test(e?.message || "") ? "Strežnik še ne pozna teh grafov (Apps Script ni posodobljen)." : `Grafov ni bilo mogoče naložiti (${e?.message || "napaka"}).`);
    boxSvod.innerHTML = boxTeme.innerHTML = `<p class="muted-text">${esc(msg)}</p><button type="button" class="btn ghost" data-pvc-reload>Poskusi znova</button>`;
    return;
  }
  const forms = pvc.data.forms || [];
  const dateOf = (f) => (pvData?.svodForms || []).find((x) => x.formId === f.id)?.date || f.title;
  const svod = forms.filter((f) => f.group === "svod" && f.responses).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const teme = forms.filter((f) => f.group === "teme" && f.responses).sort((a, b) => (parseInt(a.title, 10) || 99) - (parseInt(b.title, 10) || 99) || a.title.localeCompare(b.title));
  const temaName = (t) => t.replace(/^\d+\s*[_.-]?\s*/, "").replace(/^Preverba teme\s*/i, "");
  const svodDays = svod.map((f) => {
    const iso = dateOf(f), m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
    return { form: f, label: (pvData?.svodForms || []).find((x) => x.formId === f.id)?.title || f.title, short: m ? `${Number(m[2])}. ${Number(m[1])}.` : f.title };
  });
  const nResp = svod.reduce((a, f) => a + f.responses, 0);
  boxSvod.innerHTML = `${svod.length ? `<section class="pvc-block"><h4>Odgovori po dnevih <span class="muted-text">· ${svod.length} ${svod.length === 1 ? "dan" : svod.length === 2 ? "dneva" : svod.length < 5 ? "dnevi" : "dni"} · ${nResp} odgovorov</span></h4>${pvcTrend(svodDays)}</section>` : `<p class="muted-text">Še ni odgovorov.</p>`}`;
  boxTeme.innerHTML = `${teme.length ? `<section class="pvc-block"><h4>Ocena teme po temah <span class="muted-text">· ${teme.reduce((a, f) => a + f.responses, 0)} odgovorov</span></h4>${pvcChart({ title: "Ocene tem", questions: teme.map((f) => ({ title: temaName(f.title), values: (f.questions.find((q) => /ocen/i.test(q.title)) || f.questions[0] || { values: [] }).values })) }, { named: true })}</section>` : `<p class="muted-text">Še ni odgovorov.</p>`}`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-pvc-reload]")) renderPvCharts(true); });
// Hover / focus tooltip for candles
(() => {
  let tip;
  const show = (g, x, y) => {
    tip ||= Object.assign(document.createElement("div"), { className: "pvc-tip", role: "tooltip" });
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.textContent = g.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
  };
  const hide = () => { if (tip) tip.hidden = true; };
  document.addEventListener("pointermove", (e) => { const g = e.target.closest?.(".pvc-candle"); if (g) show(g, e.clientX, e.clientY); else hide(); });
  document.addEventListener("focusin", (e) => { const g = e.target.closest?.(".pvc-candle"); if (g) { const r = g.getBoundingClientRect(); show(g, r.left + r.width / 2, r.top); } });
  document.addEventListener("focusout", hide);
})();
/* —— Preverbe: Teme = today's tema feedback forms (embedded Google Forms), Generalno = 3 free-text forms → Apps Script → Preverbe/Vprašanja sheets —— */
let pvData;
/* Tabs per role: UU → Teme + Generalno, SVOD → Preverba SVODa, admin → all three (follows the admin "Pogled kot" switch) */
function pvTabsFor(role) { return role === "admin" ? ["teme", "generalno", "svod"] : role === "svod" ? ["svod"] : ["teme", "generalno"]; }
async function renderPreverbe(sub = null) {
  const teme = $("#pv-teme"), gen = $("#pv-generalno"), svod = $("#pv-svod");
  if (!teme) return;
  const tabs = pvTabsFor(effectiveRole(state.user?.email));
  if (!tabs.includes(sub)) sub = tabs[0];
  $$("#tab-preverbe .pv-tab").forEach((t) => { t.hidden = !tabs.includes(t.dataset.pvTab); t.setAttribute("aria-selected", String(t.dataset.pvTab === sub)); });
  teme.hidden = sub !== "teme"; gen.hidden = sub !== "generalno"; svod.hidden = sub !== "svod";
  if (pvData === undefined) {
    try { const r = await fetch("data/preverbe.json", { cache: "no-store" }); pvData = r.ok ? await r.json() : null; } catch { pvData = null; }
  }
  if (sub === "teme") renderPvTeme(teme); else if (sub === "generalno") renderPvGeneral(gen); else renderPvSvod(svod);
}
/* Preverba SVODa: today's day form open; earlier days collapsed below (for filling in late) */
function renderPvSvod(box) {
  const today = ljNow().date, forms = pvData?.svodForms || [];
  const cur = forms.find((f) => f.date === today), past = forms.filter((f) => f.date < today).reverse();
  const key = today + forms.map((f) => f.formId).join();
  if (box.dataset.key === key) return; // keep iframes (and half-filled answers)
  box.dataset.key = key;
  const card = (f, open) => `<details class="card pv-form" data-form-id="${esc(f.formId)}"${open ? " open" : ""}>
      <summary><span class="pv-form-title">${esc(f.title)}</span><span class="muted-text">${f.date === today ? "danes" : ""}</span></summary>
      <iframe src="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform?embedded=true" title="Preverba SVODa – ${esc(f.title)}" loading="lazy">Nalagam …</iframe>
      <p class="pv-open"><a href="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform" target="_blank" rel="noopener">Odpri obrazec v novem oknu ↗</a></p>
    </details>`;
  const next = forms.find((f) => f.date > today);
  box.innerHTML = (cur ? `<p class="muted-text pv-lede">Dnevna preverba SVODa za danes.</p>${card(cur, true)}`
      : `<div class="card pv-empty"><p>Za danes ni preverbe SVODa.</p>${next ? `<p class="muted-text">Naslednja: ${esc(next.title)}.</p>` : ""}</div>`)
    + (past.length ? `<h3 class="pv-sub-h">Prejšnji dnevi</h3>${past.map((f) => card(f, false)).join("")}` : "");
}
/* Only temas that started today and ended less than PV_GRACE minutes ago (per the timeline); checked every minute,
   forms are added/removed in place so open ones keep their answers */
const PV_GRACE = 120;
/* A form is tied to a tema (its timeline occurrences) or, for e.g. Izbirne teme, directly to timeline session ids */
function pvFormOccs(f) {
  if (f.tema) return state.data?.temas?.[f.tema]?.occurrences || [];
  const ids = [].concat(f.sessions || []);
  return (state.data?.days || []).flatMap((d) => d.sessions.filter((s) => ids.includes(s.id)).map((s) => ({ date: d.date, start: s.start, end: s.end })));
}
const pvFormName = (f) => state.data?.temas?.[f.tema]?.title || f.name || f.title.replace(/^Preverba teme\s*/i, "");
function renderPvTeme(box) {
  const now = ljNow(), today = now.date;
  const todays = (pvData?.temaForms || []).flatMap((f) => {
    const occs = pvFormOccs(f).filter((o) => o.date === today).sort((a, b) => a.start.localeCompare(b.start));
    if (!occs.length) return [];
    const end = occs.map((o) => o.end).sort().pop(); // last part of the tema today (pt.1 / pt.2)
    return [{ ...f, name: pvFormName(f), occ: { start: occs[0].start, end } }];
  }).sort((a, b) => a.occ.start.localeCompare(b.occ.start));
  const forms = todays.filter((f) => toMin(f.occ.start) <= now.min && now.min < toMin(f.occ.end) + PV_GRACE);
  if (!forms.length) {
    delete box.dataset.day;
    const later = todays.find((f) => toMin(f.occ.start) > now.min);
    if (!later && todays.length) {
      box.innerHTML = `<div class="card pv-empty"><p>Preverbe današnjih tem so zaprte.</p><p class="muted-text">Obrazec je na voljo od začetka teme do 2 uri po njenem koncu.</p></div>`;
      return;
    }
    const next = later ? null : (pvData?.temaForms || []).flatMap((f) => pvFormOccs(f).map((o) => o.date)).filter((d) => d > today).sort()[0];
    box.innerHTML = later
      ? `<div class="card pv-empty"><p>Preverbe tem bodo na voljo, ko se tema začne.</p><p class="muted-text">${later === todays[0] ? "Prva danes" : "Naslednja"}: ${esc(later.name)} ob ${esc(later.occ.start)}.</p></div>`
      : `<div class="card pv-empty"><p>Danes ni preverb tem.</p>${next ? `<p class="muted-text">Naslednje preverbe: ${Number(next.slice(8))}. ${Number(next.slice(5, 7))}.</p>` : ""}</div>`;
    return;
  }
  if (box.dataset.day !== today) {
    box.dataset.day = today;
    box.innerHTML = `<p class="muted-text pv-lede">Preverbe tem, ki so v teku ali so se končale v zadnjih 2 urah – izpolni po vsaki temi.</p><div class="pv-forms"></div>`;
  }
  const list = $(".pv-forms", box);
  $$("[data-form-id]", list).forEach((el) => { if (!forms.some((f) => f.formId === el.dataset.formId)) el.remove(); });
  forms.forEach((f) => {
    if ($(`[data-form-id="${f.formId}"]`, list)) return;
    list.insertAdjacentHTML("beforeend", `<details class="card pv-form" data-form-id="${esc(f.formId)}"${forms.length === 1 ? " open" : ""}>
      <summary><span class="pv-form-title">${esc(f.name)}</span><span class="muted-text">${esc(f.occ.start)}–${esc(f.occ.end)}</span></summary>
      <iframe src="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform?embedded=true" title="${esc(f.title)}" loading="lazy">Nalagam …</iframe>
      <p class="pv-open"><a href="https://docs.google.com/forms/d/${encodeURIComponent(f.formId)}/viewform" target="_blank" rel="noopener">Odpri obrazec v novem oknu ↗</a></p>
    </details>`);
  });
}
function renderPvGeneral(box) {
  if (box.dataset.ready) return;
  box.dataset.ready = "1";
  box.innerHTML = (pvData?.general || []).map((g) => `<form class="card pv-gen" data-pv-kind="${esc(g.key)}">
      <label for="pv-${esc(g.key)}"><strong>${esc(g.label)}</strong><span class="muted-text">${esc(g.hint)}</span></label>
      <textarea id="pv-${esc(g.key)}" name="text" rows="4" maxlength="5000" required></textarea>
      <div class="pv-gen-foot">
        <label class="pv-anon"><input type="checkbox" name="anon" /> Pošlji anonimno</label>
        <button type="submit" class="btn primary pv-send">Pošlji<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></button>
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
      <ul class="os-people">${g.members.map((m) => {
        const inner = `${avatarHtml(m, "avatar-os")}<div class="os-person-txt"><span class="os-name">${esc(m.name)}</span>${m.steg ? `<span class="os-steg muted-text">${esc(m.steg)}</span>` : ""}</div>`;
        return canSee("uu") ? `<li><a class="card os-person os-person-link" href="#uu/${uuSlug(m.name)}">${inner}<span class="os-more" aria-hidden="true">›</span></a></li>`
          : `<li class="card os-person">${inner}</li>`;
      }).join("")}</ul>`;
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
