/* Temu Mode – a self-aware parody of Temu-style "engagement tricks" on the Trgovina page (#trgovina).
   PURELY COSMETIC: it only adds its own elements (class prefix tm-) next to the shop. It never changes prices, the cart,
   stock, the checkout or navigation, and it never reads anything back into the store. The only input it gets from the
   site is the "trgovina:render" event (cart item count + total) sent at the end of drawTrgovina() in js/app.js.
   Availability: the admin switch "temu" on the Nadzor page (apps-script/flags.gs, sent by app.js as the "uvodja:flags"
   event and cached in localStorage "uvodja.pageFlags") or TEMU_CONFIG.ENABLE_CHAOS_MODE. Then every customer turns it on
   or off for themselves with the 🎪 toggle. Nothing is created until it is available. See README.md. */
import { TEMU_CONFIG as C } from "./config.js";
import { S } from "./strings.js";

const serverFlag = () => { try { return JSON.parse(localStorage.getItem("uvodja.pageFlags"))?.temu === true; } catch { return false; } };
let available = C.ENABLE_CHAOS_MODE === true || serverFlag();
let api = null; // set by start(): { render, closeModal }
window.addEventListener("uvodja:flags", (e) => {
  available = C.ENABLE_CHAOS_MODE === true || e.detail?.temu === true;
  if (available && !api) api = start();
  else if (api) { if (!available) api.closeModal(); api.render(); }
});
if (available) api = start();

function start() {
  /* —— small helpers —— */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : `{${k}}`));
  const local = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const memo = {}; // sessionStorage fallback (private mode etc.)
  const session = {
    get(k, d = null) { try { const v = sessionStorage.getItem(`uvodja.temu.${k}`); return v === null ? d : JSON.parse(v); } catch { return k in memo ? memo[k] : d; } },
    set(k, v) { memo[k] = v; try { sessionStorage.setItem(`uvodja.temu.${k}`, JSON.stringify(v)); } catch {} },
  };
  const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const nf = (n) => Number(n).toLocaleString("sl-SI");
  const today = () => new Date().toLocaleDateString("en-CA");

  /* —— state —— */
  const ON_KEY = "uvodja.temuMode";
  let on = local.get(ON_KEY, C.DEFAULT_ON) === true; // the customer's own choice
  const act = () => available && on; // Temu Mode is running for this customer
  let cart = { count: 0, total: 0 }, lastCartSig = null;
  let lastActive = Date.now();
  const onShop = () => { const t = document.getElementById("tab-trgovina"); return !!t && !t.hidden; };

  /* —— fixed UI: toggle, coin button, toast stack (live region) —— */
  const root = document.createElement("div");
  root.id = "tm-root";
  root.innerHTML = `<button type="button" class="tm-toggle" aria-pressed="false" aria-label="${esc(S.toggle.label)}"></button>
    <button type="button" class="tm-coin" aria-label="${esc(S.coin.label)}" title="${esc(S.coin.label)}" hidden>🪙</button>
    <div class="tm-toasts" role="status" aria-live="polite"></div>`;
  document.body.append(root);
  const toggleBtn = $(".tm-toggle", root), coinBtn = $(".tm-coin", root), toastBox = $(".tm-toasts", root);

  /* —— one modal at a time; Esc / backdrop / buttons close it; focus returns —— */
  let modal = null;
  function openModal(html, labelId, onClose) {
    if (modal) return null;
    const back = document.createElement("div");
    back.className = "tm-backdrop";
    back.innerHTML = `<div class="tm-modal" role="dialog" aria-modal="true" aria-labelledby="${labelId}">
      <button type="button" class="tm-x" data-tm-close aria-label="${esc(S.wheel.close)}">×</button>${html}</div>`;
    const prev = document.activeElement;
    modal = { el: back, close() { back.remove(); modal = null; onClose?.(); prev?.focus?.(); } };
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-tm-close]")) modal?.close(); });
    document.body.append(back);
    ($(".tm-modal [data-tm-focus]", back) || $(".tm-x", back)).focus();
    return back;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal) { e.preventDefault(); modal.close(); return; }
    if (e.key === "Tab" && modal) { // keep focus inside the dialog
      const f = $$("button, a[href], [tabindex]:not([tabindex='-1'])", modal.el).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* —— toasts —— */
  function toast(text, cls = "") {
    const t = document.createElement("div");
    t.className = `tm-toast ${cls}`;
    t.innerHTML = `<span>${text}</span><button type="button" class="tm-toast-x" aria-label="${esc(S.toasts.close)}">×</button>`;
    $(".tm-toast-x", t).addEventListener("click", () => t.remove());
    toastBox.append(t);
    setTimeout(() => t.remove(), C.TOAST_VISIBLE_MS);
  }

  /* —— 1. Rigged spin-the-wheel (welcome, once per session) —— */
  function wheelSvg() {
    const seg = S.wheel.segments, n = seg.length, a = 360 / n, R = 120, c = 130;
    const colors = ["#d4240b", "#f9a61a", "#1b4d3e", "#3c3f8e", "#e17a60", "#7a9a3e"];
    const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [c + r * Math.cos(t), c + r * Math.sin(t)]; };
    const parts = seg.map((label, i) => {
      const [x1, y1] = pt(i * a - a / 2, R), [x2, y2] = pt(i * a + a / 2, R), [tx, ty] = pt(i * a, R * 0.62);
      return `<path d="M${c} ${c}L${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="2"/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${i * a + 90} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="800">${esc(label)}</text>`;
    }).join("");
    return `<svg class="tm-wheel" viewBox="0 0 260 260" aria-hidden="true"><g class="tm-rotor">${parts}<circle cx="${c}" cy="${c}" r="16" fill="#fff" stroke="#3a0613" stroke-width="3"/></g>
      <path d="M${c} 4l11 20h-22z" fill="#fff" stroke="#3a0613" stroke-width="2"/></svg>`;
  }
  function showWheel() {
    if (session.get("wheel") || !act() || !onShop() || modal) return;
    session.set("wheel", true);
    const m = openModal(`<h2 id="tm-wheel-h">${esc(S.wheel.title)}</h2><p class="tm-sub">${esc(S.wheel.intro)}</p>${wheelSvg()}
      <p class="tm-won" hidden></p><p class="tm-fine" hidden></p>
      <div class="tm-actions"><button type="button" class="tm-btn" data-tm-spin data-tm-focus>${esc(S.wheel.spin)}</button>
      <button type="button" class="tm-btn" data-tm-close hidden>${esc(S.wheel.claim)}</button></div>`, "tm-wheel-h");
    if (!m) return;
    $("[data-tm-spin]", m).addEventListener("click", (e) => {
      const spinBtn = e.currentTarget;
      spinBtn.disabled = true;
      const rotor = $(".tm-rotor", m), end = 360 * 6 + (Math.random() - 0.5) * 8; // segment 0 (100 % POPUSTA) is at the top
      const done = () => {
        if (!m.isConnected) return;
        $(".tm-won", m).textContent = S.wheel.won; $(".tm-won", m).hidden = false;
        $(".tm-fine", m).textContent = S.wheel.fine; $(".tm-fine", m).hidden = false;
        spinBtn.hidden = true;
        const claim = $(".tm-actions [data-tm-close]", m); claim.hidden = false; claim.focus();
        if (!reduced()) confetti();
      };
      if (reduced()) { rotor.style.transform = "rotate(0deg)"; done(); return; }
      rotor.style.transition = "transform 4.2s cubic-bezier(.12,.75,.18,1)";
      requestAnimationFrame(() => { rotor.style.transform = `rotate(${end}deg)`; });
      setTimeout(done, 4300);
    });
  }
  function confetti() {
    const box = document.createElement("div");
    box.className = "tm-confetti"; box.setAttribute("aria-hidden", "true");
    const colors = ["#d4240b", "#f9a61a", "#7a9a3e", "#3c3f8e", "#e17a60", "#f1eb76"];
    box.innerHTML = Array.from({ length: 70 }, () => `<i style="left:${Math.random() * 100}%;background:${pick(colors)};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)"></i>`).join("");
    document.body.append(box);
    setTimeout(() => box.remove(), 3600);
  }

  /* —— 2. + 7. + 9. extras strip above the shop: endless countdown, coupon bundle, referral —— */
  let left = C.COUNTDOWN_S, resetN = 0;
  function extras() {
    let box = $("#tm-extras");
    if (!box) {
      const host = $("#tab-trgovina .trgovina"), body = $("#tg-body");
      if (!host || !body) return;
      box = document.createElement("div");
      box.id = "tm-extras";
      box.innerHTML = `<div class="tm-count" role="timer" aria-live="off"><span>${esc(S.countdown.label)}</span> <strong class="tm-clock"></strong><small class="tm-reset" aria-live="polite"></small></div>
        <div class="tm-coupons"><button type="button" class="tm-coupon-btn" aria-expanded="false" aria-controls="tm-coupon-list"><span>${esc(S.coupons.banner)}</span><span class="tm-coupon-act">${esc(S.coupons.open)}</span></button>
          <div id="tm-coupon-list" hidden><p>${esc(S.coupons.terms)}</p><div class="tm-coupon-grid"></div></div></div>
        <div class="tm-ref"><p><strong>${esc(S.referral.text)}</strong> ${esc(S.referral.count)} <span>${esc(S.referral.hug)}</span></p><button type="button" class="tm-btn tm-btn-sm" data-tm-share>${esc(S.referral.share)}</button></div>`;
      host.insertBefore(box, body);
      $(".tm-coupon-btn", box).addEventListener("click", (e) => {
        const b = e.currentTarget, list = $("#tm-coupon-list", box), open = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", String(open)); list.hidden = !open;
        $(".tm-coupon-act", b).textContent = open ? S.coupons.hide : S.coupons.open;
        const grid = $(".tm-coupon-grid", list);
        if (open && !grid.childElementCount) grid.innerHTML = Array.from({ length: 1000 }, (_, i) => `<span title="#${i + 1}">${esc(S.coupons.coupon)}</span>`).join("");
      });
      $("[data-tm-share]", box).addEventListener("click", async () => {
        const url = `${location.origin}${location.pathname}#trgovina`;
        try {
          if (navigator.share) { await navigator.share({ title: S.referral.shareTitle, text: S.referral.shareText, url }); return; }
          await navigator.clipboard.writeText(`${S.referral.shareText} ${url}`);
          toast(esc(S.referral.copied));
        } catch {}
      });
    }
    tickClock();
  }
  function tickClock() {
    const el = $("#tm-extras .tm-clock");
    if (!el) return;
    const s = Math.max(0, left);
    el.textContent = `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  /* —— 3. + 6. product cards: silly scarcity badges and an absurd crossed-out "original" price next to the REAL one —— */
  function decorateCards() {
    $$("#tg-body .tg-item").forEach((card) => {
      if (card.querySelector(".tm-deco")) return;
      const name = $(".tg-name", card)?.textContent || "", h = hash(name);
      const mark = document.createElement("span"); mark.className = "tm-deco"; mark.hidden = true; card.append(mark);
      if (h % 3 !== 2) { // ~2 of 3 cards get a badge
        const b = S.badges[h % S.badges.length];
        const badge = document.createElement("span");
        badge.className = "tm-badge"; badge.tabIndex = 0; badge.dataset.tip = b.tip; badge.title = b.tip;
        badge.textContent = b.text;
        card.prepend(badge);
      }
      const price = $(".tg-price", card);
      if (price) {
        const fake = document.createElement("span");
        fake.className = "tm-fake";
        const was = 1000000 + (h % 9000000);
        fake.innerHTML = `<s aria-label="izmišljena »originalna« cena ${nf(was)}">${nf(was)}</s> <b>${esc(S.fakePrice.badge)}</b><small>${esc(S.fakePrice.note)}</small>`;
        price.after(fake);
      }
    });
  }

  /* —— 5. impossible progress bar in the cart drawer —— */
  function decorateCart() {
    const drawer = $("#tg-body .tg-cart");
    if (!drawer || drawer.querySelector(".tm-progress")) return;
    const step = Math.min(session.get("progress", 0), S.progress.steps.length - 1), revealed = session.get("gift", false);
    const pct = S.progress.steps[step];
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "tm-progress"; btn.setAttribute("aria-expanded", String(revealed));
    btn.innerHTML = `<span class="tm-progress-t">${esc(S.progress.text)} <strong>${pct} %</strong></span>
      <span class="tm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.replace(",", ".")}"><i style="width:${pct.replace(",", ".")}%"></i></span>
      <span class="tm-progress-r"${revealed ? "" : " hidden"}>${esc(S.progress.reveal)}</span>`;
    btn.addEventListener("click", () => { session.set("gift", true); btn.setAttribute("aria-expanded", "true"); $(".tm-progress-r", btn).hidden = false; });
    drawer.prepend(btn);
  }

  /* —— 4. obviously fake "live purchase" toasts (shop only, max per session) —— */
  let nextToast = Date.now() + C.TOAST_EVERY_MS;
  function liveToast() {
    const shown = session.get("toasts", 0);
    if (shown >= C.TOAST_MAX_PER_SESSION) return;
    session.set("toasts", shown + 1);
    const T = S.toasts, did = pick(T.did);
    const item = did.includes("{n}") ? pick(T.items) : pick(T.singular);
    toast(`<strong>${esc(pick(T.who))}</strong> ${esc(fill(did, { n: nf(2 + Math.floor(Math.random() * 998)), item }))}`, "tm-live");
  }

  /* —— 8. daily coin check-in (fake coins in localStorage, NOT zlatniki) —— */
  coinBtn.addEventListener("click", () => {
    const d = local.get("uvodja.temu.coins", { total: 0, streak: 0, last: "" }), t = today();
    if (d.last === t) { toast(esc(S.coin.already)); return; }
    const y = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
    d.streak = d.last === y ? d.streak + 1 : 1; d.total += 1; d.last = t;
    local.set("uvodja.temu.coins", d);
    const days = d.streak === 1 ? "dan" : d.streak === 2 ? "dneva" : d.streak < 5 ? "dnevi" : "dni";
    toast(`<strong>${esc(S.coin.plus)}</strong> ${esc(fill(S.coin.streak, { n: d.streak, days }))} · ${esc(fill(S.coin.total, { n: nf(d.total), goal: nf(C.COIN_GOAL) }))} ${esc(fill(S.coin.togo, { n: nf(C.COIN_GOAL - d.total) }))}<br><small>${esc(S.coin.note)}</small>`, "tm-coin-toast");
    if (!reduced()) { coinBtn.classList.remove("is-pop"); void coinBtn.offsetWidth; coinBtn.classList.add("is-pop"); }
  });

  /* —— 10. guilt-trip exit pop-up (desktop exit intent, once per session; on mobile skipped) —— */
  document.addEventListener("mouseout", (e) => {
    if (!act() || !onShop() || modal || session.get("exit") || e.relatedTarget || e.clientY > 0) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    session.set("exit", true);
    openModal(`<h2 id="tm-exit-h">${esc(S.exit.title)}</h2><p>${esc(S.exit.text)}</p>
      <div class="tm-actions tm-actions-col"><button type="button" class="tm-btn" data-tm-close data-tm-focus>${esc(S.exit.stay)}</button>
      <button type="button" class="tm-link" data-tm-close>${esc(S.exit.leave)}</button></div>`, "tm-exit-h");
  });

  /* —— 11. "your cart misses you" (items in the cart, idle on another page, once per session) —— */
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  function cartMissesYou() {
    if (!act() || onShop() || cart.count < 1 || session.get("missed") || document.hidden) return;
    const idle = Date.now() - lastActive;
    if (idle < C.CART_MISSES_YOU_IDLE_MS) return;
    session.set("missed", true);
    const n = Math.round(idle / 1000), m = n % 100;
    toast(esc(fill(S.cartMissesYou, { n, sec: m === 1 ? "sekunda" : m === 2 ? "sekundi" : m === 3 || m === 4 ? "sekunde" : "sekund" })), "tm-miss");
  }

  /* —— wiring —— */
  function render() {
    toggleBtn.hidden = !available || !onShop();
    toggleBtn.setAttribute("aria-pressed", String(on));
    toggleBtn.textContent = on ? S.toggle.on : S.toggle.off;
    coinBtn.hidden = !act() || !onShop();
    document.documentElement.classList.toggle("tm-on", act());
    root.classList.toggle("tm-has-cart", cart.count > 0);
    root.classList.toggle("tm-drawer", !!$("#tg-body .tg-cart"));
    if (!act()) { // remove every trace from the shop; the store is back to normal
      $$(".tm-badge, .tm-fake, .tm-deco, .tm-progress, #tm-extras").forEach((el) => el.remove());
      $$(".tm-toast").forEach((el) => el.remove());
      return;
    }
    if (!onShop()) return;
    extras(); decorateCards(); decorateCart();
    if (!session.get("wheel")) setTimeout(showWheel, C.WHEEL_DELAY_MS);
  }
  toggleBtn.addEventListener("click", () => { on = !on; local.set(ON_KEY, on); if (!on) modal?.close(); render(); });
  window.addEventListener("trgovina:render", (e) => {
    const d = e.detail || {}, sig = `${d.count}|${d.total}`;
    if (lastCartSig !== null && sig !== lastCartSig && d.count > 0) session.set("progress", session.get("progress", 0) + 1); // every cart change: a bit closer (never 100 %)
    lastCartSig = sig; cart = { count: d.count || 0, total: d.total || 0 };
    render();
  });
  window.addEventListener("hashchange", () => setTimeout(render, 0));
  setInterval(() => {
    if (!act()) return;
    if (onShop() && !document.hidden) {
      left -= 1;
      if (left < 0) { // "deal over" → instantly extended
        left = C.COUNTDOWN_S;
        const r = $("#tm-extras .tm-reset");
        if (r) r.textContent = S.countdown.resets[resetN++ % S.countdown.resets.length];
      }
      tickClock();
      if (Date.now() >= nextToast) { nextToast = Date.now() + C.TOAST_EVERY_MS; liveToast(); }
    }
    cartMissesYou();
  }, 1000);
  render();
  return { render, closeModal: () => modal?.close() };
}
