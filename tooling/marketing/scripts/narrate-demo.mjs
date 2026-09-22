#!/usr/bin/env node
/**
 * Lays a narration recording over the stitched film.
 *
 *   pnpm narrate:demo -- --audio ~/Desktop/take-3.m4a
 *   pnpm narrate:demo -- --audio take-3.m4a --offset 0.4   # start 0.4s later
 *   pnpm narrate:demo -- --audio take-3.m4a --gain 3       # 3dB louder
 *
 * Writes `<film>-narrated.mp4` beside the silent one, leaving the original
 * alone so a bad take costs nothing.
 *
 * ── Why this is a script and not one ffmpeg command ─────────────────────────
 *
 * The command itself is short. What is not obvious, and what costs a re-record
 * if you get it wrong, is everything around it:
 *
 * - **The video is never re-encoded.** `-c:v copy` remuxes the picture
 *   untouched, so laying a fourth take over it is instant and lossless. Only
 *   the audio is encoded.
 * - **A length mismatch is reported, not silently cut.** `-shortest` would
 *   quietly truncate whichever stream ran long — usually the narration, losing
 *   the last sentence — so this compares the two first and says what it found.
 *   Audio shorter than the picture is fine and is padded with silence; audio
 *   longer is a warning, because the film would end mid-word.
 * - **`--offset` shifts the voice, not the picture.** Positive delays the
 *   narration (you started speaking too early), negative trims its head (you
 *   left dead air before the first word). Either way the subtitles and the
 *   footage stay exactly where they were.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const STITCHED = join(REPO_ROOT, ".scratch", "marketing", "demos", "_stitched");

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

const args = parseArgs(process.argv.slice(2));
const FFMPEG = resolveFfmpeg(
  typeof args.ffmpeg === "string" ? args.ffmpeg : "",
);
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");

const duration = (file) =>
  Number(
    execFileSync(
      FFPROBE,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" },
    ).trim(),
  );

const name = typeof args.name === "string" ? args.name : "match-build-demo";
const video = resolve(args.video || join(STITCHED, `${name}.mp4`));
const out = resolve(args.out || join(STITCHED, `${name}-narrated.mp4`));
const offset = Number(args.offset || 0);
const gain = Number(args.gain || 0);

if (typeof args.audio !== "string") {
  throw new Error(
    "Pass the recording:  pnpm narrate:demo -- --audio <file>\n" +
      "Any format ffmpeg reads is fine — m4a, wav, mp3, aiff.",
  );
}
const audio = resolve(args.audio);

for (const [label, file] of [
  ["film", video],
  ["audio", audio],
]) {
  if (!existsSync(file)) {
    throw new Error(
      `No ${label} at ${file}.` +
        (label === "film" ? "\nStitch it first:  pnpm stitch:demo" : ""),
    );
  }
}

const videoSeconds = duration(video);
const audioSeconds = duration(audio) + offset;
const drift = audioSeconds - videoSeconds;

console.log(
  `\n  film   ${videoSeconds.toFixed(2)}s  ${video}\n` +
    `  voice  ${audioSeconds.toFixed(2)}s  ${audio}` +
    (offset === 0 ? "" : `  (offset ${offset > 0 ? "+" : ""}${offset}s)`),
);

/**
 * The audio filter chain.
 *
 * `adelay` takes milliseconds and needs one value per channel, so `all=1`
 * applies it to every channel without knowing how many there are. A negative
 * offset is a trim off the front instead, which is `atrim` plus a PTS reset —
 * without `asetpts` the trimmed audio keeps its original timestamps and starts
 * exactly where it would have anyway.
 */
const filters = [];
if (offset > 0) filters.push(`adelay=${Math.round(offset * 1000)}:all=1`);
else if (offset < 0)
  filters.push(`atrim=start=${Math.abs(offset)}`, "asetpts=PTS-STARTPTS");
if (gain !== 0) filters.push(`volume=${gain}dB`);
// Pad the tail so a short take still produces a file the length of the film,
// rather than one that ends when the voice does.
filters.push("apad");

execFileSync(
  FFMPEG,
  [
    "-y",
    "-i",
    video,
    "-i",
    audio,
    "-filter_complex",
    `[1:a]${filters.join(",")}[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    // The picture is remuxed untouched: relaying another take over it is
    // instant, and the film never loses a generation to re-encoding.
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    // Ends the file with the picture. The tail is padded above, so this only
    // ever cuts audio that ran *past* the film — which is reported below.
    "-shortest",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const size = `${Math.round(statSync(out).size / 1024).toLocaleString()} KB`;
console.log(`\n  ${out}  ${size}`);

if (drift > 0.5) {
  console.log(
    `\n  ⚠ the narration runs ${drift.toFixed(1)}s past the end of the film,\n` +
      "    so its last words are cut. Either trim the recording, or give the\n" +
      "    film more room: lengthen a hold in the capture and re-render that\n" +
      "    clip, or re-stitch with a lower --speed.",
  );
} else if (drift < -3) {
  console.log(
    `\n  ⓘ the film outlasts the narration by ${Math.abs(drift).toFixed(1)}s,\n` +
      "    which is padded with silence. Fine if that is the ending you want.",
  );
}
console.log("");
