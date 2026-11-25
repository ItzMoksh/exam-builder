// Vercel: password gate in front of everything (pages, images, data, API). Logic lives in server/gate.js.
import { next } from "@vercel/functions";
import { gate } from "./server/gate.js";

export default async function middleware(request) {
  const blocked = await gate(request, process.env.SITE_PASSWORD);
  if (blocked) return blocked;
  return next({ headers: { "X-Robots-Tag": "noindex, nofollow" } });
}
