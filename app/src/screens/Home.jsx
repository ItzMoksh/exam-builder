import { useEffect, useState } from "preact/hooks";
import { listPapers, batchLabel } from "../data.js";
import { Divider, Icon, Lotus, fmtDate } from "../util.jsx";

const STEPS = [
  ["Choose", "The type of paper, its chapters and the marks for each section."],
  ["Check", "Swap or remove any suggested question, or add your own picks."],
  ["Download", "The question paper and mark scheme as Word files, ready to print."],
  ["Mark as given", "After the test, so its questions aren't repeated for that class."],
];

export function Home({ idx }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    listPapers().then((ps) => setRecent(ps.sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).slice(0, 4)));
  }, []);
  const counts = idx.questions.reduce((c, q) => ({ ...c, [q.type]: (c[q.type] || 0) + 1 }), {});

  return (
    <div class="home">
      <section class="hero">
        <p class="sanskrit" lang="sa">विद्या ददाति विनयम्</p>
        <p class="eyebrow">Knowledge gives humility</p>
        <h1>Make a physics test paper</h1>
        <p class="lead">Choose the chapters, check the questions it suggests, and download the paper and mark scheme in Word.</p>
        <a href="#/new" class="btn primary big"><Icon name="kalash" size={22} /> Make a new paper</a>
        <p class="muted small">
          {idx.questions.length} questions in the bank · {counts.mcq || 0} multiple choice · {counts.theory || 0} theory ·{" "}
          {counts.atp || 0} alternative to practical
        </p>
      </section>

      <Divider />

      {recent.length > 0 && (
        <section>
          <h2>Your recent papers</h2>
          <div class="list">
            {recent.map((p) => (
              <a class="row" href={`#/paper/${encodeURIComponent(p.id)}`} key={p.id}>
                <Lotus />
                <span class="grow"><strong>{p.name}</strong><span class="muted"> · {batchLabel(p.batch)}</span></span>
                <span class={"pill " + p.status}>{p.status === "given" ? "Given" : "Draft"}</span>
                <span class="muted small">{fmtDate(p.updated)}</span>
              </a>
            ))}
          </div>
          <a href="#/papers" class="link">See all papers</a>
        </section>
      )}

      <section>
        <h2>How it works</h2>
        <ol class="arch-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span class="num">{i + 1}</span>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section class="tiles">
        <a href="#/browse" class="tile">
          <span class="tile-icon"><Icon name="book" size={26} /></span>
          <span><strong>Look through the question bank</strong><span class="muted">Search every question and see its answer.</span></span>
        </a>
        <a href="#/papers" class="tile">
          <span class="tile-icon teal"><Icon name="folder" size={26} /></span>
          <span><strong>My papers</strong><span class="muted">Open, copy or download papers you made before.</span></span>
        </a>
      </section>

      <footer class="site-foot">
        <Divider />
        <span class="sanskrit" lang="sa">तमसो मा ज्योतिर्गमय</span>
        <span>From darkness, lead me to light</span>
      </footer>
    </div>
  );
}
