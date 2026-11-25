# Exam Builder — Design

A question bank for IGCSE Physics (Cambridge 0625, Grade 9) that turns a growing pile of PDFs,
worksheets and phone photos into individually tagged questions, and a builder UI that suggests
questions and assembles a print-ready test paper + mark scheme.

Repo: https://github.com/ItzMoksh/exam-builder (keep it **private** — see Copyright).

---

## 1. What we learned from the current material

| Observation | Design consequence |
|---|---|
| School papers (e.g. `107769_2.pdf`, `109597_1.pdf`) are collages of cropped Cambridge past-paper questions, renumbered by hand (stray "59", "160" left over). Footers still carry the origin, e.g. `0625/22/F/M/24`. | Store each question as a **cropped image** (exactly what she does today), and record the original Cambridge reference → free de-duplication key. |
| Fixed paper shape: Section I MCQ (20) · Section II Theory (40) · Section III ATP (20) = 80 marks, 1h15. Unit tests are smaller (10-mark ATP section). | Papers are built from a **blueprint**: sections × marks × topics. |
| Several files are scans with no text layer (`108374_1`, `110430_1`, `DOC-…WA0017`), plus phone photos of marked scripts. | Ingestion must work from **page images (vision)**, using the PDF text layer only as a helper. |
| Diagrams, tables and answer lines are part of the question (thermometer scales, ATP tables). | Image-first, not retyped text. Text is transcribed alongside, for search only. |
| Mark schemes come separately (igexams MS, SaveMyExams answers inline, her own solution PDFs). | Each question has an optional mark-scheme image/text, matched by source + question number. |
| Worksheets mix study notes with questions (`102561_4`, `110429_2/3`). | Ingest only the questions; notes are skipped (could become a "notes" type later). |
| Syllabus = the textbook contents 1.1 Physical quantities … 1.8 Pressure, 2.1–2.3 Thermal, 3.x Waves … | The **0625 syllabus tree** is the backbone of all tagging. |
| ATP is a focus, and ATP marks are about skills (read a scale, table headings with units, precautions, meniscus/parallax, improve the experiment, gradient…). | ATP questions get an extra **skills** tag set, so you can ask for "ATP on thermal with a table + precaution". |

---

## 2. Architecture

```
            ┌──────────────┐   drop PDFs/photos   ┌──────────────────────────────┐
 Sources ──▶│   inbox/     │ ───────────────────▶ │  INGEST (Claude vision)       │
 (school,   └──────────────┘                      │  render pages → find question │
  igexams,                                        │  boxes → crop → transcribe →  │
  SME, PMT…)                                      │  tag syllabus/type/marks/skill│
                                                  └──────────────┬───────────────┘
                                                                 ▼
                         ┌──────────────────────────────────────────────────────┐
                         │  bank/  one folder per question (meta.yaml + PNGs)   │  ← git = source of truth
                         └──────────────┬───────────────────────────────────────┘
                                        ▼  build step (GitHub Action)
                                 index.json (all metadata + text)
                                        ▼
            ┌────────────────────────────────────────────────────────────┐
            │  BUILDER UI (static web app)                               │
            │  blueprint → suggestions → swap / reorder → export         │
            └──────────────┬─────────────────────────────────────────────┘
                           ▼
            Question paper .docx  +  Mark scheme .docx  +  papers/<name>.yaml (usage record)
```

Everything is files in git. No database until we genuinely need one.

### Repo layout

```
exam-builder/
  syllabus/0625-2026-28.yaml      # topic tree: 1.1 … 6.x, each point core/supplement
  sources/                        # original files, never edited
    catalog.yaml                  # one row per file: title, origin site, year, type, notes
  inbox/                          # drop new material here → ingest picks it up
  bank/
    q00123/
      meta.yaml
      q.png                       # question crop (may be q-1.png, q-2.png if it spans pages)
      ms.png                      # mark scheme crop (optional)
  papers/                         # every built paper: blueprint + chosen question ids
    2026-27-ig9-sa2.yaml
  templates/
    tsrs-paper.docx               # school header, instructions, footer, section headings
  tools/                          # python: ingest, build_index, export_docx
  app/                            # web UI
  .claude/skills/                 # /ingest and /build-paper for Claude Code
```

The bank is **flat with IDs**, not folders per topic, because one question often spans several
syllabus points (e.g. density + pressure).

---

## 3. The question record

```yaml
# bank/q00123/meta.yaml
id: q00123
type: atp                    # mcq | theory | atp
status: reviewed             # draft (fresh from ingest) | reviewed
syllabus: ["2.2.1", "2.3.1"] # 0625 syllabus points
tier: core                   # core | supplement
marks: 10
difficulty: 2                # 1 easy · 2 medium · 3 hard  (AI guess, teacher can override)
skills: [read-thermometer, table-headings-units, calc-rate, suggest-improvement,
         precaution, meniscus]          # ATP only
answer: null                 # MCQ key, e.g. "C"
parts:                       # lets the UI show part marks and later allow dropping parts
  - {label: "a",    marks: 1}
  - {label: "b(i)", marks: 1}
  - …
source:
  file: sources/109597_1.pdf
  pages: [9, 10]
  question_no: "2"
  origin: "0625/62/M/J/23 Q2"   # Cambridge ref when known → de-dup key
  site: igexams | savemyexams | papacambridge | pmt | school | own
images: {question: [q-1.png, q-2.png], markscheme: [ms.png]}
text: |                      # transcription, used for search only
  A student investigates the cooling of water…
```

**Cropping rule:** crops start *after* the printed question number, so the builder can number
questions 1, 2, 3… itself — no more hand-fixing "59" and "160".

**Usage history** lives in `papers/*.yaml`, not in the question, so the UI can say
"used in Sem-1 2025-26 (IG9)" and avoid repeating questions for the same batch.

---

## 4. Ingestion

Run as a Claude Code skill (`/ingest`) at first: no servers, no API bill, and you can watch it work.

1. **Register** the file in `sources/catalog.yaml` (site, year, type; asks if unclear).
2. **Render** every page to PNG at ~200 DPI.
3. **Locate questions.** If the PDF has a text layer, find anchors with coordinates
   (`1 `, `2 `, `(a)`, `[Total: 10]`, `0625/22/F/M/24` footers). For scans and photos, Claude
   vision returns the bounding boxes. Questions that run across pages become multi-image.
4. **Crop + transcribe + tag**: type, marks (from `[n]` brackets), syllabus points, tier,
   difficulty, ATP skills, Cambridge origin.
5. **Match mark schemes** by origin/question number (igexams MS files, SME inline answers,
   her own solution PDFs).
6. **De-duplicate** on Cambridge origin, then on normalised text similarity: the same Cambridge
   question shows up on igexams, SME and in school papers.
7. Write everything as `status: draft`. A **review queue** in the UI shows draft questions
   next to their source page; she fixes tags or crops with a click and marks them reviewed.

Honest caveat: AI bounding boxes can be a few pixels off, especially on phone photos. The
review step lets you nudge a crop. Clean PDFs from igexams/PapaCambridge will be much better
than WhatsApp photos.

Later (Phase 2): uploading from the UI drops the file into `inbox/`, and a GitHub Action runs the
same ingest through the Claude API.

---

## 5. Builder UI — the core loop

1. **Start from a blueprint.** Pick a template ("Semester exam 80" = MCQ 20 / Theory 40 / ATP 20,
   "Unit test ATP 10", or custom) and tick the syllabus points covered (like the ticks on the
   contents page: 1.1–1.6).
2. **Get suggestions.** For each section the app fills the marks with suggested questions:
   spread across the ticked topics, mixed difficulty, preferring reviewed and **unused** questions,
   no two near-duplicates.
3. **Adjust.** Every slot has *swap* (next-best alternative), *remove* and *lock*. A side panel
   searches the whole bank (filters + free text: "meniscus", "cooling curve") to add anything by hand.
   Running totals show marks per section, the topic spread and the difficulty mix, and warn when
   something is off target.
4. **Export.**
   - Question paper `.docx` using the school template (header, instructions, section headings,
     footer `TSRS Moulsari/…`), questions renumbered, crops inserted at the right width.
     Word, because she will want to tweak before printing.
   - Mark scheme `.docx` in the same order, plus an MCQ answer key.
   - `papers/<name>.yaml` saved, so the questions count as used.

Suggestion logic, by phase:
- **v1, rules:** filter by type/topic/tier, then a greedy fill to hit marks per section and per
  topic, a difficulty mix of about 30/50/20, and "not used for this batch".
- **v2, ask in plain words:** "20-mark ATP on thermal physics, one graph question, nothing from
  last year". Claude reads `index.json`, proposes a paper, and it opens in the same editor.
- **v3:** "more like this" (similar-question search on text), gaps report ("no supplement
  questions on 2.3 yet"), and generating new variants with changed numbers, clearly flagged.

---

## 6. Hosting and access

- **Data:** the private GitHub repo. Question PNGs run about 50–200 KB, so 10,000 questions is
  still comfortably under GitHub's limits. If `sources/` grows past roughly 1 GB, move the
  originals to Git LFS or Drive and keep only the crops in git.
- **UI:** a static app (Vite + React), with `index.json` built by a GitHub Action on every push.
  - *Phase 1:* run it locally (`npm run dev`) or as a desktop page you open for her.
  - *Phase 2:* Cloudflare Pages (free, deploys from private repos), behind Cloudflare Access so
    only her email can open it. A small Worker holds the GitHub token, so the UI can save papers
    and review edits back to the repo, and the Claude API key for v2 "ask".

---

## 7. Copyright

Cambridge past papers, SaveMyExams, PMT and igexams material is copyrighted and licensed for
personal and classroom use. Keep the repo and the hosted UI private (login-gated), don't publish
the bank, and keep the `site` field so the origin of every question stays traceable.

---

## 8. Phased plan

| Phase | Deliverable | Proves |
|---|---|---|
| **0, this week** | Repo scaffold, `syllabus/0625` tree, schema, ingest the current 19 files with `/ingest`. `/build-paper` in Claude Code produces a .docx from a request in plain words. | That the data model and crops are good enough on real material, before building UI. |
| **1** | Builder UI: browse/search/filter, blueprint auto-fill with swap/lock, Word export + mark scheme, usage tracking, review queue. Runs locally. | That she can build a paper herself in about 10 minutes. |
| **2** | Hosted with login, upload-from-UI → ingest by GitHub Action, saving from the UI. | That she can use it without you. |
| **3** | Ask in plain words, similar questions, gap report, variants, other grades/subjects (the syllabus file is the only thing that changes). | Scale. |

## 9. Open decisions

1. **Who drives the UI day to day?** She does (pushes Phase 2 hosting earlier), or you do it for
   her (local is fine for a while).
2. **Export format:** Word (assumed, editable) and/or PDF (fixed).
3. **Granularity:** whole questions only, or let her pick sub-parts (e.g. only (a)–(c) of an ATP
   question)? Proposal: whole questions in v1; `parts` is recorded now so sub-parts can come later.
4. **Other grades and subjects soon?** If yes, add `course: ig9-physics` to every record from day one.
