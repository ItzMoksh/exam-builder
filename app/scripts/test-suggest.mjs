// Check the suggester hits target marks and never repeats what a class has had:
//   node scripts/test-suggest.mjs
import fs from "node:fs";
import path from "node:path";
import { suggestPaper, seenByClass } from "../src/suggest.js";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const data = JSON.parse(fs.readFileSync(path.join(REPO, "index.json"), "utf8"));
const idx = { ...data, byId: new Map(data.questions.map((q) => [q.id, q])) };
const given = data.papers.filter((p) => p.status === "given");
const ch12 = ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "2.1", "2.2", "2.3"];
const blueprints = {
  "semester 80 (chapters 1-2)": { mcq: 20, theory: 40, atp: 20, topics: ch12 },
  "unit test 30 (1.1-1.6)": { mcq: 10, theory: 10, atp: 10, topics: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
  "ATP test 20 (thermal)": { mcq: 0, theory: 0, atp: 20, topics: ["2.1", "2.2", "2.3"] },
};
const RUNS = 20;
let repeats = 0;
for (const [name, b] of Object.entries(blueprints)) {
  const gaps = [];
  for (let run = 0; run < RUNS; run++) {
    const paper = {
      batch: "ig9-2026-27",
      sections: ["mcq", "theory", "atp"].filter((t) => b[t]).map((t) => ({ type: t, marks: b[t], topics: b.topics, questions: [] })),
    };
    const seen = seenByClass(idx, given, "ig9-2026-27");
    const out = suggestPaper(idx, paper, seen);
    for (const s of out.sections) for (const id of s.questions) if (seen.usedIn(idx.byId.get(id))) repeats++;
    gaps.push(out.sections.map((s) => s.marks - s.questions.reduce((t, id) => t + idx.byId.get(id).marks, 0)).join("/"));
  }
  const exact = gaps.filter((g) => g.split("/").every((x) => x === "0")).length;
  console.log(`${name}: exact marks in ${exact}/${RUNS} runs; marks short per section: ${[...new Set(gaps)].join("  ")}`);
}
console.log(`questions repeated from papers this class already had: ${repeats}`);
