// After `vite build`: copy index.json and the question images into dist/ so the site is self-contained.
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(APP, "..");
const DIST = path.join(APP, "dist");

fs.copyFileSync(path.join(REPO, "index.json"), path.join(DIST, "index.json"));
let n = 0;
for (const dir of fs.readdirSync(path.join(REPO, "bank"))) {
  const src = path.join(REPO, "bank", dir);
  if (!fs.statSync(src).isDirectory()) continue;
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith(".png")) continue; // meta.yaml is already in index.json
    fs.mkdirSync(path.join(DIST, "bank", dir), { recursive: true });
    fs.copyFileSync(path.join(src, f), path.join(DIST, "bank", dir, f));
    n++;
  }
}
console.log(`copied index.json and ${n} question images into dist/`);
