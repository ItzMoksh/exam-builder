# exam-builder

Question bank and test-paper builder for IGCSE Physics (Cambridge 0625, Grade 9).
Every question from past papers, worksheets and topical booklets is cropped exactly as printed and
tagged by syllabus point, type, marks, difficulty and ATP skill. Papers are built from those
questions as Word files with the school header, plus a mark scheme.

See [DESIGN.md](DESIGN.md) for the full design and roadmap.

## The web app (for the teacher)

`app/` is the website she uses: choose the chapters and marks, check and swap the suggested questions, and
download the paper and mark scheme in Word. It's hosted free on Cloudflare Pages behind a password, and her
papers are saved online. Setup and updating: [HOSTING.md](HOSTING.md).

## Layout

| Path | What |
|---|---|
| `sources/` | Original files, untouched. `catalog.yaml` describes each one. `specs/` holds the crop and tag spec per source. |
| `inbox/` | Drop new material here. |
| `bank/<id>/` | One question: `meta.yaml`, `q.png` (or `q-1.png`, `q-2.png`), optional `ms.png` mark scheme. |
| `syllabus/` | 0625 topic tree and the ATP skills vocabulary. |
| `blueprints/` | Paper templates (semester exam 80, unit test). |
| `papers/` | Every paper built: which questions, for which batch (used to avoid repeats). |
| `tools/eb.py` | Ingest: `layout`, `render`, `apply`, `sheet`, `index`. |
| `tools/paper.py` | Papers from the command line: `find`, `draft`, `build`. |
| `app/` | Web app (Vite + Preact). `src/suggest.js` and `src/word.js` mirror `paper.py`'s draft and build. |

## Use it with Claude Code

Open this folder in Claude Code and ask in plain words:

- *"Ingest the new files in inbox"* runs the `/ingest` skill.
- *"Make a 30-mark unit test on motion and momentum for IG9: 10 MCQ, 10 theory, 10 ATP"* runs `/build-paper`
  and gives you `out/… - paper.docx` and `out/… - mark scheme.docx`.

## Set up

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python tools\eb.py index
```

## By hand

```powershell
.venv\Scripts\python tools\paper.py find --type atp --topic 2.2
.venv\Scripts\python tools\paper.py draft blueprints\unit-test.yaml --seed 1
.venv\Scripts\python tools\paper.py build papers\unit-test.yaml
```

Content comes from Cambridge, Save My Exams, igexams and others, and is for classroom use only.
Keep this repository private.
