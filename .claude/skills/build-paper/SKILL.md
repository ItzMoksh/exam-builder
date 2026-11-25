---
name: build-paper
description: Build a test paper and mark scheme (Word) from the question bank. Use when asked to make, build, draft or set a test, paper, exam, worksheet or quiz, or to suggest or swap questions for one.
---

# Build a test paper from the bank

Python: `.venv/Scripts/python` from the repo root. Always start with
`.venv/Scripts/python tools/eb.py index` so `index.json` is current.

## 1. Pin down the request

You need: which sections (MCQ / theory / ATP), the marks for each, the syllabus topics
(codes from `syllabus/0625-2026-28.yaml`; map words like "density" or "momentum" to codes), the
batch (e.g. `ig9-2026-27`, used to avoid repeating questions), and the exam name and time.
Templates live in `blueprints/` (semester exam 80, unit test). Ask only for what you can't infer
sensibly. A plain-words request ("20-mark ATP test on thermal for IG9") is usually enough.

## 2. Draft

Write `blueprints/<name>.yaml` (copy a template, set `name`, `exam`, `time`, `batch`,
`footer_code`, and per section `type`, `marks`, `topics`), then:

```
.venv/Scripts/python tools/paper.py draft blueprints/<name>.yaml --seed 1
```

It fills each section with suggestions into `papers/<name>.yaml`: topics spread, a difficulty mix
of about 30/50/20 by marks, questions already used for the batch avoided, and the same Cambridge
question never included twice. If a section comes up short, the bank lacks material: say so.

## 3. Review like a teacher, then adjust

Look at what it chose (`tools/paper.py find --topic ...` lists alternatives with marks, difficulty
and a text preview; question images are in `bank/<id>/q*.png`). Check:
- **Coverage:** every requested topic appears, and nothing off-syllabus slipped in.
- **No near-duplicates:** two questions testing the same idea with the same diagram.
- **Order:** within a section, easier questions first.
- **Special requests:** "one graph question" means a question with the `plot-graph` skill, and so on.

Edit `papers/<name>.yaml` directly to swap, reorder or lock questions. Sections that already
have `questions:` are kept as they are if you re-run `draft`.

## 4. Build

```
.venv/Scripts/python tools/paper.py build papers/<name>.yaml
```

This writes `out/<name> - paper.docx` and `out/<name> - mark scheme.docx`: school header,
instructions, section headings with marks, questions renumbered 1..n, and the footer.

## 5. Report

Give the file paths, then one line per question: new number, id, topic, marks and difficulty.
List the mark-scheme items the build flagged (answers worked out by Claude, or no mark
scheme) so the teacher checks them.

`papers/<name>.yaml` starts as `status: draft`. Once the paper has actually been given to students,
set `status: given` and re-run `eb.py index`. From then on its questions count as used for that
batch, and so do copies of them from other sources. Delete drafts that were never used.
