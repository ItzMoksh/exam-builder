import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");

// In dev, serve the question bank straight from the repo (bank/ and index.json live one level up).
// `npm run build` copies them into dist/ instead (scripts/copy-data.mjs).
function serveBank() {
  return {
    name: "serve-bank",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || "").split("?")[0]);
        if (url !== "/index.json" && !url.startsWith("/bank/")) return next();
        const file = path.join(REPO, url);
        if (!file.startsWith(REPO) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", url.endsWith(".png") ? "image/png" : "application/json");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), serveBank()],
  server: { port: 5173 },
});
