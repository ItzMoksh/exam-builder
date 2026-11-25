---
name: ingest
description: Turn a source file (exam paper, worksheet, topical booklet, scan or photo) into individually cropped and tagged questions in bank/. Use when new material is added to inbox/ or sources/, or when asked to ingest, add or import questions.
---

# Ingest questions into the bank

Goal: every question in a source becomes `bank/<slug>-<nn>/` with a cropped image of the question
exactly as printed (diagrams, tables, answer lines included, the old question number removed) plus
tags. Geometry and tags live in a spec file, `sources/specs/<slug>.yaml`, so crops can be redone.

Python: `.venv/Scripts/python` (Windows) from the repo root. Tool: `tools/eb.py`.

## 1. Register the source

New files go from `inbox/` to `sources/` (keep the original filename). Add a row to
`sources/catalog.yaml`: `slug` (short, kebab-case, stable), `file`, `kind`, `site`, `title`.
Look at page 1 to work out what it is. If the site or year is unclear, say so in `title`.

## 2. Read the layout

```
.venv/Scripts/python tools/eb.py layout <slug> --pages 1-4
```

Per page it prints, in PDF points (origin top-left):
- `TXT y a-b x c text`: text lines. Question numbers are lines whose x is at the left margin
  (about 36-72) and whose text is a bare number, or starts one.
- `IMG y a-b x c-d`: pasted images. School "collage" papers are Cambridge questions pasted in as
  image strips, so strips do NOT line up with questions.
- `GAPS a-b ...`: blank horizontal bands. **Always cut inside a gap**, so no line of text is
  sliced.

Pages with no or little text (scans, photos, collages) need eyes: render and view them.
```
.venv/Scripts/python tools/eb.py render <slug> --pages 5
```
Then Read `.cache/pages/<slug>/p005.png`. It is rendered at 200 DPI, so pixel / 2.778 = points.
Combine what you see with GAPS to pick exact y values.

## 3. Write the spec

`sources/specs/<slug>.yaml`:

```yaml
source: sem1-2024-25          # catalog slug
site: school
origin: 0625/22/F/M/24        # optional default Cambridge ref; per-question `origin` overrides
questions:
  - n: "07"                   # running number in this source, 2 digits -> id sem1-2024-25-07
    qno: 7                    # number as printed
    type: mcq                 # mcq | theory | atp
    marks: 1
    parts:                    # theory/atp only: one row per marked part
      - {label: "a(i)", marks: 1}
    syllabus: ["1.6"]         # most specific codes from syllabus/0625-2026-28.yaml, several if needed
    tier: core                # core | supplement
    difficulty: 2             # 1 easy, 2 medium, 3 hard (for a Grade 9 IGCSE student)
    skills: [read-scale, table-headings-units]   # ATP only, ONLY keys from atp_skills in the syllabus file
    answer: C                 # MCQ key
    answer_by: claude         # set when YOU worked the answer out (no key in the source)
    origin: 0625/22/F/M/24 Q7 # Cambridge paper code if printed (footer) or obvious
    segments:                 # one per page the question spans, in order
      - {page: 4, y0: 58, y1: 320, x0: 65}
    mask:                     # optional white-out boxes, e.g. an old number you can't crop away
      - {page: 4, x0: 40, y0: 60, x1: 62, y1: 76}
    ms:                       # optional mark scheme: crop from another source and/or text
      source: ms-hookes-law-atp
      segments: [{page: 2, y0: 80, y1: 300}]
      text: "l0 = 55 mm; 4, 9, 14, 19, 23 ecf ..."
    notes: "Part (d) refers to Fig. 2.3 on the previous page."
    text: |                   # faithful transcription for search: stem, parts, MCQ options; describe diagrams briefly
      ...
```

Cropping rules:
- **y0** sits in the gap just above the question's first line. **y1** sits in the gap just below its last
  line, including answer lines, tables, the `[n]` marks and `[Total: n]`.
- Never include page headers or footers: page numbers, `© UCLES`, `[Turn over`, school
  motto and footer lines, "SECTION I" headings, website banners.
- **Remove the printed question number** by setting `x0` between the number and the question body
  (Cambridge text: number at x≈50, body at x≈71, so x0 = 65). Check that no diagram or table
  starts left of x0. If one does, keep x0 smaller and `mask` the number instead. Keep part
  labels (a), (b)(i): those stay.
- A question that continues on the next page gets one segment per page.
- One question = one numbered question with all its parts. Don't split parts into separate
  questions.
- Skip things that are not questions: study notes, definitions, worked examples, instructions,
  blank pages, OMR sheets.
- Photos of marked student scripts are not ingested (handwriting); note them in the catalog.

Tagging rules:
- `type`: **atp** = practical context (readings from apparatus, tables, graphs from experiment data,
  method, precautions, improvements), i.e. Paper 6 style and school "Section III". **theory** =
  structured written questions (Paper 4, Section II). **mcq** = A/B/C/D.
- `marks`: sum of the `[n]` brackets (or the `[Total]`). MCQ = 1.
- `tier: supplement` only when the question needs supplement-only content (extended syllabus).
  If unsure, use core.
- MCQ answers: take them from a key in the source if there is one (no `answer_by`). Otherwise
  solve the question carefully and set `answer_by: claude`. If you are not confident, leave
  `answer` empty and say why in `notes`.
- `text` is for search. Be faithful and complete enough that a search for a key term finds it.

## 4. Apply and check, every time

```
.venv/Scripts/python tools/eb.py apply sources/specs/<slug>.yaml
.venv/Scripts/python tools/eb.py sheet sources/specs/<slug>.yaml
```
`sheet` prints one or more PNG paths. **Read every sheet image** and check each crop: nothing cut
off at the top, bottom or right; no part of the neighbouring question; no headers or footers; old
number gone. Fix the spec and re-apply until clean. `apply` overwrites draft questions but never
touches `status: reviewed` ones (unless `--force`).

## 5. Finish

- `.venv/Scripts/python tools/eb.py index` rebuilds `index.json` (do this once, at the end).
- Report: questions per type, anything skipped and why, and every `answer_by: claude` or empty
  answer, so the teacher knows what to check.
