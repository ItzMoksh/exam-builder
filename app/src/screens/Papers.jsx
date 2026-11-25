import { useEffect, useState } from "preact/hooks";
import { batchLabel, deletePaper, listPapers, newId, savePaper } from "../data.js";
import { sectionMarks } from "../suggest.js";
import { downloadMarkScheme, downloadPaper, fmtDate, Icon, Modal } from "../util.jsx";

export function Papers({ idx }) {
  const [papers, setPapers] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => listPapers().then((ps) => setPapers(ps.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))));
  useEffect(() => { load(); }, []);

  async function copy(p) {
    const c = { ...p, id: newId(), name: p.name + " (copy)", exam: (p.exam || p.name) + " (copy)", status: "draft" };
    await savePaper(c);
    location.hash = `/paper/${encodeURIComponent(c.id)}`;
  }

  async function dl(p, kind) {
    setBusy((p.id || p.file) + kind);
    try {
      if (kind === "paper") await downloadPaper(idx, p);
      else await downloadMarkScheme(idx, p);
    } finally {
      setBusy(null);
    }
  }

  // papers already given, recorded in the repository (the school's past exams)
  const school = (idx.papers || []).filter((p) => p.status === "given");
  const marks = (p) => p.sections.reduce((t, s) => t + sectionMarks(idx, s), 0);

  return (
    <div class="papers">
      <div class="title-row">
        <h1>My papers</h1>
        <a href="#/new" class="btn primary"><Icon name="plus" /> New paper</a>
      </div>

      {papers === null ? <p class="loading">Loading…</p> : papers.length === 0 ? (
        <div class="empty">You haven't made any papers yet. <a href="#/new">Make your first paper</a>.</div>
      ) : (
        <div class="list">
          {papers.map((p) => (
            <div class="row" key={p.id}>
              <Icon name="file" />
              <a class="grow" href={`#/paper/${encodeURIComponent(p.id)}`}>
                <strong>{p.name}</strong>
                <span class="muted"> · {batchLabel(p.batch)} · {marks(p)} marks</span>
              </a>
              <span class={"pill " + p.status}>{p.status === "given" ? "Given" : "Draft"}</span>
              <span class="muted small nowrap">{fmtDate(p.updated)}</span>
              <a class="btn small" href={`#/paper/${encodeURIComponent(p.id)}`}><Icon name="edit" size={16} /> Open</a>
              <button class="btn small ghost" onClick={() => copy(p)} title="Make a copy to change for another class"><Icon name="copy" size={16} /> Copy</button>
              <button class="btn small ghost danger" onClick={() => setToDelete(p)}><Icon name="trash" size={16} /> Delete</button>
            </div>
          ))}
        </div>
      )}

      {school.length > 0 && (
        <>
          <h2>School exams already given</h2>
          <p class="muted">These past papers are in the records, so their questions aren't suggested again for the same class.</p>
          <div class="list">
            {school.map((p) => (
              <div class="row" key={p.file}>
                <Icon name="file" />
                <span class="grow"><strong>{p.exam || p.name}</strong><span class="muted"> · {batchLabel(p.batch)} · {marks(p)} marks</span></span>
                <button class="btn small ghost" onClick={() => dl(p, "paper")} disabled={!!busy}>
                  <Icon name="download" size={16} /> {busy === p.file + "paper" ? "Preparing…" : "Paper"}
                </button>
                <button class="btn small ghost" onClick={() => dl(p, "ms")} disabled={!!busy}>
                  <Icon name="download" size={16} /> {busy === p.file + "ms" ? "Preparing…" : "Mark scheme"}
                </button>
                <button class="btn small ghost" onClick={() => copy({ ...p, id: undefined, sections: p.sections.map((s) => ({ ...s, topics: s.topics || [] })) })}>
                  <Icon name="copy" size={16} /> Copy
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {toDelete && (
        <Modal title="Delete this paper?" onClose={() => setToDelete(null)}>
          <p><strong>{toDelete.name}</strong> will be deleted. This can't be undone.</p>
          {toDelete.status === "given" && (
            <p class="note warn">This paper was given to a class. If you delete it, its questions may be suggested to that class again.</p>
          )}
          <div class="modal-foot">
            <button class="btn ghost" onClick={() => setToDelete(null)}>Cancel</button>
            <button class="btn danger-solid" onClick={async () => { await deletePaper(toDelete.id); setToDelete(null); load(); }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
