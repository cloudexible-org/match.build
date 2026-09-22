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
 * Reads `docs/demo-script.md` — the film's edit, not a description of it.
 *
 * Three things come out of it:
 *
 * - the `## Title card` blockquote, one line per line of the opening card;
 * - one entry per `### N · …` section, in order, carrying that scene's
 *   narration; and
 * - each section's optional `**Card:**` line, the silent title that introduces
 *   its clip.
 *
 * A section's narration is its blockquote split into paragraphs: a bare `>`
 * line is a break, which is why the closing tagline always gets a subtitle of
 * its own rather than being run onto the end of the line before it.
 */
export function parseNarration(scriptPath) {
  const lines = readFileSync(scriptPath, "utf8").split("\n");
  const sections = [];
  const title = [];
  let current = null;
  let inTitle = false;

  for (const line of lines) {
    const heading = /^###\s+(\d+)\s+·\s+(.+?)\s+—/.exec(line);
    if (heading) {
      current = {
        index: Number(heading[1]),
        title: heading[2],
        card: null,
        paragraphs: [],
      };
      sections.push(current);
      inTitle = false;
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      inTitle = /^##\s+Title card\s*$/.test(line);
      continue;
    }

    if (inTitle) {
      if (line.startsWith(">")) title.push(line.replace(/^>\s?/, "").trim());
      continue;
    }
    if (!current) continue;

    const card = /^\*\*Card:\*\*\s*(.+?)\s*$/.exec(line);
    if (card) {
      current.card = card[1];
      continue;
    }
    if (!line.startsWith(">")) continue;

    const text = line.replace(/^>\s?/, "").trim();
    if (text === "") {
      // A bare `>`: end the paragraph, so the next line starts a new subtitle.
      if (current.paragraphs.at(-1)?.length) current.paragraphs.push([]);
      continue;
    }
    if (current.paragraphs.length === 0) current.paragraphs.push([]);
    current.paragraphs.at(-1).push(text);
  }

  return {
    title: title.filter(Boolean),
    sections: sections
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        ...s,
        // Lines inside a paragraph are wrapped prose, not separate thoughts.
        paragraphs: s.paragraphs
          .filter((p) => p.length > 0)
          .map((p) => p.join(" ")),
      })),
  };
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

/**
 * Draws the full-frame cards: the opening title, and the silent one that
 * introduces each scene.
 *
 * These are the film's punctuation. Seven clips cut straight together play as
 * seven demos in a row — nothing tells the viewer a new thought has started,
 * and the narrator has nowhere to breathe. A held title on a dark frame does
 * both, and costs about two seconds.
 *
 * Opaque, unlike the subtitle strips: a card replaces the picture rather than
 * sitting under it, so it is its own segment in the cut and needs no alpha.
 *
 * `cards` is `[{ id, lines, kind }]`, where `kind` is `"title"` or `"scene"`.
 */
export async function renderFrameCards(cards, { width, height, outDir }) {
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    const files = {};
    for (const card of cards) {
      const title = card.kind === "title";
      const body = card.lines
        .map((line, i) =>
          title && i === 0
            ? `<h1>${escapeHtml(line)}</h1>`
            : `<p${title ? ' class="sub"' : ""}>${escapeHtml(line)}</p>`,
        )
        .join("");

      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>
           html,body{margin:0}
           /* The same warm near-black as the caption band, the letterbox and
              the two-up gutter, so a card reads as part of the film rather
              than as a slide dropped into it. */
           .card{display:flex;flex-direction:column;gap:18px;
                 justify-content:center;align-items:center;
                 width:${width}px;height:${height}px;background:#2b2724;
                 padding:0 200px;box-sizing:border-box;text-align:center}
           h1,p{margin:0;color:#f7f4f1;-webkit-font-smoothing:antialiased;
                font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}
           /* The product's own display face is a serif; the title card is the
              one place in the film that is branding rather than interface. */
           h1{font-family:"Instrument Serif",Georgia,"Times New Roman",serif;
              font-weight:400;font-size:92px;line-height:1.1}
           /* Long-hand, not the font shorthand: that shorthand REQUIRES a
              family, and without one the whole declaration is dropped, which
              silently rendered every card at the 16px default. (And no
              backticks in here — this is inside a template literal.) */
           p{font-weight:500;font-size:62px;line-height:1.25}
           .sub{font-weight:400;font-size:40px;line-height:1.4;color:#cfc7bf}
         </style><div class="card">${body}</div>`,
      );
      const file = join(outDir, `card-${card.id}.png`);
      await page.screenshot({ path: file });
      files[card.id] = file;
    }
    return files;
  } finally {
    await browser.close();
  }
}
