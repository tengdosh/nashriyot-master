/**
 * Pure audiobook helpers (spec v2 §7.3): split a manuscript into chapters,
 * estimate narration duration, and roll up job progress. No I/O — 100% tested.
 * The TTS provider itself lives in lib/tts/adapter.ts.
 */

export type Chapter = { heading: string; text: string; charCount: number };

const CHAPTER_RE = /^\s*(#{1,3}\s+.+|(?:BOB|Bob|BOʻLIM|Qism|Chapter)\b.*)$/;

/**
 * Split text into chapters. Explicit chapter markers (markdown headings or
 * "BOB"/"Bob"/"Qism"/"Chapter" lines) start a new chapter; otherwise the text
 * is packed into chapters of at most `maxChars`, breaking on blank lines.
 */
export function splitIntoChapters(text: string, maxChars = 6000): Chapter[] {
  const src = text.replace(/\r\n/g, "\n").trim();
  if (src === "") return [];

  const lines = src.split("\n");
  const hasMarkers = lines.some((l) => CHAPTER_RE.test(l));

  const chapters: Chapter[] = [];
  if (hasMarkers) {
    let heading = "Kirish";
    let buf: string[] = [];
    let started = false;
    const flush = () => {
      const body = buf.join("\n").trim();
      chapters.push({ heading, text: body, charCount: body.length });
      buf = [];
    };
    for (const line of lines) {
      if (CHAPTER_RE.test(line)) {
        // Flush the accumulated text before switching heading — this captures a
        // preamble as "Kirish". Don't flush an empty buffer at the very start.
        if (started || buf.join("").trim() !== "") flush();
        heading = line.replace(/^#{1,3}\s+/, "").trim();
        started = true;
      } else {
        buf.push(line);
      }
    }
    flush();
    // Drop empty chapters (e.g. consecutive headings), but keep a lone one.
    return chapters.filter((c, _i, arr) => c.text !== "" || arr.length === 1);
  }

  // No markers: pack paragraphs (split on blank lines) up to maxChars.
  const paras = src.split(/\n{2,}/);
  let buf = "";
  let n = 1;
  for (const p of paras) {
    if (buf !== "" && buf.length + p.length + 2 > maxChars) {
      chapters.push({ heading: `Qism ${n}`, text: buf, charCount: buf.length });
      n += 1;
      buf = "";
    }
    buf = buf === "" ? p : `${buf}\n\n${p}`;
  }
  chapters.push({ heading: `Qism ${n}`, text: buf, charCount: buf.length });
  return chapters;
}

/** Rough narration duration in seconds at `cps` characters/second (~15 ≈ 900/min). */
export function estimateDuration(charCount: number, cps = 15): number {
  if (charCount <= 0) return 0;
  return Math.max(1, Math.round(charCount / cps));
}

export type ProgressInput = { status: "QUEUED" | "SYNTHESIZED" | "FAILED" }[];
export type Progress = { total: number; synthesized: number; failed: number; queued: number; pct: number };

/** Roll up chapter statuses into a job progress summary. */
export function jobProgress(chapters: ProgressInput): Progress {
  const total = chapters.length;
  let synthesized = 0;
  let failed = 0;
  for (const c of chapters) {
    if (c.status === "SYNTHESIZED") synthesized += 1;
    else if (c.status === "FAILED") failed += 1;
  }
  const queued = total - synthesized - failed;
  const pct = total === 0 ? 0 : Math.round((synthesized / total) * 100);
  return { total, synthesized, failed, queued, pct };
}
