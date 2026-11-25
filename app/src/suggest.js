// Choosing questions for a paper. Same rules as tools/paper.py `draft`:
// - match the section's type and the question's main topic; never suggest flagged questions
// - avoid anything this class has already been given, including copies from other sources
// - never put the same question in twice (same Cambridge ref or near-identical text)
// - spread over the chosen topics, aim for ~30/50/20 easy/medium/hard by marks
// - prefer questions with a real mark scheme

import { mainTopicMatch, topicMatch, batchKey } from "./data.js";

const DIFF_MIX = { 1: 0.3, 2: 0.5, 3: 0.2 };

const normOrigin = (o) => (o ? o.replace(/\s+/g, "").toLowerCase() : null);
const normText = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function bigrams(s) {
  const w = s.split(" ");
  const out = new Map();
  for (let i = 0; i < w.length - 1; i++) {
    const k = w[i] + " " + w[i + 1];
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

/** Near-identical question text (the same question taken from two sources). */
export function similar(a, b) {
  if (a.length < 40 || b.length < 40) return false;
  if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.3) return false;
  const A = bigrams(a), B = bigrams(b);
  let common = 0, total = 0;
  for (const [k, n] of A) { common += Math.min(n, B.get(k) || 0); total += n; }
  for (const n of B.values()) total += n;
  return total > 0 && (2 * common) / total > 0.8;
}

export const hasMarkScheme = (q) =>
  !!(q.images?.markscheme?.length || q.markscheme_text || (q.answer && !q.answer_by));

/** Everything the class has already been given: ids, Cambridge refs, texts. */
export function seenByClass(idx, given, batch) {
  const key = batchKey(batch);
  const ids = new Set();
  const names = new Map();
  for (const p of given) {
    if (batchKey(p.batch) !== key) continue;
    for (const id of p.questions) {
      ids.add(id);
      names.set(id, p.name);
    }
  }
  const seenQs = [...ids].map((id) => idx.byId.get(id)).filter(Boolean);
  const origins = new Set(seenQs.map((q) => normOrigin(q.source?.origin)).filter(Boolean));
  const texts = seenQs.map((q) => ({ type: q.type, text: normText(q.text), name: names.get(q.id) }));
  return {
    /** Name of the given paper this question (or a copy of it) was in, or null. */
    usedIn(q) {
      if (ids.has(q.id)) return names.get(q.id);
      const o = normOrigin(q.source?.origin);
      if (o && origins.has(o)) {
        const twin = seenQs.find((s) => normOrigin(s.source?.origin) === o);
        return names.get(twin.id);
      }
      const t = normText(q.text);
      const hit = texts.find((s) => s.type === q.type && similar(t, s.text));
      return hit ? hit.name : null;
    },
  };
}

/** Is q the same question as one already in the paper? */
function duplicateOf(q, inPaper) {
  const o = normOrigin(q.source?.origin);
  const t = normText(q.text);
  return inPaper.some((p) => p.id === q.id || (o && normOrigin(p.source?.origin) === o) || similar(t, normText(p.text)));
}

function candidates(idx, section) {
  return idx.questions.filter(
    (q) => q.type === section.type && q.marks && !q.problem && mainTopicMatch(q, section.topics),
  );
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fill one section with suggested questions.
 * `inPaper` = questions already chosen elsewhere in the paper (to avoid duplicates).
 * Greedy filling can strand a few marks (a 10 + 5 leaves 5 that nothing fits), so try several
 * varied fills and keep the first that hits the marks exactly, else the closest.
 */
export function fillSection(idx, section, opts) {
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const ids = fillOnce(idx, section, opts, attempt === 0 ? 0 : 1.5);
    const got = ids.reduce((t, id) => t + (idx.byId.get(id)?.marks || 0), 0);
    const gap = section.marks - got;
    if (!best || gap < best.gap) best = { ids, gap };
    if (gap === 0) break;
  }
  return best.ids;
}

function fillOnce(idx, section, { seen, inPaper = [] }, jitter) {
  const target = section.marks;
  const topics = section.topics || [];
  const pool = shuffle(candidates(idx, section));
  const chosen = [];
  const byTopic = {};
  const byDiff = {};
  let got = 0;

  const score = (q, remaining) => {
    let s = 0;
    if (seen.usedIn(q)) s -= 100;
    else if (q.used_in?.length) s -= 1;
    if (q.status === "reviewed") s += 3;
    if (hasMarkScheme(q)) s += 1;
    if (duplicateOf(q, [...inPaper, ...chosen])) s -= 50;
    if (topics.length) {
      const hit = topics.filter((t) => topicMatch(q.syllabus || [], [t]));
      s += 8 * Math.max(0, ...hit.map((t) => 1 / (1 + (byTopic[t] || 0))));
    }
    const d = q.difficulty || 2;
    const want = DIFF_MIX[d] * target - (byDiff[d] || 0);
    s += (want > 0 ? 2 : 0) + (q.marks === remaining ? 1 : 0);
    return s + Math.random() * jitter; // jitter varies the retries
  };

  while (got < target) {
    const remaining = target - got;
    const fits = pool.filter((q) => !chosen.includes(q) && q.marks <= remaining);
    if (!fits.length) break;
    let best = fits[0], bestScore = -Infinity;
    for (const q of fits) {
      const s = score(q, remaining);
      if (s > bestScore) { best = q; bestScore = s; }
    }
    if (bestScore <= -50 && chosen.length) break; // only repeats or duplicates left
    chosen.push(best);
    got += best.marks;
    for (const t of topics) if (topicMatch(best.syllabus || [], [t])) byTopic[t] = (byTopic[t] || 0) + 1;
    const d = best.difficulty || 2;
    byDiff[d] = (byDiff[d] || 0) + best.marks;
  }
  chosen.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2)); // easier first
  return chosen.map((q) => q.id);
}

/** Fill every section of a paper. Sections keep any questions already in them only if `keep` is set. */
export function suggestPaper(idx, paper, seen) {
  const inPaper = [];
  return {
    ...paper,
    sections: paper.sections.map((s) => {
      const ids = fillSection(idx, s, { seen, inPaper });
      inPaper.push(...ids.map((id) => idx.byId.get(id)));
      return { ...s, questions: ids };
    }),
  };
}

/**
 * Ranked replacements for one question: same section type and topics, not in the paper,
 * not seen by the class; same marks first.
 */
export function alternatives(idx, paper, section, qid, seen) {
  const current = idx.byId.get(qid);
  const inPaper = paper.sections.flatMap((s) => s.questions).filter((id) => id !== qid).map((id) => idx.byId.get(id));
  return shuffle(candidates(idx, section))
    .filter((q) => q.id !== qid && !duplicateOf(q, inPaper) && !seen.usedIn(q) && !(current && duplicateOf(q, [current])))
    .map((q) => ({
      q,
      s: (q.marks === current?.marks ? 10 : -Math.abs(q.marks - (current?.marks || 0))) +
        (hasMarkScheme(q) ? 1 : 0) +
        ((q.syllabus || [])[0] === (current?.syllabus || [])[0] ? 2 : 0),
    }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.q);
}

export const sectionMarks = (idx, section) =>
  section.questions.reduce((t, id) => t + (idx.byId.get(id)?.marks || 0), 0);
