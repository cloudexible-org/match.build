#!/usr/bin/env node
/**
 * Turns a capture (`frames/*.png` + `manifest.json`) into the files a pitch
 * deck needs.
 *
 *   pnpm render:demo -- --name inbox-ai-reply
 *
 * The capture decides *what* is on screen and for how long; this decides what
 * that becomes. Nothing here re-reads the app, so iterating on pacing, format
 * or size never means re-running a browser — change the `hold` numbers in the
 * capture, or the flags here, and re-render.
 *
 * Three files land beside the frames, in `.scratch/marketing/demos/<name>/out/`:
 *
 *   <name>.mp4        1920x1080 by default — the clip that goes on a slide
 *   <name>.gif        downscaled, palette-optimised — email and chat, the one
 *                     format that animates everywhere
 *   <name>-poster.png closing frame — a still slide, or <video poster>
 *
 * Nothing is uploaded anywhere. `.scratch/` is gitignored, so re-rendering a
 * ten-megabyte clip twenty times costs nothing and leaves no trace in git
 * history; copy the file you want into the deck when you are happy with it.
 *
 * Needs ffmpeg on PATH (`brew install ffmpeg`), or `FFMPEG_PATH=/path/to/ffmpeg`.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const DEMOS_DIR = join(REPO_ROOT, ".scratch", "marketing", "demos");

/** `--name inbox --gif-fps 12 --no-gif` → `{ name, gifFps, gif: false }`. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key.startsWith("no-")) {
      out[camel(key.slice(3))] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[camel(key)] = true;
    } else {
      out[camel(key)] = next;
      i++;
    }
  }
  return out;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function ffmpeg(args) {
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    throw new Error(`ffmpeg failed:\n  ${args.join(" ")}\n\n${stderr}`);
  }
}

/**
 * Resolves the ffmpeg binary, preferring an explicit override.
 *
 * Checked up front rather than at the first encode: the transition expansion
 * runs before any output is written, so a missing binary would otherwise fail
 * several seconds in with a bare ENOENT.
 */
function resolveFfmpeg(override) {
  const bin = override || process.env.FFMPEG_PATH || "ffmpeg";
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return bin;
  } catch {
    throw new Error(
      `ffmpeg not found (tried "${bin}").\n` +
        "  macOS:  brew install ffmpeg\n" +
        "  Debian: sudo apt install ffmpeg\n" +
        "  Or point at one explicitly: FFMPEG_PATH=/path/to/ffmpeg",
    );
  }
}

function formatBytes(file) {
  const bytes = statSync(file).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const args = parseArgs(process.argv.slice(2));
const name = typeof args.name === "string" ? args.name : "inbox-ai-reply";
const inDir = resolve(args.in || join(DEMOS_DIR, name));
const outDir = resolve(args.out || join(inDir, "out"));
/**
 * The mp4's width. Captured frames are 2x the CSS viewport, which is more
 * pixels than any deck needs; downscaling to 1080p also sharpens the text,
 * because the downscale does the antialiasing the browser did not.
 */
const videoWidth = Number(args.width || 1920);
const gifFps = Number(args.gifFps || 12);
const gifWidth = Number(args.gifWidth || 800);
const crf = Number(args.crf || 20);

const FFMPEG = resolveFfmpeg(
  typeof args.ffmpeg === "string" ? args.ffmpeg : "",
);

const manifestPath = join(inDir, "manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error(
    `No capture at ${inDir}.\nRun the capture first:  pnpm capture:demo`,
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const { fps } = manifest;
const framesDir = join(inDir, "frames");
const workDir = join(inDir, ".render");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

/**
 * Renders the in-between frames of one dissolve with `xfade`.
 *
 * Both stills are looped into short constant-rate streams because `xfade`
 * blends two *videos*; `offset=0` starts the blend at the first output frame,
 * so the first `count` frames are exactly the transition and nothing else.
 */
function expandTransition(entry, index) {
  const count = Math.max(1, Math.round((entry.durationMs / 1000) * fps));
  const seconds = count / fps;
  const dir = join(workDir, `xfade-${String(index).padStart(3, "0")}`);
  mkdirSync(dir, { recursive: true });

  const pad = String(seconds + 1);
  ffmpeg([
    "-y",
    "-loop",
    "1",
    "-framerate",
    String(fps),
    "-t",
    pad,
    "-i",
    join(framesDir, entry.from),
    "-loop",
    "1",
    "-framerate",
    String(fps),
    "-t",
    pad,
    "-i",
    join(framesDir, entry.to),
    "-filter_complex",
    `[0][1]xfade=transition=${entry.style}:duration=${seconds}:offset=0`,
    "-frames:v",
    String(count),
    join(dir, "%04d.png"),
  ]);

  return Array.from({ length: count }, (_, i) =>
    join(dir, `${String(i + 1).padStart(4, "0")}.png`),
  );
}

// ── Flatten the timeline into (file, duration) pairs ────────────────────────
const shots = [];
let transitionIndex = 0;
for (const entry of manifest.timeline) {
  if (entry.kind === "frame") {
    shots.push({
      file: join(framesDir, entry.file),
      dur: entry.durationMs / 1000,
    });
  } else {
    for (const file of expandTransition(entry, transitionIndex++)) {
      shots.push({ file, dur: 1 / fps });
    }
  }
}

if (shots.length === 0) throw new Error("Capture timeline is empty.");

/**
 * The concat demuxer ignores the *final* entry's `duration`, so the last still
 * is listed twice — otherwise the closing frame flashes by in one frame rather
 * than holding, which is exactly where a viewer needs the pause most.
 */
const quote = (p) => `'${p.replaceAll("'", "'\\''")}'`;
const listPath = join(workDir, "concat.txt");
writeFileSync(
  listPath,
  [
    "ffconcat version 1.0",
    ...shots.map((s) => `file ${quote(s.file)}\nduration ${s.dur.toFixed(6)}`),
    `file ${quote(shots.at(-1).file)}`,
    "",
  ].join("\n"),
);

const totalMs = shots.reduce((sum, s) => sum + s.dur * 1000, 0);
mkdirSync(outDir, { recursive: true });

const CONCAT = ["-f", "concat", "-safe", "0", "-i", listPath];
/** Even dimensions: libx264's yuv420p needs both axes divisible by two. */
const SCALE = `scale=${videoWidth}:-2:flags=lanczos`;

const mp4 = join(outDir, `${name}.mp4`);
ffmpeg([
  "-y",
  ...CONCAT,
  "-vf",
  `fps=${fps},${SCALE},format=yuv420p`,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  String(crf),
  "-movflags",
  "+faststart",
  mp4,
]);

/**
 * GIF, for email and chat — the one format that animates everywhere, and the
 * reason this step exists. Two passes: a palette built from the whole clip
 * (`stats_mode=diff` weights pixels that actually change, which is the UI
 * rather than the background), then applied with an ordered dither, which
 * compresses far better than the default error-diffusion.
 */
const palette = join(workDir, "palette.png");
const gifChain = `fps=${gifFps},scale=${gifWidth}:-2:flags=lanczos`;
ffmpeg([
  "-y",
  ...CONCAT,
  "-vf",
  `${gifChain},palettegen=max_colors=128:stats_mode=diff`,
  palette,
]);

const gif = join(outDir, `${name}.gif`);
ffmpeg([
  "-y",
  ...CONCAT,
  "-i",
  palette,
  "-filter_complex",
  `[0:v]${gifChain}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  "-loop",
  "0",
  gif,
]);

// Poster: the closing frame, which is the payoff shot the flow builds to.
const posterSource =
  typeof args.poster === "string" ? resolve(args.poster) : shots.at(-1).file;
const poster = join(outDir, `${name}-poster.png`);
copyFileSync(posterSource, poster);

if (!args.keep) rmSync(workDir, { recursive: true, force: true });

console.log(
  [
    "",
    `  ${name} — ${(totalMs / 1000).toFixed(2)}s, ${shots.length} frames @ ${fps}fps`,
    `  captured ${manifest.width}x${manifest.height}, video ${videoWidth}px wide`,
    "",
    ...[mp4, gif, poster].map((f) => `  ${f}  ${formatBytes(f)}`),
    "",
  ].join("\n"),
);
