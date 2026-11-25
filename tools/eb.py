"""exam-builder CLI.

  python tools/eb.py layout <source> [--pages 3-5]   page layout: text lines, pasted images, blank bands
  python tools/eb.py render <source> [--pages 3-5]   render pages to .cache/pages/<slug>/pNNN.png
  python tools/eb.py apply  <spec.yaml> [--force]    crop questions from a spec into bank/
  python tools/eb.py sheet  <spec.yaml>              contact sheet of a spec's crops (for checking)
  python tools/eb.py index                           rebuild index.json from bank/ and papers/

<source> is a catalog slug (see sources/catalog.yaml) or a path to a file in sources/.
All coordinates are PDF points, origin top-left, pages 1-indexed.
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import pymupdf  # noqa: E402
import yaml  # noqa: E402
from PIL import Image, ImageDraw, ImageOps  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
BANK = ROOT / "bank"
PAPERS = ROOT / "papers"
CACHE = ROOT / ".cache"
DPI = 200  # crop resolution; Word export scales by this to keep original print size
SCALE = DPI / 72


# ---------------------------------------------------------------- catalog / sources

def load_catalog() -> dict:
    data = yaml.safe_load((SOURCES / "catalog.yaml").read_text(encoding="utf-8")) or {}
    return {s["slug"]: s for s in data.get("sources", [])}


def resolve_source(ref: str) -> tuple[str, Path]:
    cat = load_catalog()
    if ref in cat:
        return ref, SOURCES / cat[ref]["file"]
    p = Path(ref)
    if not p.is_absolute():
        p = (ROOT / ref) if (ROOT / ref).exists() else SOURCES / ref
    for slug, s in cat.items():
        if (SOURCES / s["file"]).resolve() == p.resolve():
            return slug, p
    return p.stem, p


def open_doc(path: Path) -> pymupdf.Document:
    """Open a PDF, or wrap a photo (jpg/png) as a one-page PDF (1 px = 1 pt)."""
    if path.suffix.lower() in (".jpg", ".jpeg", ".png"):
        img = pymupdf.open(path)
        return pymupdf.open("pdf", img.convert_to_pdf())
    return pymupdf.open(path)


def parse_pages(spec: str | None, n: int) -> list[int]:
    if not spec:
        return list(range(1, n + 1))
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out += list(range(int(a), int(b or a) + 1))
    return [p for p in out if 1 <= p <= n]


def page_image(doc: pymupdf.Document, slug: str, pno: int) -> Image.Image:
    """Rendered page at DPI, cached on disk."""
    path = CACHE / "pages" / slug / f"p{pno:03d}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        doc[pno - 1].get_pixmap(dpi=DPI).save(path)
    return Image.open(path).convert("RGB")


# ---------------------------------------------------------------- layout

def blank_bands(img: Image.Image, min_pt: float = 5) -> list[tuple[int, int]]:
    """Horizontal bands (in points) with almost no ink: safe places to cut."""
    g = ImageOps.grayscale(img)
    w, h = g.size
    small = g.resize((max(1, w // 4), h))  # cheap: average across columns
    px = small.load()
    sw = small.size[0]
    rows = []
    for y in range(h):
        dark = sum(1 for x in range(sw) if px[x, y] < 200)
        rows.append(dark <= max(1, sw // 400))
    bands, start = [], None
    for y, blank in enumerate(rows + [False]):
        if blank and start is None:
            start = y
        elif not blank and start is not None:
            if (y - start) / SCALE >= min_pt:
                bands.append((round(start / SCALE), round(y / SCALE)))
            start = None
    return bands


def cmd_layout(args):
    slug, path = resolve_source(args.source)
    doc = open_doc(path)
    print(f"# {slug}  {path.name}  pages={doc.page_count}")
    for pno in parse_pages(args.pages, doc.page_count):
        page = doc[pno - 1]
        r = page.rect
        rot = page.rotation_matrix  # maps unrotated coords to what is shown and rendered
        turned = f", rotated {page.rotation}" if page.rotation else ""
        print(f"\n## page {pno}  ({r.width:.0f}x{r.height:.0f} pt{turned})")
        for info in page.get_image_info():
            x0, y0, x1, y1 = pymupdf.Rect(info["bbox"]) * rot
            print(f"  IMG  y {y0:5.0f}-{y1:5.0f}  x {x0:4.0f}-{x1:4.0f}")
        d = page.get_text("dict")
        for b in d["blocks"]:
            for ln in b.get("lines", []):
                text = "".join(s["text"] for s in ln["spans"]).strip()
                if not text:
                    continue
                x0, y0, x1, y1 = pymupdf.Rect(ln["bbox"]) * rot
                print(f"  TXT  y {y0:5.0f}-{y1:5.0f}  x {x0:4.0f}  {text[:90]}")
        bands = blank_bands(page_image(doc, slug, pno))
        print("  GAPS " + "  ".join(f"{a}-{b}" for a, b in bands))


def cmd_render(args):
    slug, path = resolve_source(args.source)
    doc = open_doc(path)
    for pno in parse_pages(args.pages, doc.page_count):
        page_image(doc, slug, pno)
        print(CACHE / "pages" / slug / f"p{pno:03d}.png")


# ---------------------------------------------------------------- cropping

def trim(img: Image.Image, pad: int = 12) -> Image.Image:
    """Trim white borders, keep a small pad."""
    g = ImageOps.invert(ImageOps.grayscale(img)).point(lambda v: 255 if v > 40 else 0)
    box = g.getbbox()
    if not box:
        return img
    x0, y0, x1, y1 = box
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def crop_segments(doc, slug: str, segments: list[dict], masks: list[dict]) -> list[Image.Image]:
    out = []
    for seg in segments:
        pno = seg["page"]
        img = page_image(doc, slug, pno).copy()
        draw = ImageDraw.Draw(img)
        for m in masks or []:
            if m.get("page", pno) == pno:
                draw.rectangle([m["x0"] * SCALE, m["y0"] * SCALE, m["x1"] * SCALE, m["y1"] * SCALE], fill="white")
        w_pt = img.width / SCALE
        box = (seg.get("x0", 0) * SCALE, seg["y0"] * SCALE, seg.get("x1", w_pt) * SCALE, seg["y1"] * SCALE)
        out.append(trim(img.crop(tuple(round(v) for v in box))))
    return out


META_ORDER = ["id", "course", "type", "status", "problem", "syllabus", "tier", "marks", "difficulty", "skills",
              "answer", "answer_by", "parts", "source", "images", "markscheme_text", "notes", "text"]


class _Literal(str):
    pass


yaml.add_representer(_Literal, lambda d, s: d.represent_scalar("tag:yaml.org,2002:str", s, style="|"))


def dump_meta(meta: dict) -> str:
    ordered = {k: meta[k] for k in META_ORDER if k in meta and meta[k] not in (None, [], "")}
    ordered.update({k: v for k, v in meta.items() if k not in ordered and v not in (None, [], "")})
    for k in ("text", "markscheme_text", "notes"):
        if isinstance(ordered.get(k), str) and "\n" in ordered[k]:
            ordered[k] = _Literal(ordered[k].rstrip() + "\n")
    return yaml.dump(ordered, sort_keys=False, allow_unicode=True, width=100)


def cmd_apply(args):
    spec = yaml.safe_load(Path(args.spec).read_text(encoding="utf-8"))
    slug, path = resolve_source(spec["source"])
    doc = open_doc(path)
    docs = {slug: doc}
    made = skipped = 0
    for q in spec["questions"]:
        qid = f"{slug}-{q['n']}" if "n" in q else q["id"]
        qdir = BANK / qid
        meta_path = qdir / "meta.yaml"
        if meta_path.exists() and not args.force:
            old = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
            if old.get("status") == "reviewed":
                skipped += 1
                continue
        qdir.mkdir(parents=True, exist_ok=True)
        for old_png in qdir.glob("*.png"):
            old_png.unlink()
        imgs = crop_segments(doc, slug, q["segments"], q.get("mask"))
        names = []
        for i, im in enumerate(imgs, 1):
            name = "q.png" if len(imgs) == 1 else f"q-{i}.png"
            im.save(qdir / name, optimize=True)
            names.append(name)
        ms_names = []
        ms = q.get("ms")
        if ms and ms.get("segments"):
            ms_slug, ms_path = resolve_source(ms.get("source", slug))
            if ms_slug not in docs:
                docs[ms_slug] = open_doc(ms_path)
            ms_imgs = crop_segments(docs[ms_slug], ms_slug, ms["segments"], ms.get("mask"))
            for i, im in enumerate(ms_imgs, 1):
                name = "ms.png" if len(ms_imgs) == 1 else f"ms-{i}.png"
                im.save(qdir / name, optimize=True)
                ms_names.append(name)
        meta = {
            "id": qid,
            "course": spec.get("course", "ig9-physics"),
            "type": q["type"],
            "status": "draft",
            "syllabus": q.get("syllabus", []),
            "tier": q.get("tier", "core"),
            "marks": q.get("marks"),
            "difficulty": q.get("difficulty"),
            "skills": q.get("skills", []),
            "answer": q.get("answer"),
            "answer_by": q.get("answer_by"),
            "problem": q.get("problem"),
            "parts": q.get("parts"),
            "source": {k: v for k, v in {
                "slug": slug, "file": f"sources/{path.name}",
                "pages": sorted({s["page"] for s in q["segments"]}),
                "question_no": str(q.get("qno", q.get("n"))),
                "origin": q.get("origin") or spec.get("origin"),
                "site": spec.get("site"),
            }.items() if v},
            "images": {"question": names, **({"markscheme": ms_names} if ms_names else {})},
            "markscheme_text": (ms or {}).get("text"),
            "notes": q.get("notes"),
            "text": q.get("text"),
        }
        meta_path.write_text(dump_meta(meta), encoding="utf-8")
        made += 1
    print(f"{slug}: wrote {made} questions, kept {skipped} reviewed")


def cmd_sheet(args):
    """One tall PNG showing every crop of a spec, labelled, for a quick visual check."""
    spec = yaml.safe_load(Path(args.spec).read_text(encoding="utf-8"))
    slug, _ = resolve_source(spec["source"])
    width = 900
    tiles = []
    for q in spec["questions"]:
        qid = f"{slug}-{q['n']}" if "n" in q else q["id"]
        qdir = BANK / qid
        files = sorted(qdir.glob("q*.png")) + sorted(qdir.glob("ms*.png"))
        for f in files:
            im = Image.open(f).convert("RGB")
            s = min(1.0, (width - 20) / im.width) * 0.5
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
            tiles.append((f"{qid}/{f.name}  [{q['type']}, {q.get('marks')}m]", im))
    total_h = sum(t[1].height + 30 for t in tiles) + 10
    sheet = Image.new("RGB", (width // 2 + 20, max(total_h, 50)), "white")
    d = ImageDraw.Draw(sheet)
    y = 5
    for label, im in tiles:
        d.text((10, y), label, fill=(200, 0, 0))
        y += 16
        sheet.paste(im, (10, y))
        d.rectangle([9, y - 1, 10 + im.width, y + im.height], outline=(0, 120, 255))
        y += im.height + 14
    out = CACHE / "sheets" / f"{slug}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    # split very tall sheets so they stay readable when viewed
    chunk = 2400
    paths = []
    for i in range(0, sheet.height, chunk):
        p = out.with_name(f"{slug}-{i // chunk + 1}.png")
        sheet.crop((0, i, sheet.width, min(sheet.height, i + chunk))).save(p)
        paths.append(p)
    print("\n".join(str(p) for p in paths))


# ---------------------------------------------------------------- index

def cmd_index(_args):
    used: dict[str, list[str]] = {}
    papers = []
    for p in sorted(PAPERS.glob("*.yaml")):
        paper = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        label = paper.get("name") or p.stem
        ids = [qid for s in paper.get("sections", []) for qid in s.get("questions", [])]
        status = paper.get("status", "draft")
        papers.append({**paper, "file": p.name, "name": label, "batch": paper.get("batch"), "status": status,
                       "questions": ids})
        if status != "given":  # only papers actually given to students count as used
            continue
        for qid in ids:
            used.setdefault(qid, []).append(label)
    questions = []
    for meta_path in sorted(BANK.glob("*/meta.yaml")):
        m = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
        m["dir"] = f"bank/{meta_path.parent.name}"
        m["used_in"] = used.get(m["id"], [])
        sizes = {}  # pixel sizes at DPI, so the web app can lay out Word files without loading images
        for f in (m.get("images") or {}).get("question", []) + (m.get("images") or {}).get("markscheme", []):
            with Image.open(meta_path.parent / f) as im:
                sizes[f] = list(im.size)
        m["sizes"] = sizes
        questions.append(m)
    syllabus = yaml.safe_load((ROOT / "syllabus" / "0625-2026-28.yaml").read_text(encoding="utf-8"))
    out = {"questions": questions, "papers": papers, "syllabus": syllabus}
    (ROOT / "index.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    by_type: dict[str, int] = {}
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
    print(f"index.json: {len(questions)} questions {by_type}, {len(papers)} papers")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("layout", "render"):
        sp = sub.add_parser(name)
        sp.add_argument("source")
        sp.add_argument("--pages")
    sp = sub.add_parser("apply")
    sp.add_argument("spec")
    sp.add_argument("--force", action="store_true", help="overwrite reviewed questions too")
    sp = sub.add_parser("sheet")
    sp.add_argument("spec")
    sub.add_parser("index")
    args = ap.parse_args()
    {"layout": cmd_layout, "render": cmd_render, "apply": cmd_apply, "sheet": cmd_sheet, "index": cmd_index}[args.cmd](args)


if __name__ == "__main__":
    main()
