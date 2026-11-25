// Tests the password gate and the saved-papers API, through the Vercel wrappers, with a fake Upstash.
//   node scripts/test-server.mjs
import assert from "node:assert/strict";

process.env.SITE_PASSWORD = "pw-for-tests";
process.env.KV_REST_API_URL = "https://fake-upstash.test";
process.env.KV_REST_API_TOKEN = "fake-token";

// Fake Upstash REST: a single in-memory Redis hash.
const hashes = new Map();
globalThis.fetch = async (url, init) => {
  assert.equal(url, process.env.KV_REST_API_URL);
  assert.equal(init.headers.Authorization, "Bearer fake-token");
  const [cmd, key, ...rest] = JSON.parse(init.body);
  const h = hashes.get(key) || new Map();
  hashes.set(key, h);
  let result;
  if (cmd === "HSET") { h.set(rest[0], rest[1]); result = 1; }
  else if (cmd === "HGET") result = h.get(rest[0]) ?? null;
  else if (cmd === "HGETALL") result = [...h].flat();
  else if (cmd === "HDEL") result = h.delete(rest[0]) ? 1 : 0;
  else throw new Error("unexpected command " + cmd);
  return new Response(JSON.stringify({ result }), { status: 200 });
};

const { default: middleware } = await import("../middleware.js");
const list = await import("../api/papers/index.js");
const one = await import("../api/papers/[id].js");
const site = "https://exam.example";
const req = (path, init = {}) => new Request(site + path, init);

// --- gate (Vercel middleware)
let r = await middleware(req("/"));
assert.equal(r.status, 200);
assert.match(await r.text(), /Enter the password/);
r = await middleware(req("/bank/x/q.png"));
assert.match(r.headers.get("content-type"), /text\/html/, "images must be gated");
r = await middleware(req("/api/papers"));
assert.equal(r.status, 401);
r = await middleware(req("/__login", { method: "POST", body: new URLSearchParams({ password: "wrong" }) }));
assert.equal(r.status, 401);
r = await middleware(req("/__login", { method: "POST", body: new URLSearchParams({ password: "pw-for-tests" }) }));
assert.equal(r.status, 303);
const cookie = r.headers.get("set-cookie").split(";")[0];
assert.match(cookie, /^eb_auth=[0-9a-f]{64}$/);
r = await middleware(req("/bank/x/q.png", { headers: { Cookie: cookie } }));
assert.equal(r.headers.get("x-middleware-next"), "1", "signed-in requests pass through");
console.log("gate: ok");

// --- papers API (Vercel functions, Upstash store)
const paper = { id: "p-abc123", name: "Test paper", status: "draft", sections: [{ type: "mcq", marks: 1, questions: ["q1"] }] };
r = await list.GET(req("/api/papers"));
assert.deepEqual(await r.json(), []);
r = await one.PUT(req("/api/papers/p-abc123", { method: "PUT", body: JSON.stringify(paper) }));
assert.equal(r.status, 200);
r = await one.GET(req("/api/papers/p-abc123"));
assert.deepEqual(await r.json(), paper);
r = await list.GET(req("/api/papers"));
assert.equal((await r.json()).length, 1);
r = await one.PUT(req("/api/papers/p-other1", { method: "PUT", body: JSON.stringify(paper) }));
assert.equal(r.status, 400, "id in body must match the url");
r = await one.PUT(req("/api/papers/..%2Fsecret", { method: "PUT", body: "{}" }));
assert.equal(r.status, 400, "bad ids rejected");
r = await one.DELETE(req("/api/papers/p-abc123", { method: "DELETE" }));
assert.equal(r.status, 200);
r = await one.GET(req("/api/papers/p-abc123"));
assert.equal(r.status, 404);
console.log("papers api: ok");

// --- no storage configured -> 501, so the app falls back to browser storage
delete process.env.KV_REST_API_URL;
r = await list.GET(req("/api/papers"));
assert.equal(r.status, 501);
console.log("no-storage fallback: ok");
