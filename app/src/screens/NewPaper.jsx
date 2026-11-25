import { useMemo, useState } from "preact/hooks";
import { batchKey, givenPapers, listPapers, mainTopicMatch, newId, savePaper, TYPE_NAMES } from "../data.js";
import { seenByClass, suggestPaper } from "../suggest.js";
import { TopicChooser } from "../components.jsx";
import { academicYear, Icon, SECTION_ORDER, sectionTitle, TEMPLATES } from "../util.jsx";
import { DEFAULTS } from "../word.js";

export function NewPaper({ idx }) {
  const year = academicYear();
  const [tpl, setTpl] = useState("unit");
  const [topics, setTopics] = useState([]);
  const [marks, setMarks] = useState(TEMPLATES[0].marks);
  const [exam, setExam] = useState(`Unit Test (${year})`);
  const [klass, setKlass] = useState(`IG9 ${year}`);
  const [time, setTime] = useState(TEMPLATES[0].time);
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const pickTemplate = (t) => {
    setTpl(t.key);
    setMarks(t.marks);
    setTime(t.time);
    setExam(`${t.exam} (${year})`);
  };

  // questions per sub-chapter (by main topic)
  const counts = useMemo(() => {
    const c = {};
    for (const q of idx.questions) {
      if (q.problem) continue;
      const code = (q.syllabus || [])[0] || "";
      const two = code.split(".").slice(0, 2).join(".");
      c[two] = (c[two] || 0) + 1;
    }
    return c;
  }, [idx]);

  // marks available per section type in the chosen chapters
  const available = useMemo(() => {
    const a = { mcq: 0, theory: 0, atp: 0 };
    if (!topics.length) return a;
    for (const q of idx.questions) if (!q.problem && mainTopicMatch(q, topics)) a[q.type] += q.marks || 0;
    return a;
  }, [idx, topics]);

  const total = SECTION_ORDER.reduce((t, k) => t + (Number(marks[k]) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    const err = {};
    if (!topics.length) err.topics = "Tick at least one chapter.";
    if (!total) err.marks = "Give at least one section some marks.";
    if (!exam.trim()) err.exam = "Give the paper a name, for example “Unit Test 2 (2026-27)”.";
    if (!klass.trim()) err.klass = "Enter the class, for example “IG9 2026-27”.";
    setErrors(err);
    if (Object.keys(err).length) {
      // wait for the messages to render, then bring the first one into view
      setTimeout(() => document.querySelector(".field-error")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setBusy(true);
    const types = SECTION_ORDER.filter((k) => Number(marks[k]) > 0);
    const klassShort = klass.trim().split(/\s+/)[0].toUpperCase();
    let paper = {
      id: newId(),
      name: exam.trim(),
      exam: exam.trim(),
      class: klassShort.startsWith("IG") ? `IGCSE – Class ${klassShort.replace(/\D/g, "") || 9}` : DEFAULTS.class,
      time: time.trim(),
      date: date ? new Date(date).toLocaleDateString("en-GB") : "",
      batch: batchKey(klass),
      footer_code: `TSRS Moulsari/${klassShort}/Physics 0625/${exam.trim()}`,
      template: tpl,
      status: "draft",
      sections: types.map((type, i) => ({ title: sectionTitle(type, i, tpl), type, marks: Number(marks[type]), topics, questions: [] })),
    };
    const saved = await listPapers();
    const seen = seenByClass(idx, givenPapers(idx, saved), paper.batch);
    paper = suggestPaper(idx, paper, seen);
    await savePaper(paper);
    location.hash = `/paper/${encodeURIComponent(paper.id)}`;
  }

  return (
    <form class="newpaper" onSubmit={submit} novalidate>
      <h1>New paper</h1>
      <p class="lead">Answer these four questions, and it will suggest a full paper. You can change everything afterwards.</p>

      <section class="step">
        <h2><span class="num">1</span> What are you making?</h2>
        <div class="choices">
          {TEMPLATES.map((t) => (
            <label class={"choice" + (tpl === t.key ? " selected" : "")} key={t.key}>
              <input type="radio" name="tpl" checked={tpl === t.key} onChange={() => pickTemplate(t)} />
              <strong>{t.name}</strong>
              <span class="muted">{t.desc}</span>
              {t.key !== "custom" && (
                <span class="small">{SECTION_ORDER.reduce((s, k) => s + t.marks[k], 0)} marks · {t.time}</span>
              )}
            </label>
          ))}
        </div>
      </section>

      <section class="step">
        <h2><span class="num">2</span> Which chapters does it cover?</h2>
        <p class="muted">The number next to each chapter is how many questions the bank has for it.</p>
        <TopicChooser idx={idx} selected={topics} onChange={(t) => { setTopics(t); setErrors({ ...errors, topics: null }); }} counts={counts} />
        {errors.topics && <p class="field-error">{errors.topics}</p>}
      </section>

      <section class="step">
        <h2><span class="num">3</span> How many marks for each section?</h2>
        <p class="muted">Put 0 to leave a section out.</p>
        <div class="marks">
          {SECTION_ORDER.map((k) => {
            const want = Number(marks[k]) || 0;
            const short = topics.length > 0 && want > available[k];
            return (
              <div class="mark-row" key={k}>
                <label for={"m-" + k}>{TYPE_NAMES[k]}</label>
                <input id={"m-" + k} type="number" min="0" max="100" step="1" value={marks[k]}
                  onInput={(e) => { setMarks({ ...marks, [k]: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)) }); setErrors({ ...errors, marks: null }); }} />
                <span class="suffix">marks</span>
                {topics.length > 0 && want > 0 && (
                  <span class={short ? "hint warn" : "hint"}>
                    {short ? <><Icon name="warn" size={14} /> Only {available[k]} marks of {TYPE_NAMES[k].toLowerCase()} questions in these chapters</>
                      : `${available[k]} marks available`}
                  </span>
                )}
              </div>
            );
          })}
          <div class="mark-row total"><span>Total</span><strong>{total} marks</strong></div>
        </div>
        {errors.marks && <p class="field-error">{errors.marks}</p>}
      </section>

      <section class="step">
        <h2><span class="num">4</span> Paper details</h2>
        <div class="grid2">
          <label class="field">
            <span>Name of the paper</span>
            <input value={exam} onInput={(e) => setExam(e.currentTarget.value)} placeholder="Unit Test 2 (2026-27)" />
            {errors.exam && <span class="field-error">{errors.exam}</span>}
          </label>
          <label class="field">
            <span>Class</span>
            <input value={klass} onInput={(e) => setKlass(e.currentTarget.value)} placeholder="IG9 2026-27" />
            <span class="muted small">Used so it doesn't repeat questions this class has already had.</span>
            {errors.klass && <span class="field-error">{errors.klass}</span>}
          </label>
          <label class="field">
            <span>Time allowed</span>
            <input value={time} onInput={(e) => setTime(e.currentTarget.value)} placeholder="45 minutes" />
          </label>
          <label class="field">
            <span>Date of the test <span class="muted">(optional)</span></span>
            <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          </label>
        </div>
      </section>

      <div class="submit-bar">
        <button type="submit" class="btn primary big" disabled={busy}>
          {busy ? "Choosing questions…" : <>Suggest questions <Icon name="check" /></>}
        </button>
      </div>
    </form>
  );
}
