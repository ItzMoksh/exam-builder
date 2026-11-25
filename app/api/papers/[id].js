// Vercel: GET/PUT/DELETE /api/papers/:id. Saved papers live in Upstash Redis (Vercel → Storage). Logic in server/papers.js.
import { handlePapers, paperIdFromUrl, upstashStore } from "../../server/papers.js";

const handle = (request) => handlePapers(request, upstashStore(process.env), paperIdFromUrl(request.url));
export { handle as GET, handle as PUT, handle as DELETE };
