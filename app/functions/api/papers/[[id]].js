// Cloudflare Pages: saved papers in the KV namespace bound as PAPERS. Logic lives in server/papers.js.
import { handlePapers, kvStore } from "../../../server/papers.js";

export const onRequest = ({ request, env, params }) => handlePapers(request, kvStore(env.PAPERS), (params.id || [])[0]);
