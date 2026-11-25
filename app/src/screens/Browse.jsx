import { useState } from "preact/hooks";
import { DIFFICULTY, mainTopicMatch, TYPE_NAMES } from "../data.js";
import { QuestionFacts, QuestionImage, ShowAnswer } from "../components.jsx";

// chapter order (1.2 before 1.10), then easier first
const codeKey = (q) => ((q.syllabus || [])[0] || "9").split(".").map((n) => n.padStart(3, "0")).join(".");
const bySyllabus = (a, b) => codeKey(a).localeCompare(codeKey(b)) || (a.difficulty || 2) - (b.difficulty || 2);

export function Browse({ idx }) {
  const [type, setType] = useState("");
  const [scope, setScope] = useState("all");
  const [diff, setDiff] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(15);

  const results = idx.questions.filter((q) => {
    if (type && q.type !== type) return false;
    if (scope !== "all" && !mainTopicMatch(q, [scope])) return false;
    if (diff && String(q.difficulty) !== diff) return false;
    if (query && !(q.text || "").toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }).sort(bySyllabus);
  const chapters = idx.topics.filter((t) => t.depth === 1);
  const reset = () => setLimit(15);

  return (
    <div class="browse">
      <h1>Question bank</h1>
      <p class="lead">Every question, exactly as it prints. Use the filters to find what you need.</p>
      <div class="tabs" role="tablist">
        {[["", "All"], ...Object.entries(TYPE_NAMES)].map(([k, v]) => (
          <button role="tab" aria-selected={type === k} class={type === k ? "active" : ""} key={k}
            onClick={() => { setType(k); reset(); }}>{v}</button>
        ))}
      </div>
      <div class="filters">
        <label class="field">
          <span>Chapter</span>
          <select value={scope} onChange={(e) => { setScope(e.currentTarget.value); reset(); }}>
            <option value="all">All chapters</option>
            {chapters.map((c) => <option value={c.code} key={c.code}>{c.code} {c.title}</option>)}
          </select>
        </label>
        <label class="field">
          <span>Difficulty</span>
          <select value={diff} onChange={(e) => { setDiff(e.currentTarget.value); reset(); }}>
            <option value="">Any</option>
            {Object.entries(DIFFICULTY).map(([k, v]) => <option value={k} key={k}>{v}</option>)}
          </select>
        </label>
        <label class="field grow">
          <span>Search words in the question</span>
          <input value={query} onInput={(e) => { setQuery(e.currentTarget.value); reset(); }} placeholder="e.g. meniscus, momentum, cooling" />
        </label>
      </div>
      <p class="muted">{results.length} questions</p>
      {results.slice(0, limit).map((q) => (
        <article class="qcard" key={q.id}>
          <div class="qbody">
            <QuestionImage q={q} preview />
            <QuestionFacts idx={idx} q={q} showType />
            <ShowAnswer q={q} />
          </div>
        </article>
      ))}
      {results.length > limit && <button class="btn" onClick={() => setLimit(limit + 15)}>Show more</button>}
      {!results.length && <div class="empty">No questions match these filters.</div>}
    </div>
  );
}
