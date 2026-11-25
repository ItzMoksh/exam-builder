"""Find questions, draft a paper from a blueprint, build Word files.

  python tools/paper.py find [--type mcq] [--topic 1.2,1.6] [--q meniscus] [--skill gradient]
                             [--batch ig9-2026-27] [--difficulty 1-2]
  python tools/paper.py draft <blueprint.yaml> [--out papers/<name>.yaml] [--seed N]
  python tools/paper.py build papers/<name>.yaml        -> out/<name> - paper.docx, out/<name> - mark scheme.docx

Reads index.json (run `python tools/eb.py index` first).

Blueprint = a paper file whose sections say what they need instead of listing questions:
  sections:
    - {title: "Section I – Multiple Choice Questions", type: mcq, marks: 10, topics: ["1.2", "1.6"]}
A drafted paper is the same file with `questions:` filled in. Edit freely, then build.
"""
from __future__ import annotations

import argparse
import difflib
import json
import random
import re
import sys
from pathlib import Path

import yaml
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
DPI = 200

DEFAULTS = {
    "school": "THE SHRI RAM SCHOOL – MOULSARI",
    "class": "IGCSE – Class 9",
    "subject": "Physics",
    "code": "0625",
    "motto": "Integrity        Sensitivity        Pride in One's Heritage        Pursuit of Excellence",
    "instructions": [
        "Answer all questions.",
        "Use a black or dark blue pen. You may use an HB pencil for any diagrams or graphs.",
        "Do not use an erasable pen or correction fluid.",
        "You may use a calculator.",
        "You should show all your working and use appropriate units.",
        "Use value of 'g' = 10 m/s² for your calculations.",
        "The number of marks for each question or part question is shown in brackets [ ].",
    ],
}


def load_index() -> dict:
    p = ROOT / "index.json"
    if not p.exists():
        sys.exit("index.json missing: run  python tools/eb.py index")
    return json.loads(p.read_text(encoding="utf-8"))


def topic_match(codes: list[str], topics: list[str] | None) -> bool:
    if not topics:
        return True
    return any(c == t or c.startswith(t + ".") or t.startswith(c + ".") for c in codes for t in topics)


def norm_origin(o: str | None) -> str | None:
    return re.sub(r"\s+", "", o).lower() if o else None


def norm_text(t: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def similar(a: str, b: str) -> bool:
    """Same question from another source (no Cambridge ref to compare): near-identical text."""
    if len(a) < 40 or len(b) < 40:
        return False
    m = difflib.SequenceMatcher(None, a, b)
    return m.quick_ratio() > 0.9 and m.ratio() > 0.85


def used_for(q: dict, batch: str | None, papers: list[dict]) -> list[str]:
    if not batch:
        return q.get("used_in", [])
    return [p["name"] for p in papers
            if p.get("batch") == batch and p.get("status") == "given" and q["id"] in p["questions"]]


# ---------------------------------------------------------------- find

def filter_questions(idx, a) -> list[dict]:
    qs = idx["questions"]
    topics = a.topic.split(",") if a.topic else None
    lo, hi = (1, 3)
    if a.difficulty:
        lo, _, hi = a.difficulty.partition("-")
        lo, hi = int(lo), int(hi or lo)
    out = []
    for q in qs:
        if a.type and q["type"] != a.type:
            continue
        if not topic_match(q.get("syllabus", []), topics):
            continue
        if q.get("difficulty") and not lo <= q["difficulty"] <= hi:
            continue
        if a.skill and a.skill not in (q.get("skills") or []):
            continue
        if a.q and a.q.lower() not in (q.get("text") or "").lower() + " " + q["id"]:
            continue
        out.append(q)
    return out


def cmd_find(a):
    idx = load_index()
    for q in filter_questions(idx, a):
        used = used_for(q, a.batch, idx["papers"])
        text = re.sub(r"\s+", " ", q.get("text") or "")[:70]
        print(f"{q['id']:32s} {q['type']:6s} {str(q.get('marks')):>3}m d{q.get('difficulty') or '?'} "
              f"{','.join(q.get('syllabus', [])):14s} {'USED ' if used else ''}{text}")


# ---------------------------------------------------------------- draft

DIFF_MIX = {1: 0.3, 2: 0.5, 3: 0.2}


def fill_section(sec: dict, pool: list[dict], taken: set, origins: set, texts: list, batch, papers, rng) -> tuple[list[str], int]:
    target = sec["marks"]
    topics = sec.get("topics")
    # Match on the question's main topic (its first syllabus code), so a thermal question that
    # mentions density in passing doesn't land in a forces paper. Flagged questions never suggested.
    cands = [q for q in pool if q["type"] == sec["type"] and q["id"] not in taken and q.get("marks")
             and not q.get("problem") and topic_match(q.get("syllabus", [])[:1], topics)]
    rng.shuffle(cands)
    # What this batch has already seen, including copies of it from other sources.
    seen = [q for q in pool if batch and used_for(q, batch, papers)]
    seen_origins = {norm_origin(q.get("source", {}).get("origin")) for q in seen} - {None}
    seen_texts = [norm_text(q.get("text")) for q in seen if q["type"] == sec["type"]]

    def already_seen(q) -> bool:
        if used_for(q, batch, papers) or norm_origin(q.get("source", {}).get("origin")) in seen_origins:
            return True
        t = norm_text(q.get("text"))
        return any(similar(t, s) for s in seen_texts)

    def score(q, got_by_topic, got_by_diff, remaining):
        s = 0.0
        if q["id"] in repeat:
            s -= 100                                   # avoid repeats for this batch
        elif q.get("used_in"):
            s -= 1                                     # slight preference for never-used questions
        if q.get("status") == "reviewed":
            s += 3
        if q["images"].get("markscheme") or q.get("markscheme_text") or (q.get("answer") and not q.get("answer_by")):
            s += 1                                     # has a real mark scheme / key
        same_origin = norm_origin(q.get("source", {}).get("origin")) in origins
        if same_origin or any(similar(norm_text(q.get("text")), t) for t in texts):
            s -= 50                                    # same question already in the paper
        if topics:                                     # spread over the requested topics
            hit = [t for t in topics if topic_match(q.get("syllabus", []), [t])]
            s += 8 * max((1 / (1 + got_by_topic.get(t, 0)) for t in hit), default=0)
        d = q.get("difficulty") or 2
        want = DIFF_MIX[d] * target - got_by_diff.get(d, 0)
        s += 2 * (want > 0) + (1 if q["marks"] == remaining else 0)
        return s

    repeat = {q["id"] for q in cands if already_seen(q)}
    chosen, got, by_topic, by_diff = [], 0, {}, {}
    while got < target:
        remaining = target - got
        fits = [q for q in cands if q["id"] not in taken and q["marks"] <= remaining]
        if not fits:
            break
        q = max(fits, key=lambda q: score(q, by_topic, by_diff, remaining))
        chosen.append(q["id"])
        taken.add(q["id"])
        if o := norm_origin(q.get("source", {}).get("origin")):
            origins.add(o)
        texts.append(norm_text(q.get("text")))
        got += q["marks"]
        for t in topics or []:
            if topic_match(q.get("syllabus", []), [t]):
                by_topic[t] = by_topic.get(t, 0) + 1
        d = q.get("difficulty") or 2
        by_diff[d] = by_diff.get(d, 0) + q["marks"]
    diff = {q["id"]: q.get("difficulty") or 2 for q in cands}
    chosen.sort(key=lambda qid: diff[qid])  # easier questions first
    return chosen, got


def cmd_draft(a):
    idx = load_index()
    bp = yaml.safe_load(Path(a.blueprint).read_text(encoding="utf-8"))
    rng = random.Random(a.seed)
    taken: set = set()
    origins: set = set()
    texts: list = []
    byid = {q["id"]: q for q in idx["questions"]}
    for sec in bp["sections"]:
        if sec.get("questions"):  # already chosen / locked
            taken.update(sec["questions"])
            for qid in sec["questions"]:
                q = byid.get(qid, {})
                if o := norm_origin(q.get("source", {}).get("origin")):
                    origins.add(o)
                texts.append(norm_text(q.get("text")))
            continue
        ids, got = fill_section(sec, idx["questions"], taken, origins, texts, bp.get("batch"), idx["papers"], rng)
        sec["questions"] = ids
        flag = "" if got == sec["marks"] else f"  <-- only {got} of {sec['marks']} marks found"
        print(f"{sec['title']}: {len(ids)} questions, {got}/{sec['marks']} marks{flag}")
    bp["status"] = "draft"  # set to "given" once the paper has been used with students
    out = (Path(a.out) if a.out else ROOT / "papers" / (Path(a.blueprint).stem + ".yaml")).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(yaml.dump(bp, sort_keys=False, allow_unicode=True, width=100), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}  (edit it, then: python tools/paper.py build {out.relative_to(ROOT)})")


# ---------------------------------------------------------------- Word helpers

def set_cell_margins(table, top=40, bottom=40, left=40, right=40):
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for k, v in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        el = OxmlElement(f"w:{k}")
        el.set(qn("w:w"), str(v))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblPr.append(mar)


def no_split(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    trPr.append(el)


def add_page_field(par):
    run = par.add_run()
    for tag, text in (("begin", None), (None, "PAGE"), ("end", None)):
        if tag:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), tag)
        else:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = text
        run._r.append(el)


def new_document(paper: dict, subtitle: str | None = None) -> Document:
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(1.6)
    sec.top_margin, sec.bottom_margin = Cm(1.4), Cm(1.6)
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(11)
    st.paragraph_format.space_after = Pt(0)
    # footer: code + page, motto
    f = sec.footer.paragraphs[0]
    f.text = ""
    for pos in (Inches(3.25), Inches(6.5)):  # Footer style's default centre/right tabs
        f.paragraph_format.tab_stops.add_tab_stop(pos, WD_TAB_ALIGNMENT.CLEAR)
    f.paragraph_format.tab_stops.add_tab_stop(Cm(17.8), WD_TAB_ALIGNMENT.RIGHT)
    r = f.add_run(paper.get("footer_code", ""))
    r.font.size = Pt(9)
    f.add_run("\tPage ").font.size = Pt(9)
    add_page_field(f)
    m = sec.footer.add_paragraph(paper["motto"])
    m.alignment = WD_ALIGN_PARAGRAPH.CENTER
    m.runs[0].font.size = Pt(8)
    m.runs[0].font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    def line(text, size=12, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER):
        p = doc.add_paragraph()
        p.alignment = align
        run = p.add_run(text)
        run.bold, run.font.size = bold, Pt(size)
        return p

    line(paper["school"], 14)
    if paper.get("exam"):
        line(paper["exam"], 12)
    line(paper["class"], 11)
    if subtitle:
        line(subtitle, 12)
    p = doc.add_paragraph()
    p.paragraph_format.tab_stops.add_tab_stop(Cm(17.8), WD_TAB_ALIGNMENT.RIGHT)
    p.add_run(f"Subject: {paper['subject']}    Subject code: {paper['code']}").bold = True
    p.add_run(f"\tMax. Marks: {paper['max_marks']}").bold = True
    p = doc.add_paragraph()
    p.paragraph_format.tab_stops.add_tab_stop(Cm(17.8), WD_TAB_ALIGNMENT.RIGHT)
    if paper.get("date"):
        p.add_run(f"Date: {paper['date']}")
    if paper.get("time"):
        p.add_run(f"\tMax. Time: {paper['time']}").bold = True
    return doc


def image_width_cm(path: Path, max_cm: float) -> float:
    with Image.open(path) as im:
        native = im.width / DPI * 2.54
    return min(native, max_cm)


# ---------------------------------------------------------------- build

def resolve_paper(path: Path) -> tuple[dict, list[tuple[dict, list[dict]]]]:
    paper = {**DEFAULTS, **yaml.safe_load(path.read_text(encoding="utf-8"))}
    idx = load_index()
    byid = {q["id"]: q for q in idx["questions"]}
    sections, missing = [], []
    for s in paper["sections"]:
        qs = []
        for qid in s.get("questions") or []:
            (qs.append(byid[qid]) if qid in byid else missing.append(qid))
        sections.append((s, qs))
    if missing:
        sys.exit(f"unknown question ids: {missing}")
    paper["max_marks"] = sum(q.get("marks") or 0 for _, qs in sections for q in qs)
    return paper, sections


def build_question_paper(paper, sections, out: Path):
    doc = new_document(paper)
    p = doc.add_paragraph()
    p.add_run("Name: ______________________________   Section: ________   Roll No.: ________")
    p.paragraph_format.space_before = Pt(10)
    h = doc.add_paragraph()
    h.paragraph_format.space_before = Pt(10)
    h.add_run("INSTRUCTIONS").bold = True
    for ins in paper["instructions"]:
        doc.add_paragraph(ins, style="List Bullet")
    if len(sections) > 1:
        doc.add_paragraph()
        doc.add_paragraph().add_run("This question paper has the following sections:").bold = True
        for s, qs in sections:
            doc.add_paragraph(f"{s['title']} – {sum(q.get('marks') or 0 for q in qs)} marks", style="List Bullet")

    text_w = 21 - 3.2
    num_w = 1.0
    n = 0
    for s, qs in sections:
        marks = sum(q.get("marks") or 0 for q in qs)
        hp = doc.add_paragraph()
        hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        hp.paragraph_format.space_before = Pt(14)
        hp.paragraph_format.space_after = Pt(6)
        hp.paragraph_format.keep_with_next = True
        r = hp.add_run(f"{s['title'].upper()}   [{marks}]")
        r.bold, r.font.size = True, Pt(12)
        t = doc.add_table(rows=0, cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        t.autofit = False
        set_cell_margins(t)
        for q in qs:
            n += 1
            files = [ROOT / q["dir"] / f for f in q["images"]["question"]]
            for i, f in enumerate(files):
                row = t.add_row()
                no_split(row)
                c0, c1 = row.cells
                c0.width, c1.width = Cm(num_w), Cm(text_w - num_w)
                if i == 0:
                    rp = c0.paragraphs[0]
                    rr = rp.add_run(str(n))
                    rr.bold, rr.font.size = True, Pt(11)
                    rp.paragraph_format.space_before = Pt(6)
                ip = c1.paragraphs[0]
                ip.paragraph_format.space_before = Pt(4)
                ip.paragraph_format.space_after = Pt(10)
                # Hold a crop with the next only if it is short (a one-line stem): chaining big crops makes
                # a block taller than a page and Word then strands the section heading.
                if i < len(files) - 1 and Image.open(f).height / DPI * 2.54 < 8:
                    ip.paragraph_format.keep_with_next = True
                    rp0 = c0.paragraphs[0]
                    rp0.paragraph_format.keep_with_next = True
                ip.add_run().add_picture(str(f), width=Cm(image_width_cm(f, text_w - num_w - 0.2)))
    doc.add_paragraph()
    end = doc.add_paragraph("— End of paper —")
    end.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.save(out)


def build_mark_scheme(paper, sections, out: Path):
    doc = new_document(paper, "MARK SCHEME")
    text_w = 21 - 3.2
    n = 0
    to_check = []
    for s, qs in sections:
        hp = doc.add_paragraph()
        hp.paragraph_format.space_before = Pt(14)
        hp.paragraph_format.space_after = Pt(6)
        hp.paragraph_format.keep_with_next = True
        r = hp.add_run(s["title"].upper())
        r.bold, r.font.size = True, Pt(12)
        mcqs = [q for q in qs if q["type"] == "mcq"]
        if mcqs and len(mcqs) == len(qs):
            t = doc.add_table(rows=1, cols=3)
            t.style = "Table Grid"
            for c, h in zip(t.rows[0].cells, ("Q", "Answer", "Note")):
                c.paragraphs[0].add_run(h).bold = True
            for q in qs:
                n += 1
                row = t.add_row().cells
                row[0].text = str(n)
                row[1].text = q.get("answer") or "?"
                note = ""
                if q.get("answer_by") == "claude":
                    note = "worked out by Claude, check"
                    to_check.append(n)
                elif not q.get("answer"):
                    note = "no key in bank"
                    to_check.append(n)
                row[2].text = note
            continue
        for q in qs:
            n += 1
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.keep_with_next = True
            p.add_run(f"Question {n}").bold = True
            p.add_run(f"   [{q.get('marks')} marks]   ({q['id']})").font.size = Pt(9)
            if q.get("answer"):
                p2 = doc.add_paragraph(f"Answer: {q['answer']}")
                if q.get("answer_by") == "claude":
                    p2.add_run("  (worked out by Claude, check)").italic = True
                    to_check.append(n)
            ms_imgs = q["images"].get("markscheme") or []
            for f in ms_imgs:
                path = ROOT / q["dir"] / f
                doc.add_paragraph().add_run().add_picture(str(path), width=Cm(image_width_cm(path, text_w)))
            if q.get("markscheme_text") and not ms_imgs:  # the image is the real scheme; text is a fallback
                doc.add_paragraph(q["markscheme_text"].strip())
            if not ms_imgs and not q.get("markscheme_text") and not q.get("answer"):
                doc.add_paragraph("No mark scheme in the bank for this question yet.").runs[0].italic = True
                to_check.append(n)
    doc.save(out)
    return to_check


def cmd_build(a):
    path = Path(a.paper)
    paper, sections = resolve_paper(path)
    OUT.mkdir(exist_ok=True)
    name = paper.get("name") or path.stem
    qp = OUT / f"{name} - paper.docx"
    ms = OUT / f"{name} - mark scheme.docx"
    build_question_paper(paper, sections, qp)
    to_check = build_mark_scheme(paper, sections, ms)
    for s, qs in sections:
        print(f"  {s['title']}: {len(qs)} questions, {sum(q.get('marks') or 0 for q in qs)} marks")
    print(f"total {paper['max_marks']} marks")
    print(qp.relative_to(ROOT))
    print(ms.relative_to(ROOT))
    if to_check:
        print(f"mark scheme needs checking for questions: {to_check}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("find")
    for opt in ("--type", "--topic", "--q", "--skill", "--batch", "--difficulty"):
        sp.add_argument(opt)
    sp = sub.add_parser("draft")
    sp.add_argument("blueprint")
    sp.add_argument("--out")
    sp.add_argument("--seed", type=int)
    sp = sub.add_parser("build")
    sp.add_argument("paper")
    a = ap.parse_args()
    {"find": cmd_find, "draft": cmd_draft, "build": cmd_build}[a.cmd](a)


if __name__ == "__main__":
    main()
