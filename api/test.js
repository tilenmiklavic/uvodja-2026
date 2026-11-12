/* node --test api/ – starts the API against a fake Google tokeninfo endpoint */
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const CLIENT = "431900595687-0t02avmv6enmgrr0dv29p1f3gkppa818.apps.googleusercontent.com";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vodja-api-"));
fs.writeFileSync(path.join(tmp, "access.json"), JSON.stringify({ users: { "Boss@Example.com": "admin", "svod@example.com": "svod" } }));
const tokens = {
  boss: { aud: CLIENT, email: "boss@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) },
  svod: { aud: CLIENT, email: "svod@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) },
  other: { aud: "someone-else", email: "boss@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) },
  extra: { aud: CLIENT, email: "extra@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) },
};
let google, api, base;
test.before(async () => {
  google = http.createServer((req, res) => { const t = tokens[new URL(req.url, "http://x").searchParams.get("id_token")]; res.writeHead(t ? 200 : 400); res.end(JSON.stringify(t || { error: "invalid" })); });
  await new Promise((r) => google.listen(0, r));
  process.env.TOKENINFO_URL = `http://127.0.0.1:${google.address().port}/tokeninfo`;
  process.env.DATA_FILE = path.join(tmp, "data", "config.json");
  process.env.ACCESS_FILE = path.join(tmp, "access.json");
  process.env.ADMIN_EMAILS = "extra@example.com";
  api = require("./server.js").server;
  await new Promise((r) => api.listen(0, r));
  base = `http://127.0.0.1:${api.address().port}`;
});
test.after(() => { api.close(); google.close(); });
const post = (body) => fetch(`${base}/api/admin/site-config`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json()]);
const pub = (host) => fetch(`${base}/api/site-config?host=${host}`, { headers: { Origin: "https://tilenmiklavic.github.io" } }).then(async (r) => [r, await r.json()]);

test("public config starts empty, has CORS for github.io and no caching", async () => {
  const [r, j] = await pub("vodja.miklavic.si");
  assert.deepEqual(j.pages, {});
  assert.equal(r.headers.get("access-control-allow-origin"), "https://tilenmiklavic.github.io");
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("no sign-in, wrong audience and non-admins are refused", async () => {
  assert.equal((await post({ action: "get" }))[0], 401);
  assert.equal((await post({ action: "get", credential: "other" }))[0], 401);
  assert.equal((await post({ action: "get", credential: "svod" }))[0], 403);
  assert.equal((await post({ action: "set", credential: "svod", host: "vodja.miklavic.si", page: "uu", value: false }))[0], 403);
});
test("admin from access.json (case-insensitive) and from ADMIN_EMAILS", async () => {
  assert.equal((await post({ action: "get", credential: "boss" }))[0], 200);
  assert.equal((await post({ action: "get", credential: "extra" }))[0], 200);
});
test("set / reset a page per address; addresses are independent", async () => {
  let [c, j] = await post({ action: "set", credential: "boss", host: "vodja.miklavic.si", page: "uu", value: false });
  assert.equal(c, 200); assert.equal(j.config["vodja.miklavic.si"].uu, false); assert.deepEqual(j.config["tilenmiklavic.github.io"], {});
  await post({ action: "set", credential: "boss", host: "tilenmiklavic.github.io", page: "uu", value: true });
  assert.deepEqual((await pub("vodja.miklavic.si"))[1].pages, { uu: false });
  assert.deepEqual((await pub("tilenmiklavic.github.io"))[1].pages, { uu: true });
  [, j] = await post({ action: "set", credential: "boss", host: "vodja.miklavic.si", page: "uu", value: null });
  assert.deepEqual(j.config["vodja.miklavic.si"], {});
  assert.equal(j.log[0].by, "boss@example.com");
});
test("rejects unknown hosts, pages and values; unknown host reads as empty", async () => {
  for (const bad of [{ host: "evil.example", page: "uu", value: true }, { host: "vodja.miklavic.si", page: "nadzor", value: false }, { host: "vodja.miklavic.si", page: "uu", value: "x" }])
    assert.equal((await post({ action: "set", credential: "boss", ...bad }))[0], 400);
  assert.deepEqual((await pub("evil.example"))[1].pages, {});
});
test("state survives a restart (file on disk)", async () => {
  const saved = JSON.parse(fs.readFileSync(process.env.DATA_FILE, "utf8"));
  assert.deepEqual(saved.sites["tilenmiklavic.github.io"].pages, { uu: true });
});
