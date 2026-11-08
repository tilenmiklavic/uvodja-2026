/* Temu Mode – a self-aware parody of "engagement tricks" on the Trgovina page. Purely cosmetic: it never touches prices,
   the cart or the checkout. See README.md in this folder. */
export const TEMU_CONFIG = {
  /* Master switch. false = the feature does not exist (no toggle, no CSS hooks used, nothing on the page). */
  ENABLE_CHAOS_MODE: false,
  /* When the master switch is on: is Temu Mode on for a customer who never touched the 🎪 toggle? */
  DEFAULT_ON: true,
  TOAST_EVERY_MS: 25000, // fake "live purchase" toasts …
  TOAST_MAX_PER_SESSION: 5, // … at most this many per session
  TOAST_VISIBLE_MS: 6500,
  COUNTDOWN_S: 299, // 00:04:59
  CART_MISSES_YOU_IDLE_MS: 47000, // idle on another page with items in the cart
  WHEEL_DELAY_MS: 900, // welcome wheel after opening the shop
  COIN_GOAL: 1000000,
};
