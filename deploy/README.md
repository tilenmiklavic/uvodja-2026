# Migration: GitHub Pages → https://vodja.miklavic.si (netcup)

The site is plain static files, so the server only needs nginx + a TLS certificate. Everything dynamic (Wordle and other
results, Stavnica, Zadolžitve, Analitika, …) stays in Google Apps Script and is **not** touched by this migration.

| File | What it is |
|---|---|
| `server-setup.sh` | one-time server setup: nginx, Let's Encrypt, `deploy` user, release folders |
| `nginx-vodja.miklavic.si.conf`, `vodja-headers.conf` | the nginx site (HTTPS, gzip, cache rules, security headers) |
| `deploy.sh` | uploads a release with rsync and flips the `current` symlink (atomic, `--rollback` supported) |
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
vodja.miklavic.si.   AAAA   <IPv6 of the netcup server>     (only if the server has one and nginx listens on it)
```

Use a low TTL (300) until the cut-over is done. Check: `dig +short vodja.miklavic.si`.

## 2. Server (once)

Debian/Ubuntu with root access:

```bash
git clone https://github.com/tilenmiklavic/uvodja-2026.git && cd uvodja-2026
sudo bash deploy/server-setup.sh
```

This installs nginx + certbot, creates the `deploy` user and `/var/www/vodja.miklavic.si/releases`, gets the
certificate (needs the DNS record from step 1), installs the nginx site and enables automatic renewal.
If the server already runs other sites, review `deploy/nginx-vodja.miklavic.si.conf` first – it only adds one `server`
block and one snippet.

Create a deploy key on your laptop and authorize it:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/vodja_deploy -C "vodja deploy" -N ""
ssh-copy-id -i ~/.ssh/vodja_deploy.pub deploy@<server>      # or paste it into /home/deploy/.ssh/authorized_keys
```

## 3. First deploy (by hand)

```bash
DEPLOY_HOST=<server> bash deploy/deploy.sh
curl -I https://vodja.miklavic.si/            # 200, Strict-Transport-Security present
```

Open the site, sign in, click through Časovnica / Zabava / Preverbe. Roll back with
`DEPLOY_HOST=<server> bash deploy/deploy.sh --rollback`.

## 4. GitHub Actions (automatic deploys)

Repo → Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/vodja_deploy` (the **private** key) |
| `DEPLOY_HOST` | server name or IP |
| `DEPLOY_KNOWN_HOSTS` | *(recommended)* output of `ssh-keyscan -t ed25519 <server>` |

From then on every push to `main` that touches the site deploys it (docs-only / Apps Script / `deploy/` changes are
skipped). *Actions → Deploy to netcup → Run workflow* deploys manually.

## 5. Cut-over

1. Everything above works on `https://vodja.miklavic.si`.
2. Tell people the new address (and that they must sign in again / re-install the app).
3. Repo → Settings → Pages → set *Source* to **None** (or delete the branch deployment). The old
   `…github.io/uvodja-2026/` URL then stops working – if you want a redirect, put a single `index.html` with
   `<meta http-equiv="refresh" content="0; url=https://vodja.miklavic.si/">` on a `gh-pages` branch instead.
4. The `.nojekyll` file is no longer needed; it is harmless and was left in place.

## Operating notes

- **Releases:** `releases/<UTC timestamp>`, the last 5 are kept, `current` points at the live one.
- **Caching:** HTML, `sw.js`, `manifest.webmanifest` and `data/*.json` are always revalidated; CSS/JS for a day (they are
  versioned with `?v=` in `index.html`, bump it when you change them), images for 30 days. This replaces GitHub Pages'
  blanket 10 minutes.
- **Not uploaded** (stay in git only): `apps-script/`, `push-worker/`, `scripts/`, `deploy/`, `.github/`.
  `data/access.json` and the rest of `data/` are still public, exactly as before.
- **Updating data/access.json etc.:** commit to `main`; the Action deploys it within a minute.
- **Cert renewal:** `certbot.timer` renews automatically; `sudo certbot renew --dry-run` tests it.

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
- Optional: give it its own address by adding `demo.vodja.miklavic.si` to DNS, `server_name` and the certificate – any
  host starting with `demo.` is always in demo mode, no query needed.
- The Rutke scarf images and the real timeline/teme/ekipa content come from the repo and Google Drive, not from the mock.
