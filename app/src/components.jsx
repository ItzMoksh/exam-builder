import { useState } from "preact/hooks";
import { DIFFICULTY, TYPE_NAMES, sourceName, topicLabel } from "./data.js";
import { Icon, px96 } from "./util.jsx";

/**
 * The question exactly as it will print: its cropped image(s) at print size.
 * `preview` shows just the top of the question, with a button to see all of it (for long lists).
 */
export function QuestionImage({ q, kind = "question", preview = false }) {
  const all = q.images?.[kind] || [];
  const [open, setOpen] = useState(!preview);
  const totalH = all.reduce((t, f) => t + px96((q.sizes?.[f] || [0, 0])[1]), 0);
  const long = preview && (all.length > 1 || totalH > 420);
  const files = open || !long ? all : all.slice(0, 1);
  return (
    <div class={"qimg" + (long && !open ? " clipped" : "")}>
      {files.map((f) => {
        const [w, h] = q.sizes?.[f] || [0, 0];
        return <img key={f} src={`/${q.dir}/${f}`} alt={kind === "question" ? q.text?.slice(0, 120) : "Mark scheme"}
          loading="lazy" width={px96(w)} height={px96(h)} style={{ width: px96(w) + "px" }} />;
      })}
      {long && (
        <button class="link more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : `Show the whole question${all.length > 1 ? ` (${all.length} pages)` : ""}`}
        </button>
      )}
    </div>
  );
}

export function QuestionFacts({ idx, q, usedIn, showType }) {
  const topics = (q.syllabus || []).slice(0, 2).map((c) => topicLabel(idx, c));
  return (
    <div class="facts">
      <span class="chip strong">{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>
      {showType && <span class="chip">{TYPE_NAMES[q.type]}</span>}
      {q.difficulty && <span class={"chip d" + q.difficulty}>{DIFFICULTY[q.difficulty]}</span>}
      {topics.map((t) => <span class="chip" key={t}>{t}</span>)}
      {q.tier === "supplement" && <span class="chip" title="Uses extended (supplement) syllabus content">Extended</span>}
      <span class="chip muted">{sourceName(q)}</span>
      {usedIn && <span class="chip warn"><Icon name="warn" size={14} /> Already given to this class ({usedIn})</span>}
      {q.problem && <span class="chip warn" title={q.problem}><Icon name="flag" size={14} /> Has a problem</span>}
    </div>
  );
}

/** Mark scheme / answer, shown on request. */
export function AnswerBox({ q }) {
  const ms = q.images?.markscheme || [];
  return (
    <div class="answer">
      {q.answer && (
        <p><strong>Answer: {q.answer}</strong>
          {q.answer_by === "claude" && <span class="muted"> (worked out by computer, please check)</span>}</p>
      )}
      {ms.length > 0 && <QuestionImage q={q} kind="markscheme" />}
      {!ms.length && q.markscheme_text && <pre class="mstext">{q.markscheme_text}</pre>}
      {!ms.length && !q.markscheme_text && !q.answer && <p class="muted">No mark scheme in the bank for this question yet.</p>}
      {q.notes && <p class="note"><strong>Note:</strong> {q.notes}</p>}
      {q.problem && <p class="note warn"><strong>Problem:</strong> {q.problem}</p>}
    </div>
  );
}

export function ShowAnswer({ q }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button class="link" onClick={() => setOpen(!open)}>{open ? "Hide answer" : "Show answer / mark scheme"}</button>
      {open && <AnswerBox q={q} />}
    </div>
  );
}

/** Chapter checkboxes, grouped by syllabus unit, with how many questions each has. */
export function TopicChooser({ idx, selected, onChange, counts }) {
  const units = idx.syllabus.topics;
  // onChange gets an updater function, so quick successive clicks never overwrite each other
  const toggle = (code) => onChange((sel) => (sel.includes(code) ? sel.filter((c) => c !== code) : [...sel, code]));
  return (
    <div class="topics">
      {units.map((u) => {
        const kids = (u.children || []).map((c) => ({ ...c, n: counts[c.code] || 0 }));
        const total = kids.reduce((t, k) => t + k.n, 0);
        const usable = kids.filter((k) => k.n > 0).map((k) => k.code);
        const all = usable.length > 0 && usable.every((c) => selected.includes(c));
        return (
          <fieldset class={"unit" + (total ? "" : " none")} key={u.code}>
            <legend>
              <label class="check">
                <input type="checkbox" checked={all} disabled={!total}
                  onChange={() => onChange((sel) => (all ? sel.filter((c) => !usable.includes(c)) : [...new Set([...sel, ...usable])]))} />
                <span>{u.code}. {u.title}</span>
              </label>
              {!total && <span class="muted small"> (no questions yet)</span>}
            </legend>
            {total > 0 && (
              <div class="topic-list">
                {kids.map((k) => (
                  <label class={"check topic" + (k.n ? "" : " disabled")} key={k.code}>
                    <input type="checkbox" disabled={!k.n} checked={selected.includes(k.code)} onChange={() => toggle(k.code)} />
                    <span>{k.code} {k.title}</span>
                    <span class="count">{k.n || "none yet"}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
