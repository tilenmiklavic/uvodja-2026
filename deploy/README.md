# Migration: GitHub Pages → https://vodja.miklavic.si (netcup)

The site is plain static files. On the netcup server it runs like every other app there (KlinDom too): its own
deploy user `vodja` and folder `/opt/vodja`, a small web container on the shared `proxy` network, and a route in the
shared HTTPS proxy, which gets the certificate. The convention is described under "The server" in
[`docs/deploy-netcup.md`](https://github.com/tilenmiklavic/klin-dom/blob/main/docs/deploy-netcup.md) of the
klin-dom repo, whose `deploy/netcup/setup-server.sh` sets the server up.
Everything dynamic (Wordle and other results, Stavnica, Zadolžitve, Analitika, …) stays in Google Apps Script and is
**not** touched by this migration.

| File | What it is |
|---|---|
| `compose.yml` | the `web` container (Caddy) serving `/opt/vodja/current` as `vodja-web:80`, and the `api` container (`../api/`, built on the server) as `vodja-api:3000`, both on the `proxy` network |
| `Caddyfile` | its config: cache rules, security headers, gzip (plain HTTP; the proxy does HTTPS) |
| `site.caddy` | the route in the shared proxy: `/api/*` → `vodja-api:3000`, everything else → `vodja-web:80` |
| `deploy.sh` | uploads a release with rsync, flips the `current` symlink (atomic, `--rollback` supported), installs the route |
| `../.github/workflows/deploy.yml` | runs `deploy.sh` on every push to `main` |
| `../js/demo.js` | demo mode with mock data → see [Demo](#demo) |

## 0. Things that break if forgotten

1. **Google sign-in** only works on origins registered for the OAuth client. Add `https://vodja.miklavic.si` to
   *Authorized JavaScript origins* of client `431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818` (Google Cloud Console →
   APIs & Services → Credentials). Keep the github.io origin until the cut-over is done so rollback stays possible.
2. **Everybody has to sign in once more** and re-enable push notifications: `localStorage`, the service worker and push
   subscriptions belong to the origin, and the origin changes. The installed home-screen app has to be installed again.
3. Apps Script needs no change: the site calls it with `text/plain` POSTs and reads it with GET, no origin whitelist.
   The Cloudflare push worker has none either.
4. The UU contact lookup (Google Sheets API, same OAuth client) uses the same JavaScript origin as in 1.

## 1. DNS

At whoever hosts `miklavic.si` DNS, add (replace with the netcup server's addresses):

```
vodja.miklavic.si.   A      <IPv4 of the netcup server>
vodja.miklavic.si.   AAAA   <IPv6 of the netcup server>     (the server has IPv6: 2a03:4000:15:1b34:68ba:ceff:fe89:22d5)
```

Use a low TTL (300) until the cut-over is done. Check: `dig +short vodja.miklavic.si`.

## 2. Server (once)

As root, from your laptop (needs SSH access as root; the script refuses to run without a root key):

```bash
curl -fsSL https://raw.githubusercontent.com/tilenmiklavic/klin-dom/main/deploy/netcup/setup-server.sh \
  | ssh root@vodja.miklavic.si 'bash -s -- vodja'
```

It creates the deploy user `vodja` (SSH keys only, root's keys copied in, docker group) and `/opt/vodja`, and leaves
the other apps and the shared proxy as they are. Safe to run again.

Optional, in `~/.ssh/config` on your laptop:

```
Host vodja
  HostName vodja.miklavic.si
  User vodja
  IdentityFile ~/.ssh/<your key>
```

## 3. First deploy (by hand)

```bash
DEPLOY_HOST=vodja@vodja.miklavic.si bash deploy/deploy.sh
curl -I https://vodja.miklavic.si/            # 200, Strict-Transport-Security present
```

Open the site, sign in, click through Časovnica / Zabava / Preverbe. Roll back with
`DEPLOY_HOST=vodja@vodja.miklavic.si bash deploy/deploy.sh --rollback`.

## 4. GitHub Actions (automatic deploys)

Make a key just for this repo's deploys and authorize it for `vodja` on the server:

```bash
ssh-keygen -t ed25519 -f ~/vodja-ci -C "github-actions vodja" -N ""
cat ~/vodja-ci.pub | ssh vodja@vodja.miklavic.si 'cat >> ~/.ssh/authorized_keys'
ssh-keyscan vodja.miklavic.si          # for NETCUP_KNOWN_HOSTS
```

Repo → Settings → Secrets and variables → Actions (the same names as in the klin-dom repo):

| Kind | Name | Value |
|---|---|---|
| Variable | `NETCUP_HOST` | `vodja.miklavic.si` (or the server IP) |
| Secret | `NETCUP_SSH_KEY` | contents of `~/vodja-ci` (the **private** key) |
| Secret | `NETCUP_KNOWN_HOSTS` | the output of `ssh-keyscan` above |

Then delete `~/vodja-ci*` from the laptop. The workflow does nothing until `NETCUP_HOST` is set. From then on every
push to `main` that touches the site deploys it (Apps Script / push worker / docs-only changes are skipped), and
each run shows up under Code → Deployments as `netcup`. *Actions → Deploy to netcup → Run workflow* deploys by hand.

## 5. Cut-over

1. Everything above works on `https://vodja.miklavic.si`.
2. Tell people the new address (and that they must sign in again / re-install the app).
3. Repo → Settings → Pages → set *Source* to **None** (or delete the branch deployment). The old
   `…github.io/uvodja-2026/` URL then stops working – if you want a redirect, put a single `index.html` with
   `<meta http-equiv="refresh" content="0; url=https://vodja.miklavic.si/">` on a `gh-pages` branch instead.
4. The `.nojekyll` file is no longer needed; it is harmless and was left in place.

## Operating notes

- **Releases:** `/opt/vodja/releases/<UTC timestamp>`, the last 5 are kept, `current` points at the live one.
- **Caching:** HTML, `sw.js`, `manifest.webmanifest` and `data/*.json` are always revalidated; CSS/JS for a day (they are
  versioned with `?v=` in `index.html`, bump it when you change them), images for 30 days. This replaces GitHub Pages'
  blanket 10 minutes.
- **Not uploaded** (stay in git only): `apps-script/`, `push-worker/`, `scripts/`, `deploy/` (except `compose.yml` and
  `Caddyfile`, which go next to the releases), `.github/`. `data/access.json` and the rest of `data/` are still public,
  exactly as before.
- **Updating data/access.json etc.:** commit to `main`; the Action deploys it within a minute.
- **Certificate:** the shared proxy gets and renews it; its logs: `cd /opt/proxy && docker compose logs --tail=100`.
- **Logs of the site's container:** `ssh vodja@vodja.miklavic.si 'cd /opt/vodja && docker compose logs --tail=100'`.

## Demo

`https://vodja.miklavic.si/?demo` opens the site as a fake admin with generated data, so it can be shown at any time –
including now that the real event is over. It is entirely in the browser (`js/demo.js`); nothing is sent to Google or
to the real Apps Script, and the real site's login/storage is not touched. See the header of `js/demo.js` for details.

- The clock is pinned to Saturday 7. 11. 2026, 10:15 so the timeline has a "now" line and Wordle/Papiga have a puzzle for
  "today". Another moment: `?demo=2026-10-24T14:00`.
- Players, scores, bets, chores, Analitika and visit statistics are made up (fictional names). Picks, bets, purchases
  and Wordle results work but live in memory (a reload resets them). The account menu's *Pogled kot* switch shows the
  SVOD / UU views.
- Turn it off with `?demo=0` (or the *Zapri demo* link in the yellow bar). The mode is remembered per browser tab.
- Optional: give it its own address by adding `demo.vodja.miklavic.si` to DNS and to the first line of `deploy/site.caddy` (`vodja.miklavic.si, demo.vodja.miklavic.si {`); the proxy gets the certificate itself – any
  host starting with `demo.` is always in demo mode, no query needed.
- The Rutke scarf images and the real timeline/teme/ekipa content come from the repo and Google Drive, not from the mock.

## Page visibility per address (Nadzor + `api/`)

Admins decide in **Nadzor → Vidnost strani po naslovu** which page is visible on which address
(`vodja.miklavic.si`, `tilenmiklavic.github.io/uvodja-2026`). Per page and address: **Privzeto** (as coded, incl. the
"event is over" lockdown), **Vidno** (visible to the roles allowed to see it, even after the event) or **Skrito**
(hidden from everyone but admins). Admins always see every page and Nadzor itself; *Pogled kot* in the account menu
shows what SVOD / UU see.

- The settings live in the `api` container (`/data/config.json` in the `apidata` volume), **not** in Apps Script.
  The github.io copy reads them from `https://vodja.miklavic.si/api/site-config` (CORS is allowed for that origin), so
  both addresses are controlled from the same panel. Clients re-check every minute and keep a copy on the device, so
  if the API is down the site behaves as it did last time (or as before this feature on a first visit).
- Who is admin: role `admin` in `data/access.json` of the live release, plus optional `ADMIN_EMAILS=a@x.si,b@x.si` in
  `/opt/vodja/.env` on the server. The API checks the user's Google sign-in token itself (audience = the site's OAuth
  client), so it cannot be used without signing in as an admin. If the sign-in has expired, use *Osveži prijavo* in the
  account menu and try again.
- The Apps Script on/off switches (Zadolžitve, Trgovina, Temu Mode) are still there below the matrix; for Zadolžitve and
  Trgovina an explicit Vidno/Skrito for an address beats the switch.
- Deploys: `deploy.sh` uploads `api/` and runs `docker compose up -d --build --wait`. API tests: `node --test api/test.js`.
- Limits: the matrix controls pages, not the individual Zabava games (after the event only Wordle stays); the lists of
  addresses and pages are constants in `api/server.js` (`SITES`, `PAGES`).
