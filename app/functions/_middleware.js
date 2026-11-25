// Cloudflare Pages: password gate in front of everything. Logic lives in server/gate.js.
import { gate } from "../server/gate.js";

export async function onRequest({ request, env, next }) {
  const blocked = await gate(request, env.SITE_PASSWORD);
  if (blocked) return blocked;
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
}
