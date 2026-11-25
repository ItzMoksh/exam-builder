import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  batchKey, batchLabel, DIFFICULTY, getPaper, givenPapers, listPapers, mainTopicMatch, savePaper, TYPE_NAMES,
} from "../data.js";
import { alternatives, fillSection, seenByClass, sectionMarks } from "../suggest.js";
import { QuestionFacts, QuestionImage, ShowAnswer } from "../components.jsx";
import { downloadMarkScheme, downloadPaper, Icon, Modal } from "../util.jsx";

export function Editor({ idx, id }) {
  const [paper, setPaper] = useState(undefined);
  const [saved, setSaved] = useState([]);
  const [saveState, setSaveState] = useState("saved");
  const [toast, setToast] = useState(null);
  const [picker, setPicker] = useState(null); // section index
  const [details, setDetails] = useState(false);
  const [confirmGiven, setConfirmGiven] = useState(false);
  const [busy, setBusy] = useState(null);
  const undo = useRef(null);
  const rejected = useRef(new Set()); // questions swapped out in this visit: don't offer them again
  const timer = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    getPaper(id).then((p) => setPaper(p || null));
    listPapers().then(setSaved);
  }, [id]);

  const seen = useMemo(
    () => (paper ? seenByClass(idx, givenPapers(idx, saved.filter((p) => p.id !== paper.id)), paper.batch) : null),
    [idx, saved, paper?.batch, paper?.id],
  );

  if (paper === undefined) return <p class="loading">Opening the paper…</p>;
  if (paper === null) return <div class="card">This paper could not be found. <a href="#/papers">Go to My papers</a></div>;

  function flash(message, canUndo = false, ms = 10000) {
    setToast({ message, canUndo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }

  function update(next, message) {
    undo.current = paper;
    setPaper(next);
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      savePaper(next).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 500);
    if (message) flash(message, true);
  }

  function undoLast() {
    if (!undo.current) return;
    const prev = undo.current;
    undo.current = null;
    update(prev);
    flash("Undone.");
  }

  const setSection = (si, s) => paper.sections.map((x, i) => (i === si ? s : x));
  const qsOf = (s) => s.questions.map((qid) => idx.byId.get(qid)).filter(Boolean);

  function swap(si, qi) {
    const s = paper.sections[si];
    const qid = s.questions[qi];
    rejected.current.add(qid);
    const alt = alternatives(idx, paper, s, qid, seen).find((q) => !rejected.current.has(q.id));
    if (!alt) return flash("There are no other suitable questions for these chapters yet.");
    const questions = [...s.questions];
    questions[qi] = alt.id;
    update({ ...paper, sections: setSection(si, { ...s, questions }) }, `Question ${number(si, qi)} swapped for another.`);
  }

  function remove(si, qi) {
    const s = paper.sections[si];
    update({ ...paper, sections: setSection(si, { ...s, questions: s.questions.filter((_, i) => i !== qi) }) },
      `Question ${number(si, qi)} removed.`);
  }

  function move(si, qi, d) {
    const s = paper.sections[si];
    const questions = [...s.questions];
    const j = qi + d;
    if (j < 0 || j >= questions.length) return;
    [questions[qi], questions[j]] = [questions[j], questions[qi]];
    update({ ...paper, sections: setSection(si, { ...s, questions }) });
  }

  function add(si, qid) {
    const s = paper.sections[si];
    update({ ...paper, sections: setSection(si, { ...s, questions: [...s.questions, qid] }) }, "Question added at the end of the section.");
  }

  function resuggest(si) {
    const s = paper.sections[si];
    const inPaper = paper.sections.filter((_, i) => i !== si).flatMap(qsOf);
    s.questions.forEach((q) => rejected.current.add(q));
    const ids = fillSection(idx, s, { seen, inPaper });
    update({ ...paper, sections: setSection(si, { ...s, questions: ids }) }, `New suggestions for ${s.title.split(" – ")[1] || s.title}.`);
  }

  function number(si, qi) {
    return paper.sections.slice(0, si).reduce((t, s) => t + s.questions.length, 0) + qi + 1;
  }

  async function dl(kind) {
    setBusy(kind);
    try {
      if (kind === "paper") await downloadPaper(idx, paper);
      else {
        const toCheck = await downloadMarkScheme(idx, paper);
        if (toCheck.length) flash(`Mark scheme downloaded. Please check the answers to questions ${toCheck.join(", ")}: they were worked out by the computer or are missing.`, false, 12000);
      }
    } catch (e) {
      flash("Sorry, the Word file could not be made: " + e.message);
    }
    setBusy(null);
  }

  const total = paper.sections.reduce((t, s) => t + sectionMarks(idx, s), 0);
  const target = paper.sections.reduce((t, s) => t + s.marks, 0);
  const given = paper.status === "given";

  return (
    <div class="editor">
      <div class="editor-head">
        <a href="#/papers" class="link back"><Icon name="back" size={16} /> My papers</a>
        <div class="title-row">
          <h1>{paper.name}</h1>
          <span class={"pill " + paper.status}>{given ? "Given to class" : "Draft"}</span>
        </div>
        <p class="muted">
          {batchLabel(paper.batch)}{paper.time ? ` · ${paper.time}` : ""}{paper.date ? ` · ${paper.date}` : ""} ·{" "}
          <button class="link" onClick={() => setDetails(true)}><Icon name="edit" size={14} /> Change details</button>
          <span class={"save " + saveState}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved: check the internet connection" : "Saved"}
          </span>
        </p>
      </div>

      {given && (
        <div class="banner">
          This paper has been given to {batchLabel(paper.batch)}. Its questions won't be suggested again for this class.{" "}
          <button class="link" onClick={() => update({ ...paper, status: "draft" }, "Marked as not given.")}>It wasn't given after all</button>
        </div>
      )}

      <div class="actionbar">
        <div class={"total" + (total === target ? " ok" : " off")}>
          <strong>{total}</strong> of {target} marks
        </div>
        <div class="grow" />
        <button class="btn primary" onClick={() => dl("paper")} disabled={!!busy}>
          <Icon name="download" /> {busy === "paper" ? "Preparing…" : <><span class="long">Download question paper</span><span class="short">Paper</span></>}
        </button>
        <button class="btn" onClick={() => dl("ms")} disabled={!!busy}>
          <Icon name="download" /> {busy === "ms" ? "Preparing…" : <><span class="long">Download mark scheme</span><span class="short">Mark scheme</span></>}
        </button>
        {!given && (
          <button class="btn given-btn" onClick={() => setConfirmGiven(true)}><Icon name="check" /> Mark as given</button>
        )}
      </div>

      {paper.sections.map((s, si) => {
        const got = sectionMarks(idx, s);
        const diff = s.marks - got;
        return (
          <section class="paper-section" key={si}>
            <div class="section-head">
              <div>
                <h2>{s.title}</h2>
                <p class={"section-status " + (diff === 0 ? "ok" : "off")}>
                  {diff === 0 ? <><Icon name="check" size={16} /> {got} of {s.marks} marks</>
                    : diff > 0 ? <><Icon name="warn" size={16} /> {got} of {s.marks} marks: add {diff} more</>
                      : <><Icon name="warn" size={16} /> {got} of {s.marks} marks: {-diff} too many</>}
                </p>
              </div>
              <div class="section-actions">
                <button class="btn" onClick={() => setPicker(si)}><Icon name="plus" /> Add a question</button>
                <button class="btn ghost" onClick={() => resuggest(si)} title="Replace all questions in this section with new suggestions">
                  <Icon name="refresh" /> Suggest again
                </button>
              </div>
            </div>

            {s.questions.length === 0 && (
              <div class="empty">No questions in this section yet. Press <strong>Add a question</strong>.</div>
            )}

            {qsOf(s).map((q, qi) => (
              <article class="qcard" key={q.id}>
                <div class="qnum">{number(si, qi)}</div>
                <div class="qbody">
                  <QuestionImage q={q} />
                  <QuestionFacts idx={idx} q={q} usedIn={seen?.usedIn(q)} />
                  <ShowAnswer q={q} />
                </div>
                <div class="qactions">
                  <button class="btn small" onClick={() => swap(si, qi)} title="Replace with a similar question">
                    <Icon name="swap" size={16} /> Swap
                  </button>
                  <button class="btn small ghost" onClick={() => remove(si, qi)}><Icon name="trash" size={16} /> Remove</button>
                  <button class="btn small ghost" onClick={() => move(si, qi, -1)} disabled={qi === 0} aria-label="Move up">
                    <Icon name="up" size={16} /> Up
                  </button>
                  <button class="btn small ghost" onClick={() => move(si, qi, 1)} disabled={qi === s.questions.length - 1} aria-label="Move down">
                    <Icon name="down" size={16} /> Down
                  </button>
                </div>
              </article>
            ))}
          </section>
        );
      })}

      <div class="actionbar bottom">
        <div class="grow" />
        <button class="btn primary" onClick={() => dl("paper")} disabled={!!busy}><Icon name="download" /> <span class="long">Download question paper</span><span class="short">Paper</span></button>
        <button class="btn" onClick={() => dl("ms")} disabled={!!busy}><Icon name="download" /> <span class="long">Download mark scheme</span><span class="short">Mark scheme</span></button>
      </div>

      {picker !== null && (
        <Picker idx={idx} paper={paper} si={picker} seen={seen} onAdd={(qid) => add(picker, qid)} onClose={() => setPicker(null)} />
      )}
      {details && <Details paper={paper} onClose={() => setDetails(false)}
        onSave={(p) => { update(p, "Details updated."); setDetails(false); }} />}
      {confirmGiven && (
        <Modal title="Mark this paper as given?" onClose={() => setConfirmGiven(false)}>
          <p>Do this after the class has taken the test. Its questions won't be suggested again for <strong>{batchLabel(paper.batch)}</strong>.</p>
          <p class="muted">You can still download it again later, and undo this if you change your mind.</p>
          <div class="modal-foot">
            <button class="btn ghost" onClick={() => setConfirmGiven(false)}>Cancel</button>
            <button class="btn primary" onClick={() => { update({ ...paper, status: "given" }, "Marked as given."); setConfirmGiven(false); }}>
              Yes, it was given
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div class="toast" role="status">
          <span>{toast.message}</span>
          {toast.canUndo && <button class="link light" onClick={undoLast}>Undo</button>}
          <button class="link light" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}
    </div>
  );
}

function Picker({ idx, paper, si, seen, onAdd, onClose }) {
  const s = paper.sections[si];
  const [scope, setScope] = useState("paper"); // "paper" = the paper's chapters, or a topic code, or "all"
  const [diff, setDiff] = useState("");
  const [query, setQuery] = useState("");
  const [hideUsed, setHideUsed] = useState(true);
  const [limit, setLimit] = useState(20);
  const inPaper = new Set(paper.sections.flatMap((x) => x.questions));

  const results = idx.questions.filter((q) => {
    if (q.type !== s.type || inPaper.has(q.id)) return false;
    if (scope === "paper" && !mainTopicMatch(q, s.topics)) return false;
    if (scope !== "paper" && scope !== "all" && !mainTopicMatch(q, [scope])) return false;
    if (diff && String(q.difficulty) !== diff) return false;
    if (hideUsed && seen?.usedIn(q)) return false;
    if (query && !(q.text || "").toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const chapters = idx.topics.filter((t) => t.depth === 1);

  return (
    <Modal title={`Add a question to ${s.title}`} onClose={onClose} wide>
      <div class="filters">
        <label class="field">
          <span>Chapters</span>
          <select value={scope} onChange={(e) => { setScope(e.currentTarget.value); setLimit(20); }}>
            <option value="paper">This paper's chapters</option>
            <option value="all">All chapters</option>
            {chapters.map((c) => <option value={c.code} key={c.code}>{c.code} {c.title}</option>)}
          </select>
        </label>
        <label class="field">
          <span>Difficulty</span>
          <select value={diff} onChange={(e) => setDiff(e.currentTarget.value)}>
            <option value="">Any</option>
            {Object.entries(DIFFICULTY).map(([k, v]) => <option value={k} key={k}>{v}</option>)}
          </select>
        </label>
        <label class="field grow">
          <span>Search words in the question</span>
          <input value={query} onInput={(e) => { setQuery(e.currentTarget.value); setLimit(20); }} placeholder="e.g. spring, density, thermometer" />
        </label>
      </div>
      <label class="check small">
        <input type="checkbox" checked={hideUsed} onChange={() => setHideUsed(!hideUsed)} />
        <span>Hide questions {batchLabel(paper.batch)} has already had</span>
      </label>
      <p class="muted">{results.length} {TYPE_NAMES[s.type].toLowerCase()} questions found</p>
      <div class="picker-list">
        {results.slice(0, limit).map((q) => (
          <article class="qcard compact" key={q.id}>
            <div class="qbody">
              <QuestionImage q={q} preview />
              <QuestionFacts idx={idx} q={q} usedIn={seen?.usedIn(q)} />
            </div>
            <div class="qactions">
              <button class="btn primary small" onClick={() => onAdd(q.id)}><Icon name="plus" size={16} /> Add</button>
            </div>
          </article>
        ))}
        {results.length > limit && <button class="btn" onClick={() => setLimit(limit + 20)}>Show more</button>}
        {!results.length && <div class="empty">No questions match. Try “All chapters” or clear the search.</div>}
      </div>
    </Modal>
  );
}

function Details({ paper, onClose, onSave }) {
  const [p, setP] = useState({ ...paper, klass: batchLabel(paper.batch) });
  const set = (k) => (e) => setP({ ...p, [k]: e.currentTarget.value });
  return (
    <Modal title="Paper details" onClose={onClose}>
      <div class="grid2">
        <label class="field"><span>Name of the paper</span><input value={p.name} onInput={set("name")} /></label>
        <label class="field"><span>Class</span><input value={p.klass} onInput={set("klass")} /></label>
        <label class="field"><span>Time allowed</span><input value={p.time} onInput={set("time")} /></label>
        <label class="field"><span>Date</span><input value={p.date} onInput={set("date")} placeholder="03/12/2026" /></label>
        <label class="field wide"><span>Footer line on every page</span><input value={p.footer_code} onInput={set("footer_code")} /></label>
      </div>
      <h3>Marks for each section</h3>
      {p.sections.map((s, i) => (
        <div class="mark-row" key={i}>
          <label>{s.title}</label>
          <input type="number" min="0" step="1" value={s.marks} onInput={(e) => {
            const sections = p.sections.map((x, j) => (j === i ? { ...x, marks: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)) } : x));
            setP({ ...p, sections });
          }} />
          <span class="suffix">marks</span>
        </div>
      ))}
      <div class="modal-foot">
        <button class="btn ghost" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={() => {
          const { klass, ...rest } = p;
          onSave({ ...rest, name: p.name.trim() || paper.name, exam: p.name.trim() || paper.name, batch: batchKey(klass) || paper.batch });
        }}>Save details</button>
      </div>
    </Modal>
  );
}

