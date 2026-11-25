// Saved papers, kept in Cloudflare KV (binding name: PAPERS).
//   GET    /api/papers        -> all papers
//   GET    /api/papers/:id    -> one paper
//   PUT    /api/papers/:id    -> save (body = paper JSON)
//   DELETE /api/papers/:id    -> delete
// The password gate in functions/_middleware.js runs first.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequest({ request, env, params }) {
  const kv = env.PAPERS;
  if (!kv) return json({ error: "No storage: bind a KV namespace called PAPERS" }, 501);

  const id = (params.id || [])[0];
  if (!id) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const papers = [];
    let cursor;
    do {
      const page = await kv.list({ prefix: "paper:", cursor });
      const got = await Promise.all(page.keys.map((k) => kv.get(k.name, "json")));
      papers.push(...got.filter(Boolean));
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return json(papers);
  }

  if (!/^p-[a-z0-9]{4,40}$/.test(id)) return json({ error: "bad id" }, 400);
  const key = "paper:" + id;

  if (request.method === "GET") {
    const p = await kv.get(key, "json");
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
    await kv.put(key, JSON.stringify(paper));
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    await kv.delete(key);
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
}
