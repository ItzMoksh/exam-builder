// Vercel: GET /api/papers. Saved papers live in Upstash Redis (Vercel → Storage). Logic in server/papers.js.
import { handlePapers, upstashStore } from "../../server/papers.js";

const handle = (request) => handlePapers(request, upstashStore(process.env), null);
export { handle as GET, handle as PUT, handle as DELETE };
