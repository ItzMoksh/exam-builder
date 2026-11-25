// Smoke test: build the Word files for a paper from index.json in Node.
//   node scripts/test-word.mjs [paper-file-name-in-papers/]   -> ../out/web-test - paper.docx / - mark scheme.docx
import fs from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import { questionPaper, markScheme } from "../src/word.js";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const data = JSON.parse(fs.readFileSync(path.join(REPO, "index.json"), "utf8"));
const idx = { ...data, byId: new Map(data.questions.map((q) => [q.id, q])) };
const file = process.argv[2] || "ut-motion-forces-momentum.yaml";
const paper = data.papers.find((p) => p.file === file);
if (!paper) throw new Error(`no paper ${file} in index.json`);
const getImage = async (rel) => fs.readFileSync(path.join(REPO, rel));

fs.mkdirSync(path.join(REPO, "out"), { recursive: true });
const qp = await questionPaper(idx, paper, getImage);
fs.writeFileSync(path.join(REPO, "out", "web-test - paper.docx"), await Packer.toBuffer(qp));
const { doc, toCheck } = await markScheme(idx, paper, getImage);
fs.writeFileSync(path.join(REPO, "out", "web-test - mark scheme.docx"), await Packer.toBuffer(doc));
console.log("ok; check:", toCheck);
