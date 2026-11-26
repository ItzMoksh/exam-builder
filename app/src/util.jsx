// Small shared helpers and UI bits.
import { Packer } from "docx";
import { questionPaper, markScheme } from "./word.js";

export function academicYear(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1; // the school year starts in April
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const TEMPLATES = [
  { key: "unit", name: "Unit test", desc: "A short test on a few chapters", time: "45 minutes",
    exam: "Unit Test", marks: { mcq: 10, theory: 10, atp: 10 } },
  { key: "semester", name: "Semester exam", desc: "A full paper, like the school's semester exams", time: "1 hour 15 minutes",
    exam: "Semester Examination", marks: { mcq: 20, theory: 40, atp: 20 } },
  { key: "atp", name: "Practical (ATP) test", desc: "Only alternative-to-practical questions", time: "40 minutes",
    exam: "ATP Test", marks: { mcq: 0, theory: 0, atp: 20 } },
  { key: "mcq", name: "MCQ quiz", desc: "Only multiple-choice questions", time: "20 minutes",
    exam: "MCQ Quiz", marks: { mcq: 15, theory: 0, atp: 0 } },
  { key: "custom", name: "Something else", desc: "Choose the sections and marks yourself", time: "",
    exam: "Test", marks: { mcq: 0, theory: 0, atp: 0 } },
];

export const SECTION_ORDER = ["mcq", "theory", "atp"];
const ROMAN = ["I", "II", "III", "IV"];

export function sectionTitle(type, i, template) {
  const names = {
    mcq: "Multiple Choice Questions",
    theory: template === "semester" ? "Extended Theory" : "Structured Questions",
    atp: "Alternative to Practical",
  };
  return `Section ${ROMAN[i]} – ${names[type]}`;
}

export const px96 = (px) => Math.round((px * 96) / 200); // crops are 200 DPI -> print size on screen

export function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const imageCache = new Map();
async function getImage(rel) {
  if (!imageCache.has(rel)) {
    imageCache.set(rel, fetch("/" + rel).then((r) => {
      if (!r.ok) throw new Error("Could not load image " + rel);
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b)));
  }
  return imageCache.get(rel);
}

const safeName = (s) => (s || "Paper").replace(/[\\/:*?"<>|]+/g, "-").trim();

export async function downloadPaper(idx, paper) {
  const doc = await questionPaper(idx, paper, getImage);
  download(await Packer.toBlob(doc), `${safeName(paper.name)} - question paper.docx`);
}

export async function downloadMarkScheme(idx, paper) {
  const { doc, toCheck } = await markScheme(idx, paper, getImage);
  download(await Packer.toBlob(doc), `${safeName(paper.name)} - mark scheme.docx`);
  return toCheck;
}

const PATHS = {
  plus: "M12 5v14M5 12h14",
  kalash: "M8 9h8l-1 10H9zM7 9c0-2 2-3 5-3s5 1 5 3M12 3v3M9 4.5l1 1.5M15 4.5l-1 1.5",
  swap: "M7 7h11l-3-3M17 17H6l3 3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-5-5",
  check: "M5 12l5 5 9-10",
  warn: "M12 4l9 16H3zM12 10v4M12 17v.5",
  back: "M15 6l-6 6 6 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  copy: "M8 8h11v12H8zM5 16V4h11",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  folder: "M3 6h6l2 2h10v11H3z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  x: "M6 6l12 12M18 6L6 18",
  flag: "M5 21V4h11l-2 4 2 4H5",
  zoom: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-5-5M11 8v6M8 11h6",
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div class="modal-head">
          <h2>{title}</h2>
          <button class="btn ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Vidya mark: a lotus rising inside a temple shikhara, with a diya line beneath. */
export function LotusMark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 2 C29 9 41 12 43 22 L43 46 L5 46 L5 22 C7 12 19 9 24 2Z" fill="#7E2323" stroke="#E9C46A" stroke-width="1.5" />
      <path d="M24 17 C28.5 23 28.5 31 24 37 C19.5 31 19.5 23 24 17Z" fill="#F4C557" />
      <path d="M24 37 C18.5 35.5 13.5 31 12.5 24.5 C18 25.5 22 30 24 37Z" fill="#E58A24" />
      <path d="M24 37 C29.5 35.5 34.5 31 35.5 24.5 C30 25.5 26 30 24 37Z" fill="#E58A24" />
      <path d="M13 41 H35" stroke="#F4C557" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

/** Small lotus used as a bullet and in the section divider. */
export function Lotus({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="lotus-bullet">
      <path d="M12 3 C15 8 15 14 12 20 C9 14 9 8 12 3Z" fill="#E07A1F" />
      <path d="M12 20 C8 19 5 15 4.5 11 C8 12 11 15 12 20Z M12 20 C16 19 19 15 19.5 11 C16 12 13 15 12 20Z" fill="#F0A830" />
    </svg>
  );
}

/** Gold rule with a lotus between two diamonds. */
export function Divider() {
  return (
    <div class="divider" aria-hidden="true">
      <svg width="72" height="18" viewBox="0 0 72 18">
        <path d="M2 9 L8 5 L14 9 L8 13Z M58 9 L64 5 L70 9 L64 13Z" fill="#C9A04A" />
        <path d="M36 1 C40 6 40 12 36 17 C32 12 32 6 36 1Z" fill="#E07A1F" />
        <path d="M36 17 C31 16 27 13 26 8 C31 9 34 12 36 17Z M36 17 C41 16 45 13 46 8 C41 9 38 12 36 17Z" fill="#F0A830" />
      </svg>
    </div>
  );
}
