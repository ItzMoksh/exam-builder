// Word (.docx) question paper and mark scheme, in the school's format.
// Mirrors tools/paper.py `build`. Works in the browser and in Node (getImage is injected).
import {
  AlignmentType, BorderStyle, Document, ImageRun, PageNumber, Paragraph, Table, TableCell, TableRow,
  TabStopType, TextRun, WidthType,
} from "docx";

export const DEFAULTS = {
  school: "THE SHRI RAM SCHOOL – MOULSARI",
  class: "IGCSE – Class 9",
  subject: "Physics",
  code: "0625",
  motto: "Integrity        Sensitivity        Pride in One's Heritage        Pursuit of Excellence",
  instructions: [
    "Answer all questions.",
    "Use a black or dark blue pen. You may use an HB pencil for any diagrams or graphs.",
    "Do not use an erasable pen or correction fluid.",
    "You may use a calculator.",
    "You should show all your working and use appropriate units.",
    "Use value of 'g' = 10 m/s² for your calculations.",
    "The number of marks for each question or part question is shown in brackets [ ].",
  ],
};

const DPI = 200; // crops are rendered at 200 DPI
const CM = 567; // twips per cm
const TEXT_W = Math.round(17.8 * CM); // A4 minus 1.6 cm margins
const NUM_W = CM; // question-number column
const px96 = (px) => (px * 96) / DPI; // docx sizes images in 96-dpi pixels
const MAX_IMG = ((17.8 - 1 - 0.2) / 2.54) * 96;

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

const text = (t, o = {}) => new TextRun({ text: t, ...o });
const centered = (t, size, bold = true, extra = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, ...extra, children: [text(t, { bold, size: size * 2 })] });

function imageRun(data, [w, h], maxW = MAX_IMG) {
  let width = px96(w), height = px96(h);
  if (width > maxW) { height *= maxW / width; width = maxW; }
  return new ImageRun({ type: "png", data, transformation: { width: Math.round(width), height: Math.round(height) } });
}

function header(paper, maxMarks, subtitle) {
  const right = [{ type: TabStopType.RIGHT, position: TEXT_W }];
  const out = [centered(paper.school, 14)];
  if (paper.exam) out.push(centered(paper.exam, 12));
  out.push(centered(paper.class, 11));
  if (subtitle) out.push(centered(subtitle, 12));
  out.push(new Paragraph({
    tabStops: right,
    children: [text(`Subject: ${paper.subject}    Subject code: ${paper.code}`, { bold: true }),
      text(`\tMax. Marks: ${maxMarks}`, { bold: true })],
  }));
  out.push(new Paragraph({
    tabStops: right,
    children: [text(paper.date ? `Date: ${paper.date}` : ""),
      ...(paper.time ? [text(`\tMax. Time: ${paper.time}`, { bold: true })] : [])],
  }));
  return out;
}

function footer(paper) {
  return {
    default: {
      options: {
        children: [
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
            children: [text(paper.footer_code || "", { size: 18 }), text("\tPage ", { size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [text(paper.motto, { size: 16, color: "555555" })],
          }),
        ],
      },
    },
  };
}

function page(paper, children) {
  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: Math.round(1.4 * CM), bottom: Math.round(1.6 * CM), left: Math.round(1.6 * CM), right: Math.round(1.6 * CM) },
      },
    },
    footers: footer(paper),
    children,
  };
}

const docStyles = { default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 0 } } } } };

/** Resolve a paper's sections into question objects. */
function resolve(idx, paper) {
  const p = { ...DEFAULTS, ...paper };
  const sections = paper.sections
    .map((s) => ({ ...s, qs: s.questions.map((id) => idx.byId.get(id)).filter(Boolean) }))
    .filter((s) => s.qs.length);
  const maxMarks = sections.reduce((t, s) => t + s.qs.reduce((u, q) => u + (q.marks || 0), 0), 0);
  return { p, sections, maxMarks };
}

const marksOf = (s) => s.qs.reduce((t, q) => t + (q.marks || 0), 0);

export async function questionPaper(idx, paper, getImage) {
  const { p, sections, maxMarks } = resolve(idx, paper);
  const body = [...header(p, maxMarks)];
  body.push(new Paragraph({ spacing: { before: 200 }, children: [text("Name: ______________________________   Section: ________   Roll No.: ________")] }));
  body.push(new Paragraph({ spacing: { before: 200 }, children: [text("INSTRUCTIONS", { bold: true })] }));
  for (const ins of p.instructions) body.push(new Paragraph({ text: ins, bullet: { level: 0 } }));
  if (sections.length > 1) {
    body.push(new Paragraph({ spacing: { before: 200 }, children: [text("This question paper has the following sections:", { bold: true })] }));
    for (const s of sections) body.push(new Paragraph({ text: `${s.title} – ${marksOf(s)} marks`, bullet: { level: 0 } }));
  }

  let n = 0;
  for (const s of sections) {
    body.push(centered(`${s.title.toUpperCase()}   [${marksOf(s)}]`, 12, true, { spacing: { before: 280, after: 120 }, keepNext: true }));
    const rows = [];
    for (const q of s.qs) {
      n++;
      const files = q.images.question;
      for (let i = 0; i < files.length; i++) {
        // Hold a crop with the next one only if it is short (e.g. a one-line stem). Holding big crops
        // together makes a chain taller than a page, and Word then strands the section heading.
        const hold = i < files.length - 1 && px96(q.sizes[files[i]][1]) < 300;
        const data = await getImage(`${q.dir}/${files[i]}`);
        rows.push(new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: NUM_W, type: WidthType.DXA },
              children: [new Paragraph({ keepNext: hold, spacing: { before: 120 },
                children: i === 0 ? [text(String(n), { bold: true })] : [] })],
            }),
            new TableCell({
              width: { size: TEXT_W - NUM_W, type: WidthType.DXA },
              children: [new Paragraph({ keepNext: hold, spacing: { before: 80, after: 200 },
                children: [imageRun(data, q.sizes[files[i]])] })],
            }),
          ],
        }));
      }
    }
    body.push(new Table({ rows, columnWidths: [NUM_W, TEXT_W - NUM_W], borders: NO_BORDERS, width: { size: TEXT_W, type: WidthType.DXA } }));
  }
  body.push(new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER, children: [text("— End of paper —")] }));
  return new Document({ styles: docStyles, sections: [page(p, body)] });
}

export async function markScheme(idx, paper, getImage) {
  const { p, sections, maxMarks } = resolve(idx, paper);
  const body = [...header(p, maxMarks, "MARK SCHEME")];
  const toCheck = [];
  let n = 0;
  const cell = (t, bold = false) => new TableCell({ children: [new Paragraph({ children: [text(t, { bold })] })] });

  for (const s of sections) {
    body.push(new Paragraph({ spacing: { before: 280, after: 120 }, keepNext: true, children: [text(s.title.toUpperCase(), { bold: true, size: 24 })] }));
    if (s.qs.every((q) => q.type === "mcq")) {
      const rows = [new TableRow({ tableHeader: true, children: [cell("Q", true), cell("Answer", true), cell("Note", true)] })];
      for (const q of s.qs) {
        n++;
        let note = "";
        if (q.answer_by === "claude") { note = "worked out by computer – please check"; toCheck.push(n); }
        else if (!q.answer) { note = "no answer key in the bank"; toCheck.push(n); }
        rows.push(new TableRow({ children: [cell(String(n)), cell(q.answer || "?", true), cell(note)] }));
      }
      body.push(new Table({ rows, columnWidths: [1000, 1600, TEXT_W - 2600], width: { size: TEXT_W, type: WidthType.DXA } }));
      continue;
    }
    for (const q of s.qs) {
      n++;
      body.push(new Paragraph({ spacing: { before: 240 }, keepNext: true, children: [
        text(`Question ${n}`, { bold: true }), text(`   [${q.marks} marks]`, { size: 18, color: "555555" })] }));
      if (q.answer) {
        body.push(new Paragraph({ children: [text(`Answer: ${q.answer}`),
          ...(q.answer_by === "claude" ? [text("  (worked out by computer – please check)", { italics: true })] : [])] }));
        if (q.answer_by === "claude") toCheck.push(n);
      }
      const ms = q.images.markscheme || [];
      for (const f of ms) {
        const data = await getImage(`${q.dir}/${f}`);
        body.push(new Paragraph({ spacing: { after: 120 }, children: [imageRun(data, q.sizes[f], (17.6 / 2.54) * 96)] }));
      }
      if (!ms.length && q.markscheme_text) {
        for (const line of q.markscheme_text.trim().split("\n")) body.push(new Paragraph({ children: [text(line)] }));
      }
      if (!ms.length && !q.markscheme_text && !q.answer) {
        body.push(new Paragraph({ children: [text("No mark scheme in the bank for this question yet.", { italics: true })] }));
        toCheck.push(n);
      }
    }
  }
  if (toCheck.length) {
    body.push(new Paragraph({ spacing: { before: 300 }, children: [text(
      `Please check questions ${toCheck.join(", ")}: their answers were worked out by the computer or are missing.`,
      { italics: true, color: "8A4B00" })] }));
  }
  return { doc: new Document({ styles: docStyles, sections: [page(p, body)] }), toCheck };
}
