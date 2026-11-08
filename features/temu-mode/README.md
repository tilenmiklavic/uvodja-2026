# 🎪 Temu Mode

A self-aware parody of Temu-style "engagement tricks" for the **Trgovina** page (`#trgovina`). It winks at the customer and is **purely cosmetic**:

- It never changes prices, discounts, stock, the cart or the checkout.
- It never adds items or pre-ticks anything, and never blocks navigation.
- It only adds its own elements, all with classes prefixed `tm-`, next to the shop.

The real price stays visible and unchanged. The only data it gets from the site is the read-only `trgovina:render` event (cart item count and total).

## Files

| File | What |
|---|---|
| `config.js` | `ENABLE_CHAOS_MODE` (forces it available, `false`), the customer default (`DEFAULT_ON: false`), timings. The normal on/off is the admin **Nadzor** page |
| `strings.js` | **All the copy** – edit jokes here (Slovene; the store has no translation layer) |
| `temu-mode.js` | All logic (ES module, loaded by `index.html`) |
| `temu-mode.css` | All styles (`.tm-*` only) |

## Enable / disable

1. **Admin:** on the **Nadzor** page (≡ → Nadzor, admins only), turn on **Temu Mode**. This is the `temu` switch in `apps-script/flags.gs`, stored on the server, and it applies to everyone within about a minute.
   - While it is off (the default), the module creates nothing: no toggle and nothing on any page.
   - `ENABLE_CHAOS_MODE: true` in `config.js` forces it available regardless of the switch, e.g. for testing.
2. **Every customer** then turns it on or off for themselves with the floating **🎪 Temu Mode** button (bottom left on Trgovina).
   - It starts **off** (`DEFAULT_ON: false`).
   - The choice is remembered in `localStorage` (`uvodja.temuMode`).

## What triggers what (only while Temu Mode is on)

| # | Feature | Trigger | Frequency cap |
|---|---|---|---|
| 1 | Rigged wheel (welcome modal) | ~1 s after opening Trgovina. It always lands on "100 % POPUSTA", then shows the fine print, confetti and "Prevzemi svoj nič 🎉" | once per session |
| 2 | Endless countdown | strip above the shop, 00:04:59 → at 0 it resets with a rotating "šalim se …" line | – |
| 3 | Scarcity badges | about 2 of 3 product cards (stable per product), tooltip on hover/focus | – |
| 4 | Fake live-purchase toasts | every `TOAST_EVERY_MS` (25 s) while on Trgovina | `TOAST_MAX_PER_SESSION` (5) |
| 5 | Impossible progress bar | in the cart drawer. Every cart change moves it 99.9 → 99.95 → … %, never 100. A click reveals the "gift" | – |
| 6 | Absurd crossed-out price | next to the real price on every card, with a "−99,99 %" badge and the "dice roll" note | – |
| 7 | Coupon bundle | banner above the shop; expands to 1,000 × 1-coin coupons with impossible terms | – |
| 8 | Daily coin check-in | floating 🪙 (top right). +1 fake "Skavtski kovanček" per day with a streak, goal 1,000,000. Stored in `localStorage` and **not** the real zlatniki | 1 per day |
| 9 | Referral parody | strip above the shop. "Deli" uses the native share sheet, or copies the link | – |
| 10 | Guilt-trip exit pop-up | desktop only: mouse leaves through the top of the window while on Trgovina. Skipped on touch devices | once per session |
| 11 | "Your cart misses you" | items in the cart and idle for `CART_MISSES_YOU_IDLE_MS` (47 s) on another page | once per session |

**Pop-ups**
- At most one modal at a time.
- Each modal closes with one click on ×, on the backdrop or on any of its buttons, or with **Esc**.
- Focus moves into the dialog and returns afterwards.

**Toasts** are in an `aria-live` region and each one has its own close button.

**Reduced motion:** with `prefers-reduced-motion: reduce`, the wheel jumps straight to the result, and there is no confetti and no coin wobble.

## Remove it completely

1. Delete the folder `features/temu-mode/`.
2. In `index.html`, delete the two lines marked `Temu Mode` (the stylesheet `<link>` and the `<script>`).
3. In `js/app.js`, delete the line `window.dispatchEvent(new CustomEvent("trgovina:render", …))` at the end of `drawTrgovina()`.
4. Optionally remove `temu` from the Nadzor list (`NZ_ITEMS`, `PAGE_FLAG_LABEL` in `js/app.js`) and from `SITE_FLAG_PAGES` in `apps-script/flags.gs`.
