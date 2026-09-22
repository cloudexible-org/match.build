/**
 * Subtitles for the stitched film, taken from the narration script itself.
 *
 * ── Why the script is the source ────────────────────────────────────────────
 *
 * The words burned into the film and the words in `docs/demo-script.md` have to
 * be the same words, because the whole point of the subtitles is that the
 * narrator reads *to* them. Keeping a second copy here would guarantee they
 * drift, and the drift would only show up while recording. So this parses the
 * blockquotes out of the script; edit the script, re-stitch, and the film
 * follows.
 *
 * ── Why the cards are drawn in a browser ────────────────────────────────────
 *
 * The obvious tools are ffmpeg's `subtitles` (libass) and `drawtext`
 * (libfreetype) filters. **This machine's ffmpeg has neither** — the Homebrew
 * build it came from is configured without both — so there is no text renderer
 * in the pipeline at all, and an .srt alone would burn nothing.
 *
 * Chromium is already a dependency here, and it is a far better typesetter than
 * `drawtext`: real line breaking, real kerning, the project's own type and
 * colours, and a transparent PNG at exactly the pixel size the overlay wants.
 * It is the same trade the `Director` makes for the cursor — draw it in the
 * page, rather than hope the renderer has a way to.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/** Roughly a comfortable glance: two short lines, read without pausing. */
const MAX_WORDS_PER_CUE = 14;
/** Past this, a cue wraps to a third line at the sizes below. */
const MAX_CHARS_PER_LINE = 46;

/**
 * Pulls the narration out of `docs/demo-script.md`, one entry per `### N · …`
 * section, in the order the sections appear.
 *
 * Each entry is the section's blockquote, split into paragraphs — a bare `>`
 * line is a paragraph break, and the closing tagline in the last section is one
 * of those, which is why it always gets a card of its own.
 */
export function parseNarration(scriptPath) {
  const lines = readFileSync(scriptPath, "utf8").split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = /^###\s+(\d+)\s+·\s+(.+?)\s+—/.exec(line);
    if (heading) {
      current = {
        index: Number(heading[1]),
        title: heading[2],
        paragraphs: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("## ")) current = null;
    if (!line.startsWith(">")) continue;

    const text = line.replace(/^>\s?/, "").trim();
    if (text === "") {
      // A bare `>`: end the paragraph, so the next line starts a new card.
      if (current.paragraphs.at(-1)?.length) current.paragraphs.push([]);
      continue;
    }
    if (current.paragraphs.length === 0) current.paragraphs.push([]);
    current.paragraphs.at(-1).push(text);
  }

  return sections
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      ...s,
      // Lines inside a paragraph are wrapped prose, not separate thoughts.
      paragraphs: s.paragraphs
        .filter((p) => p.length > 0)
        .map((p) => p.join(" ")),
    }));
}

/**
 * Splits a paragraph into cards of at most `MAX_WORDS_PER_CUE` words.
 *
 * Sentences first, because a card that ends mid-sentence reads as a mistake;
 * only a sentence that is too long on its own is broken further, at a dash or a
 * comma near its middle so the break lands where the speaker would breathe.
 *
 * **The next sentence may begin in lower case**, because the product is called
 * `match.build` and the script opens a sentence with it twice. Requiring a
 * capital after the full stop — the usual rule — silently merged "…out of
 * Instagram DMs." into the sentence after it, and the merged pair then blew the
 * word budget and got chopped at its middle *word*, so the first card read
 * "Independent matchmakers run their whole business out of" and the second
 * began "Instagram DMs.".
 *
 * What actually separates sentences here is the **whitespace**: the split needs
 * a full stop followed by a space, which "match.build gets" does not have
 * inside it, and the tagline "match.build. The operating system…" does.
 */
function splitIntoCues(paragraph) {
  const sentences = paragraph
    .split(/(?<=[.?!])\s+(?=["“]?[A-Za-z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cues = [];
  for (const sentence of sentences) {
    if (countWords(sentence) <= MAX_WORDS_PER_CUE) {
      cues.push(sentence);
      continue;
    }
    cues.push(...breakLongSentence(sentence));
  }

  // Re-join neighbours that are both short: two four-word sentences on two
  // cards flash past, where together they are one comfortable glance.
  const merged = [];
  for (const cue of cues) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      countWords(previous) + countWords(cue) <= MAX_WORDS_PER_CUE
    ) {
      merged[merged.length - 1] = `${previous} ${cue}`;
    } else {
      merged.push(cue);
    }
  }
  return merged;
}

/** Breaks at the dash or comma nearest the middle, else at the middle word. */
function breakLongSentence(sentence) {
  const words = sentence.split(/\s+/);
  const middle = Math.floor(words.length / 2);

  let best = -1;
  for (let i = 1; i < words.length - 1; i++) {
    if (!/[,—–:;]$/.test(words[i])) continue;
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  const at = best === -1 ? middle : best + 1;

  const head = words.slice(0, at).join(" ");
  const tail = words.slice(at).join(" ");
  const out = [];
  for (const part of [head, tail]) {
    if (countWords(part) > MAX_WORDS_PER_CUE)
      out.push(...breakLongSentence(part));
    else out.push(part);
  }
  return out;
}

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

/**
 * Lays one clip's narration out over that clip's running time.
 *
 * Time is shared **by word count**, which is what makes the film usable as a
 * teleprompter: every card is on screen for as long as it takes to say, so a
 * narrator who keeps pace with the subtitles finishes each scene with it.
 *
 * `startAt` and `duration` are in the finished film's timeline, so they already
 * include whatever slowdown the stitch applied.
 */
export function layOutCues(paragraphs, startAt, duration) {
  const cues = paragraphs.flatMap(splitIntoCues);
  const words = cues.map(countWords);
  const total = words.reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  let at = startAt;
  return cues.map((text, i) => {
    const span = (words[i] / total) * duration;
    const cue = { text, start: at, end: at + span };
    at += span;
    return cue;
  });
}

/** Wraps to at most two lines, balanced, for the card and for the .srt. */
export function wrapCue(text) {
  const words = text.split(/\s+/);
  if (text.length <= MAX_CHARS_PER_LINE) return [text];

  // Balance the two lines rather than filling the first: a full line above a
  // two-word orphan is the ugliest way to set a subtitle.
  let bestAt = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const score =
      Math.abs(a.length - b.length) +
      (Math.max(a.length, b.length) > MAX_CHARS_PER_LINE ? 200 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestAt = i;
    }
  }
  return [words.slice(0, bestAt).join(" "), words.slice(bestAt).join(" ")];
}

const escapeHtml = (s) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/**
 * Draws every cue as a transparent PNG and returns them in order.
 *
 * One page, one screenshot per cue, at exactly `width` × `height` — the overlay
 * does no scaling, so the text lands at the size it was set at, and the card is
 * the exact size of the band it drops into.
 *
 * **The card has no background of its own.** An earlier cut drew a dark pill
 * and laid it over the bottom of the picture, which is where this app keeps the
 * things a demo is about: the pill covered the suggestion card's own quote and
 * its Accept button — the payoff of an entire clip — and a Send button in two
 * others. The film now reserves a band *under* the picture, so text and product
 * never compete for the same pixels.
 */
export async function renderCueCards(cues, { width, height, outDir }) {
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    const files = [];
    for (const [i, cue] of cues.entries()) {
      const lines = wrapCue(cue.text)
        .map((l) => `<span>${escapeHtml(l)}</span>`)
        .join("");
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>
           html,body{margin:0;background:transparent}
           /* The full band, so the overlay sits at one fixed y and every card
              centres itself without anything having to be measured. */
           .band{display:flex;flex-direction:column;gap:8px;
                 justify-content:center;align-items:center;
                 width:${width}px;height:${height}px;
                 padding:0 160px;box-sizing:border-box}
           span{font:500 38px/1.3 -apple-system,"Helvetica Neue",Arial,sans-serif;
                color:#f7f4f1;text-align:center;text-wrap:balance;
                -webkit-font-smoothing:antialiased}
         </style><div class="band">${lines}</div>`,
      );
      const file = join(outDir, `cue-${String(i).padStart(3, "0")}.png`);
      await page.screenshot({ path: file, omitBackground: true });
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
}

/** The same cues as a sidecar `.srt`, for editing or for a player to show. */
export function writeSrt(cues, path) {
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
    const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
  };

  writeFileSync(
    path,
    `${cues
      .map((cue, i) =>
        [
          i + 1,
          `${stamp(cue.start)} --> ${stamp(cue.end)}`,
          wrapCue(cue.text).join("\n"),
          "",
        ].join("\n"),
      )
      .join("\n")}\n`,
  );
}
