/**
 * Turns lyrics pasted as one paragraph into one short phrase per line, the way karaoke needs them:
 * split at sentence ends first, then at dashes and commas, and only then by words, keeping lines even.
 */

/** Lines longer than this get split. Roughly what fits on two rows of a phone-width lyric video. */
export const MAX_LYRIC_LINE = 42;
/** Lines longer than this are almost certainly a pasted paragraph. */
const LONG_LINE_HINT = 60;

const SECTION_LABEL = /^\s*[[(][^\])]{1,40}[\])]\s*$/;

function cleanEdges(line: string) {
  return line
    .replace(/^[\s—–-]+/, "")
    .replace(/[\s,.;:—–-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits words into the fewest lines that fit, with lengths as even as possible. */
function balancedWrap(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const count = Math.ceil(text.length / MAX_LYRIC_LINE);
  if (count <= 1 || words.length < 2) return [text];
  const target = text.length / count;
  const lines: string[] = [];
  let row = "";
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    const remainingLines = count - lines.length;
    // Break when adding the word overshoots the target by more than stopping short would undershoot it.
    if (row && remainingLines > 1 && next.length > target && next.length - target > target - row.length) {
      lines.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  if (row) lines.push(row);
  return lines;
}

const SPLITTERS: Array<{ re: RegExp; merge: boolean }> = [
  // Sentence ends: each sentence starts its own line.
  { re: /(?<=[.!?…;])\s+/, merge: false },
  // Dashes and colons: rejoin short pieces.
  { re: /\s+[—–]\s+|(?<=:)\s+/, merge: true },
  // Commas: rejoin short pieces.
  { re: /(?<=,)\s+/, merge: true }
];

function splitPhrase(text: string, level = 0): string[] {
  if (text.length <= MAX_LYRIC_LINE) return [text];
  const splitter = SPLITTERS[level];
  if (!splitter) return balancedWrap(text);
  const parts = text.split(splitter.re).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return splitPhrase(text, level + 1);

  const pieces: string[] = [];
  for (const part of parts) {
    const last = pieces[pieces.length - 1];
    const joined = last ? `${last} ${part}` : "";
    // Short pieces rejoin; a tiny tail like "в Японии" may run a little over rather than sit alone.
    const fits = joined.length <= MAX_LYRIC_LINE || (part.length < 12 && joined.length <= MAX_LYRIC_LINE + 10);
    if (splitter.merge && last && fits) {
      pieces[pieces.length - 1] = joined;
    } else {
      pieces.push(part);
    }
  }
  const lines = pieces.flatMap((piece) => splitPhrase(piece, level + 1));
  if (!splitter.merge) return lines;
  // A tiny tail left after wrapping joins the line before it.
  const out: string[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && line.length < 12 && `${last} ${line}`.length <= MAX_LYRIC_LINE + 10) out[out.length - 1] = `${last} ${line}`;
    else out.push(line);
  }
  return out;
}

/** One phrase per line, no [Куплет]-style labels, no blank lines, no trailing commas or periods. */
export function tidyLyrics(lyrics: string): string {
  return lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !SECTION_LABEL.test(line))
    .flatMap((line) => splitPhrase(cleanEdges(line)))
    .map(cleanEdges)
    .filter(Boolean)
    .join("\n");
}

/** True when the text looks pasted as paragraphs rather than lines. */
export function lyricsNeedTidy(lyrics: string): boolean {
  return lyrics.split(/\r?\n/).some((line) => line.trim().length > LONG_LINE_HINT);
}
