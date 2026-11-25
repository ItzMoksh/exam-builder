// Saved-papers API shared by both hosts. `store` hides where papers live:
//   Cloudflare: KV namespace bound as PAPERS     -> kvStore(env.PAPERS)
//   Vercel:     Upstash Redis (Vercel Storage)   -> upstashStore(process.env)
//
//   GET    /api/papers        -> all papers
//   GET    /api/papers/:id    -> one paper
//   PUT    /api/papers/:id    -> save (body = paper JSON)
//   DELETE /api/papers/:id    -> delete
// If no store is configured the API answers 501 and the app keeps papers in the browser instead.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handlePapers(request, store, id) {
  if (!store) return json({ error: "No storage configured" }, 501);

  if (!id) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    return json(await store.list());
  }
  if (!/^p-[a-z0-9]{4,40}$/.test(id)) return json({ error: "bad id" }, 400);

  if (request.method === "GET") {
    const p = await store.get(id);
    return p ? json(p) : json({ error: "not found" }, 404);
  }
  if (request.method === "PUT") {
    const body = await request.text();
    if (body.length > 200_000) return json({ error: "too large" }, 413);
    let paper;
    try {
      paper = JSON.parse(body);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (paper.id !== id || !Array.isArray(paper.sections)) return json({ error: "bad paper" }, 400);
    await store.put(id, JSON.stringify(paper));
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    await store.del(id);
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
}

/** id from /api/papers/<id> (or null for /api/papers). */
export function paperIdFromUrl(url) {
  const m = new URL(url).pathname.match(/^\/api\/papers\/?([^/]*)\/?$/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

/** Cloudflare KV. */
export function kvStore(kv) {
  if (!kv) return null;
  return {
    async list() {
      const out = [];
      let cursor;
      do {
        const page = await kv.list({ prefix: "paper:", cursor });
        out.push(...(await Promise.all(page.keys.map((k) => kv.get(k.name, "json")))).filter(Boolean));
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return out;
    },
    get: (id) => kv.get("paper:" + id, "json"),
    put: (id, text) => kv.put("paper:" + id, text),
    del: (id) => kv.delete("paper:" + id),
  };
}

/** Upstash Redis over its REST API (what Vercel's Storage → Upstash integration sets up). One hash holds all papers. */
export function upstashStore(env, fetchImpl = fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const KEY = "exam-builder:papers";
  async function cmd(...args) {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || `storage error ${r.status}`);
    return data.result;
  }
  return {
    async list() {
      const flat = (await cmd("HGETALL", KEY)) || [];
      const out = [];
      for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
      return out;
    },
    async get(id) {
      const v = await cmd("HGET", KEY, id);
      return v ? JSON.parse(v) : null;
    },
    put: (id, text) => cmd("HSET", KEY, id, text),
    del: (id) => cmd("HDEL", KEY, id),
  };
}
