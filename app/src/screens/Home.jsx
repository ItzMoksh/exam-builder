import { useEffect, useState } from "preact/hooks";
import { listPapers, batchLabel } from "../data.js";
import { Icon, fmtDate } from "../util.jsx";

export function Home({ idx }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    listPapers().then((ps) => setRecent(ps.sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).slice(0, 4)));
  }, []);
  const counts = idx.questions.reduce((c, q) => ({ ...c, [q.type]: (c[q.type] || 0) + 1 }), {});

  return (
    <div class="home">
      <section class="hero">
        <h1>Make a physics test paper</h1>
        <p class="lead">Choose the chapters, check the questions it suggests, and download the paper and mark scheme in Word.</p>
        <a href="#/new" class="btn primary big"><Icon name="plus" /> Make a new paper</a>
        <p class="muted small">
          {idx.questions.length} questions in the bank: {counts.mcq || 0} multiple choice, {counts.theory || 0} theory,{" "}
          {counts.atp || 0} alternative to practical.
        </p>
      </section>

      {recent.length > 0 && (
        <section>
          <h2>Your recent papers</h2>
          <div class="list">
            {recent.map((p) => (
              <a class="row" href={`#/paper/${encodeURIComponent(p.id)}`} key={p.id}>
                <Icon name="file" />
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
        <ol class="steps">
          <li><strong>Choose</strong> the type of paper, the chapters it covers and the marks for each section.</li>
          <li><strong>Check</strong> the questions it suggests. Swap or remove any you don't like, or add your own picks from the question bank.</li>
          <li><strong>Download</strong> the question paper and mark scheme as Word files. Change anything you like in Word before printing.</li>
          <li>After the test, press <strong>Mark as given</strong>, so those questions aren't suggested again for that class.</li>
        </ol>
      </section>

      <section class="tiles">
        <a href="#/browse" class="tile"><Icon name="book" size={22} /><strong>Look through the question bank</strong>
          <span class="muted">Search all questions and see their answers.</span></a>
        <a href="#/papers" class="tile"><Icon name="folder" size={22} /><strong>My papers</strong>
          <span class="muted">Open, copy or download papers you made before.</span></a>
      </section>
    </div>
  );
}
