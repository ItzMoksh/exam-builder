// Loading the question bank, syllabus helpers, and saving papers.

let INDEX = null;

export async function loadIndex() {
  if (INDEX) return INDEX;
  const res = await fetch("/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load the question bank");
  const data = await res.json();
  const byId = new Map(data.questions.map((q) => [q.id, q]));
  const topics = flattenTopics(data.syllabus.topics);
  INDEX = { ...data, byId, topics, topicTitle: new Map(topics.map((t) => [t.code, t.title])) };
  return INDEX;
}

function flattenTopics(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ code: n.code, title: n.title, depth });
    if (n.children) flattenTopics(n.children, depth + 1, out);
  }
  return out;
}

/** Does any of the question's codes fall under any of the chosen topics? ("1.5" covers "1.5.2") */
export function topicMatch(codes = [], topics) {
  if (!topics || !topics.length) return true;
  return codes.some((c) => topics.some((t) => c === t || c.startsWith(t + ".") || t.startsWith(c + ".")));
}

/** The question's main topic is its first syllabus code. */
export const mainTopicMatch = (q, topics) => topicMatch((q.syllabus || []).slice(0, 1), topics);

export function topicLabel(idx, code) {
  // show "1.5 Forces" for "1.5.2" too
  const t = idx.topicTitle.get(code);
  return t ? `${code} ${t}` : code;
}

export const TYPE_NAMES = { mcq: "Multiple choice", theory: "Theory", atp: "Alternative to practical" };
export const DIFFICULTY = { 1: "Easy", 2: "Medium", 3: "Hard" };

export const SITE_NAMES = {
  school: "School paper", savemyexams: "Save My Exams", igexams: "igexams", pmt: "PMT",
  papacambridge: "PapaCambridge", tophysicstutor: "TOPhysicsTutor", own: "Own", unknown: "Other",
};

/** Human name of where a question came from. */
export function sourceName(q) {
  const slug = q.source?.slug || "";
  const m = slug.match(/^sem1-(\d{4}-\d{2})$/);
  if (m) return `School Semester 1 exam ${m[1]}`;
  if (slug.startsWith("ws")) return "School worksheet";
  return SITE_NAMES[q.source?.site] || "Other";
}

/** "IG9 2026-27" -> "ig9-2026-27": the key used to avoid repeating questions with a class. */
export const batchKey = (s) => (s || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
export const batchLabel = (k) => (k || "").replace(/^([a-z]+\d*)-/i, (_, a) => a.toUpperCase() + " ");

// ------------------------------------------------------------------ papers storage
// Online (Cloudflare KV via /api/papers) when deployed; this browser's storage otherwise.

const LOCAL_KEY = "eb-papers";
let mode = null; // "online" | "local"

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeLocal(all) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: nothing we can do */
  }
}

export async function storageMode() {
  if (mode) return mode;
  try {
    const r = await fetch("/api/papers", { headers: { Accept: "application/json" } });
    mode = r.ok && (r.headers.get("content-type") || "").includes("json") ? "online" : "local";
  } catch {
    mode = "local";
  }
  return mode;
}

export async function listPapers() {
  if ((await storageMode()) === "online") {
    const r = await fetch("/api/papers");
    const list = await r.json();
    writeLocal(Object.fromEntries(list.map((p) => [p.id, p]))); // offline copy
    return list;
  }
  return Object.values(readLocal());
}

export async function savePaper(paper) {
  const p = { ...paper, updated: new Date().toISOString() };
  const all = readLocal();
  all[p.id] = p;
  writeLocal(all);
  if ((await storageMode()) === "online") {
    const r = await fetch(`/api/papers/${encodeURIComponent(p.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) throw new Error("Saving failed");
  }
  return p;
}

export async function deletePaper(id) {
  const all = readLocal();
  delete all[id];
  writeLocal(all);
  if ((await storageMode()) === "online") {
    await fetch(`/api/papers/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

export async function getPaper(id) {
  const local = readLocal()[id];
  if ((await storageMode()) === "online") {
    const r = await fetch(`/api/papers/${encodeURIComponent(id)}`);
    if (r.ok) return r.json();
  }
  return local || null;
}

/** All papers that count for "already used": given papers from the repo plus given papers saved here. */
export function givenPapers(idx, saved) {
  const repo = (idx.papers || []).filter((p) => p.status === "given");
  return [...repo.map((p) => ({ ...p, questions: p.questions })), ...saved.filter((p) => p.status === "given").map((p) => ({
    ...p, questions: p.sections.flatMap((s) => s.questions),
  }))];
}

export const newId = () => "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
