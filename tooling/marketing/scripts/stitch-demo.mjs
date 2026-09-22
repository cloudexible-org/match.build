#!/usr/bin/env node
/**
 * Joins rendered clips into one film, in the order given.
 *
 *   pnpm stitch:demo                                   # the default running order
 *   pnpm stitch:demo -- --names onboard-invite,inbox-ai-reply
 *   pnpm stitch:demo -- --xfade 0                      # hard cuts
 *
 * Each clip is rendered on its own by `render-demo.mjs` first; this only
 * concatenates. Keeping the two apart is what makes re-cutting cheap — change
 * the running order or a dissolve here and nothing is re-rendered, let alone
 * re-filmed.
 *
 * ── Why the clips are re-encoded rather than stream-copied ──────────────────
 *
 * The obvious way to join mp4s is the concat *demuxer* with `-c copy`, which
 * rewrites no pixels. It is also wrong here twice over. The clips do not all
 * share a resolution — a two-up capture is wider than a single-screen one —
 * and `-c copy` cannot reconcile that; and a hard cut between two screens of
 * the same pale UI reads as a glitch rather than as a new scene. So each clip
 * is scaled onto a common canvas and the joins are dissolves, which costs one
 * encode of a ninety-second video and buys a film that looks cut rather than
 * appended.
 *
 * ── Why not one giant capture ───────────────────────────────────────────────
 *
 * Because a capture is a browser session. One script driving seven flows would
 * be seven times as likely to fail, would re-shoot all of them to fix a beat in
 * the last one, and could not put a phone beside a laptop in the middle. Seven
 * short takes and an edit is how the footage stays cheap to change.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  layOutCues,
  parseNarration,
  renderCueCards,
  renderFrameCards,
  writeSrt,
} from "../lib/subtitles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const DEMOS_DIR = join(REPO_ROOT, ".scratch", "marketing", "demos");

/**
 * How fast the film plays, as a multiplier on the captured clips.
 *
 * Below 1 the film is *slower* than it was filmed. 0.95 is a deliberate five
 * percent: the clips were paced to be watched, and the film is meant to be
 * narrated over, which wants a little more air in every beat than watching
 * does. It is the delivered pacing rather than a preference, so it lives here
 * and not in a flag you have to remember — `pnpm stitch:demo` reproduces the
 * film that was handed over. `--speed 1` gives the captured pacing back.
 */
const DEFAULT_SPEED = 0.95;

/**
 * The running order of the finished film, and the order the narration script
 * in `docs/demo-script.md` is written against. Change both together.
 *
 * It is an argument, not a tour: the problem (a book in DMs), the daily work
 * (a drafted reply), what that work builds (a profile), what the profile is
 * for (the board), who else is in it (the candidate), that it is live, and
 * what it costs.
 */
const DEFAULT_ORDER = [
  "onboard-invite",
  "inbox-ai-reply",
  "profile-builds-itself",
  "match-board",
  "candidate-view",
  "realtime-two-up",
  "admin-ai-cost",
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function resolveFfmpeg(override) {
  const candidate = override || process.env.FFMPEG_PATH || "ffmpeg";
  try {
    execFileSync(candidate, ["-version"], { stdio: "ignore" });
    return candidate;
  } catch {
    throw new Error(
      `ffmpeg not found (tried "${candidate}").\n` +
        "Install it with `brew install ffmpeg`, or set FFMPEG_PATH.",
    );
  }
}

function ffmpeg(args) {
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
}

function probe(file, entries) {
  const out = execFileSync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      entries,
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" },
  );
  return out.trim().split("\n");
}

const formatBytes = (file) =>
  `${Math.round(statSync(file).size / 1024).toLocaleString()} KB`;

const args = parseArgs(process.argv.slice(2));
const FFMPEG = resolveFfmpeg(
  typeof args.ffmpeg === "string" ? args.ffmpeg : "",
);
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");

const names =
  typeof args.names === "string"
    ? args.names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
    : DEFAULT_ORDER;

const name = typeof args.name === "string" ? args.name : "match-build-demo";
const outDir = resolve(args.out || join(DEMOS_DIR, "_stitched"));
const width = Number(args.width || 1920);
const fps = Number(args.fps || 30);
const crf = Number(args.crf || 20);
/** Seconds of dissolve between clips. `--xfade 0` gives hard cuts. */
const xfade = Number(args.xfade ?? 0.5);
const speed = Number(args.speed ?? DEFAULT_SPEED);
/** `--no-subtitles` renders the film clean, for a version with no burnt-in text. */
const subtitled = args.subtitles !== "false" && args.noSubtitles !== true;
const scriptPath = resolve(
  args.script || join(REPO_ROOT, "docs", "demo-script.md"),
);

// ── Collect the clips ───────────────────────────────────────────────────────
const clips = names.map((clipName) => {
  const file = join(DEMOS_DIR, clipName, "out", `${clipName}.mp4`);
  if (!existsSync(file)) {
    throw new Error(
      `No rendered clip for "${clipName}" at ${file}.\n` +
        `Render it first:  pnpm render:demo -- --name ${clipName}`,
    );
  }
  const [w, h, duration] = probe(file, "stream=width,height:format=duration");
  return {
    name: clipName,
    file,
    width: Number(w),
    height: Number(h),
    duration: Number(duration),
  };
});

/**
 * The canvas every clip is letterboxed onto.
 *
 * The tallest clip decides the height, because the widths differ: a two-up
 * capture is 2912 captured pixels across where a single screen is 2880, so
 * scaled to a common width it ends up slightly shorter. Padding to the tallest
 * keeps every frame the same size — which `concat` requires — and puts the
 * difference in a bar rather than in a stretched picture.
 */
const height = Math.max(
  ...clips.map((c) => Math.round((c.height * width) / c.width)),
);
// libx264's yuv420p needs both axes even.
const canvasHeight = height % 2 === 0 ? height : height + 1;

const workDir = join(outDir, ".stitch");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

/** How long a held card stays up. Long enough to read, short enough to be punctuation. */
const TITLE_CARD_SECONDS = Number(args.titleCard || 3.2);
const SCENE_CARD_SECONDS = Number(args.sceneCard || 2.2);

// ── Read the edit out of the script ─────────────────────────────────────────
const script =
  subtitled || args.cards !== "false" ? parseNarration(scriptPath) : null;
if (script && script.sections.length !== clips.length) {
  throw new Error(
    `${scriptPath} has ${script.sections.length} scenes but the film has ` +
      `${clips.length} clips (${names.join(", ")}).\n` +
      "They are matched by position, so the script and DEFAULT_ORDER have to " +
      "agree — add, remove or reorder a section to match, or pass --no-subtitles.",
  );
}

/**
 * The caption band under the picture.
 *
 * Reserved rather than overlaid, because this app puts the things a demo is
 * about at the *bottom* of the screen — the suggestion card with its quote and
 * its Accept button sits directly above the composer, and so does Send. A
 * caption laid over the picture covered exactly those. Giving the text its own
 * strip costs 170 pixels of height and nothing else.
 */
const BAND_HEIGHT = subtitled ? Number(args.bandHeight || 170) : 0;
const frameHeight = canvasHeight + BAND_HEIGHT;

/**
 * The cut: a held card, then the clip it introduces, all the way down.
 *
 * Cards are segments in their own right rather than something drawn over a
 * clip, which is the whole point of them — the picture *stops*. That is what
 * separates one thought from the next and gives the narrator somewhere to
 * breathe, and it is what the first cut of this film was missing.
 */
const segments = [];
if (script?.title.length) {
  segments.push({
    kind: "card",
    id: "title",
    cardKind: "title",
    lines: script.title,
    duration: TITLE_CARD_SECONDS,
  });
}
clips.forEach((clip, i) => {
  const card = script?.sections[i]?.card;
  if (card) {
    segments.push({
      kind: "card",
      id: `scene-${i + 1}`,
      cardKind: "scene",
      lines: [card],
      duration: SCENE_CARD_SECONDS,
    });
  }
  segments.push({
    ...clip,
    kind: "clip",
    clipIndex: i,
    duration: clip.duration / speed,
  });
});

/**
 * Where each segment starts in the finished film.
 *
 * Every join is a dissolve that *overlaps* its two segments, so each one begins
 * `xfade` seconds before the previous ends. The subtitles are laid out against
 * these, so a cue's time is a time in the file the narrator will actually play.
 */
let at = 0;
for (const segment of segments) {
  segment.start = at;
  at += segment.duration - xfade;
}

// ── The narration, cut into subtitles and timed to the clips ────────────────
const cues = subtitled
  ? segments
      .filter((s) => s.kind === "clip")
      .flatMap((s) =>
        layOutCues(
          script.sections[s.clipIndex].paragraphs,
          s.start,
          s.duration,
        ).map((cue) => ({ ...cue, segment: s.id ?? s.name })),
      )
  : [];

console.log(`\n  stitching ${segments.length} segments → ${name}.mp4`);
for (const segment of segments) {
  const label =
    segment.kind === "card" ? `▪ ${segment.lines[0]}` : segment.name;
  console.log(
    `    ${label.padEnd(34)} ${segment.duration.toFixed(2)}s` +
      (segment.kind === "clip" ? `  ${segment.width}x${segment.height}` : ""),
  );
}

// ── Draw the cards ──────────────────────────────────────────────────────────
/**
 * Both kinds of card are drawn in Chromium, because this ffmpeg is built
 * without libass *and* without libfreetype: `subtitles` and `drawtext` are both
 * unavailable, so there is no text renderer in the pipeline at all. The browser
 * is the better typesetter anyway. See `lib/subtitles.mjs`.
 */
const frameCards = segments.some((s) => s.kind === "card")
  ? await renderFrameCards(
      // `kind` on a segment says card-or-clip; the renderer wants title-or-scene.
      segments
        .filter((s) => s.kind === "card")
        .map((s) => ({ id: s.id, lines: s.lines, kind: s.cardKind })),
      { width, height: frameHeight, outDir: join(workDir, "cards") },
    )
  : {};

const cueCards = subtitled
  ? await renderCueCards(cues, {
      width,
      height: BAND_HEIGHT,
      outDir: join(workDir, "cues"),
    })
  : [];

if (subtitled) {
  writeSrt(cues, join(outDir, `${name}.srt`));
  console.log(
    `\n    ${cues.length} subtitles, ${Object.keys(frameCards).length} cards`,
  );
}

// ── Normalise every segment onto the canvas ─────────────────────────────────
const normalised = segments.map((segment, i) => {
  const out = join(
    workDir,
    `${String(i).padStart(2, "0")}-${segment.id ?? segment.name}.mp4`,
  );

  if (segment.kind === "card") {
    // A still becomes a segment of its own length; `-loop 1 -t` is the whole
    // trick, and the card is already the exact size of the frame.
    ffmpeg([
      "-y",
      "-loop",
      "1",
      "-t",
      segment.duration.toFixed(3),
      "-i",
      frameCards[segment.id],
      "-vf",
      `fps=${fps},format=yuv420p,setsar=1`,
      "-c:v",
      "libx264",
      "-crf",
      String(crf),
      "-preset",
      "slow",
      out,
    ]);
    return { ...segment, file: out };
  }

  /**
   * This clip's cues, in *clip-local* seconds.
   *
   * `overlay`'s `enable` is evaluated against the timestamps it is handed, and
   * `setpts` runs first in this chain — so these are times in the slowed clip,
   * which is exactly what the film's timeline was built from.
   */
  const mine = cues
    .map((cue, index) => ({ ...cue, index }))
    .filter((cue) => cue.segment === (segment.id ?? segment.name));

  const base = [
    // Slower than filmed: PTS/0.95 stretches every frame's presentation time.
    // Before `fps`, so the frames are resampled onto the output rate rather
    // than the output being resampled onto a stretched input.
    `[0:v]setpts=PTS/${speed}`,
    `scale=${width}:-2:flags=lanczos`,
    // Two pads, and the order matters: the first centres the clip on the common
    // canvas (a two-up capture is a hair shorter than a single screen once both
    // are 1920 wide), the second adds the caption band *below* it.
    `pad=${width}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=0x2b2724`,
    `pad=${width}:${frameHeight}:0:0:color=0x2b2724`,
    `fps=${fps}`,
    "format=yuv420p",
    "setsar=1",
  ].join(",");

  const chain = [`${base}[v0]`];
  mine.forEach((cue, n) => {
    const from = (cue.start - segment.start).toFixed(3);
    const to = (cue.end - segment.start).toFixed(3);
    const next = n === mine.length - 1 ? "out" : `v${n + 1}`;
    chain.push(
      `[v${n}][${n + 1}:v]overlay=x=0:y=${canvasHeight}:` +
        `enable='between(t,${from},${to})'[${next}]`,
    );
  });
  if (mine.length === 0) chain[0] = `${base}[out]`;

  ffmpeg([
    "-y",
    "-i",
    segment.file,
    ...mine.flatMap((cue) => ["-i", cueCards[cue.index]]),
    "-filter_complex",
    chain.join(";"),
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "slow",
    out,
  ]);
  return { ...segment, file: out };
});

const mp4 = join(outDir, `${name}.mp4`);

if (xfade > 0) {
  /**
   * `xfade` takes two inputs at a time, so the segments are folded left to
   * right: the running blend is input 0 and the next segment is input 1, every
   * time. The offset for step N is everything joined so far, minus the
   * dissolves already spent, minus this one.
   */
  const filters = [];
  let previous = "0:v";
  let elapsed = normalised[0].duration;
  for (let i = 1; i < normalised.length; i++) {
    const offset = elapsed - xfade;
    const label = i === normalised.length - 1 ? "out" : `v${i}`;
    filters.push(
      `[${previous}][${i}:v]xfade=transition=fade:duration=${xfade}:` +
        `offset=${offset.toFixed(3)}[${label}]`,
    );
    previous = label;
    elapsed = offset + normalised[i].duration;
  }

  ffmpeg([
    "-y",
    ...normalised.flatMap((c) => ["-i", c.file]),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
} else {
  // Hard cuts: every segment is already the same size, codec and frame rate, so
  // the demuxer can copy the streams straight through.
  const quote = (p) => `'${p.replaceAll("'", "'\\''")}'`;
  const listPath = join(workDir, "concat.txt");
  writeFileSync(
    listPath,
    [
      "ffconcat version 1.0",
      ...normalised.map((c) => `file ${quote(c.file)}`),
      "",
    ].join("\n"),
  );
  ffmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    mp4,
  ]);
}

if (!args.keep) rmSync(workDir, { recursive: true, force: true });

const [, , finalDuration] = probe(mp4, "stream=width,height:format=duration");
const total = Number(finalDuration);
const minutes = Math.floor(total / 60);
const seconds = (total % 60).toFixed(1);

console.log(
  `\n  ${mp4}  ${formatBytes(mp4)}\n` +
    `  ${width}x${frameHeight}, ${minutes}m ${seconds}s` +
    (xfade > 0 ? ` (${xfade}s dissolves)` : " (hard cuts)") +
    (speed === 1 ? "" : `, ${speed}x speed`) +
    (subtitled
      ? `\n  ${join(outDir, `${name}.srt`)}  ${cues.length} cues`
      : ""),
);
// The submission's own limit, and the only number here that can disqualify it.
if (total > 180) {
  console.log(
    `\n  ⚠ ${total.toFixed(1)}s is over the 3-minute submission limit.\n` +
      "    Shorten a clip's holds and re-render it, or drop one from --names.",
  );
}
console.log("");
