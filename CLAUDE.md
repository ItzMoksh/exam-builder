# exam-builder

Question bank and paper builder for IGCSE Physics 0625 (Grade 9, TSRS Moulsari). Design: DESIGN.md.

- Python: `.venv/Scripts/python` (create with `python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt`).
- Adding material: `/ingest` skill (`.claude/skills/ingest/SKILL.md`). Building a test: `/build-paper` skill.
- `bank/<id>/meta.yaml` is the source of truth for a question; `index.json` is generated (`tools/eb.py index`), so never hand-edit it.
- Questions with `status: reviewed` were checked by the teacher: don't change their tags without being asked.
- `answer_by: claude` marks answers Claude worked out. Never present them as an official key.
- Content is copyrighted (Cambridge, Save My Exams, igexams…): the repo stays private.
