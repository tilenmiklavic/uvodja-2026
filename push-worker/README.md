# Push Worker (Cloudflare)

Sends admin push notifications for the site. Apps Script can't do the Web Push cryptography, so
`apps-script/push.gs` hands each notification to this Worker. The Worker keeps no data.

## Setup (one time, ~10 min)

1. **Cloudflare:** sign up at dash.cloudflare.com (free), then go to Workers & Pages → Create → Create Worker. Name it e.g. `uvodja-push` and click Deploy.
   Then Edit code: replace everything with `worker.js` from this folder and click Deploy.
2. **Secret:** go to the Worker's Settings → Variables and Secrets → Add. Choose type **Secret**, name `PUSH_SECRET`, and as the value use a long random string (e.g. 40+ characters from a password generator).
3. **Apps Script** (results sheet → Extensions → Apps Script):
   - Add the new file `push.gs` and update `wordle.gs` and `stavnica.gs` from the repo. Also add `bumbar.gs` if it isn't there yet.
   - Go to Project Settings → Script properties and add:
     - `PUSH_WORKER_URL` = the Worker's address, e.g. `https://uvodja-push.<account>.workers.dev`
     - `PUSH_SECRET` = the same string as in Cloudflare
     - optional: `PUSH_EVENTS` = `wordle,stavnica` (which events notify; this is the default)
   - In the editor, select `pushSetup` and click ▶ Run. Allow access when asked. It creates the VAPID keys.
   - Go to Deploy → Manage deployments → edit → **New version**.
4. **On the site,** signed in as admin: open the account menu and choose **🔔 Vklopi obvestila**. A test notification should arrive.
   On iPhone/iPad, first add the site to the home screen, open it from there, then turn notifications on.

Useful functions in the Apps Script editor: `pushTest` (test notification to all devices) and `pushList` (subscribed devices).
