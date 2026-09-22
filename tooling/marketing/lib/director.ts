import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
  bootstrap,
  type CursorStyle,
  DEFAULT_CURSOR,
  STILL_CSS,
} from "./cursor";

/**
 * Records a feature walkthrough as *timed frames* rather than as video.
 *
 * Playwright can record webm directly, and that is the obvious first choice —
 * but a recording's pacing is the run's pacing, so every Convex round trip and
 * every `waitFor` lands in the finished clip as dead air, and the length
 * changes from run to run. A twelve-second demo cannot be built by trimming
 * that.
 *
 * So the browser produces stills and a *timeline*: how long each still is on
 * screen, and where one screen dissolves into the next. Wall-clock time during
 * capture becomes irrelevant — a step that took four seconds to settle is one
 * frame held for 900ms — and `scripts/render-demo.mjs` turns the pair into a
 * clip of exactly the intended length. Re-running it produces the same clip.
 *
 * The cost is that motion *within* a screen has to be asked for: a cursor glide
 * is N stills this asks for on purpose (`moveTo`), not something a recorder
 * picks up for free.
 */

/** ffmpeg `xfade` transition names, narrowed to the ones that suit UI screens. */
export type TransitionStyle =
  | "fade"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "smoothleft"
  | "wipeleft";

export type TimelineEntry =
  | { kind: "frame"; file: string; durationMs: number; label?: string }
  | {
      kind: "transition";
      from: string;
      to: string;
      style: TransitionStyle;
      durationMs: number;
      label?: string;
    };

export interface DemoManifest {
  name: string;
  fps: number;
  /** Device pixels, i.e. viewport × `deviceScaleFactor` — what the PNGs are. */
  width: number;
  height: number;
  /**
   * Set when a companion page was filmed alongside the main one. Every still
   * in `timeline` then exists twice — `frames/<file>` and `frames-b/<file>` —
   * and `render-demo.mjs` composites the pair left-to-right before it renders
   * anything. `width` above is the *combined* width.
   */
  companion?: boolean;
  timeline: TimelineEntry[];
}

export interface DirectorOptions {
  /** Output basename; also the folder under `.scratch/marketing/demos/`. */
  name: string;
  /** Where `frames/` and `manifest.json` are written. */
  outDir: string;
  /** Frame rate the timeline is quantised to. */
  fps?: number;
  /** CSS-pixel viewport, which the manifest scales by `deviceScaleFactor`. */
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  cursor?: CursorStyle;
  /**
   * A second page photographed at the same instant as the main one, and
   * composited to its right by the renderer.
   *
   * For the clips whose subject is *two people at once* — a candidate writing
   * on his phone while the matchmaker's book updates under her. Filming that
   * as two separate takes would prove nothing: the whole claim is that the two
   * screens moved together, and only one screenshot pair per beat can show it.
   *
   * The caller owns this page: its own context, its own session, and its own
   * viewport, whose width need not match the main one (a phone beside a
   * laptop is the point). The cursor overlay is *not* installed on it — there
   * is one pointer in a clip, and it belongs to the page being driven — but
   * the still-frame CSS is, or its animations would sample at a different
   * phase in every frame.
   */
  companion?: { page: Page; viewport: { width: number; height: number } };
}

interface Point {
  x: number;
  y: number;
}

/** Cubic ease-in-out — the pointer accelerates away and settles onto its target. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Director {
  private readonly page: Page;
  private readonly opts: Required<
    Omit<DirectorOptions, "cursor" | "companion">
  > & {
    cursor: CursorStyle;
    companion?: DirectorOptions["companion"];
  };
  private readonly framesDir: string;
  /** Only written when a companion page is being filmed. */
  private readonly companionFramesDir: string;
  private readonly timeline: TimelineEntry[] = [];

  private seq = 0;
  /** Pointer position in CSS pixels. Starts off-stage so the first move slides in. */
  private pos: Point;
  private ripplePhase = -1;
  private cursorVisible = true;

  constructor(page: Page, options: DirectorOptions) {
    this.page = page;
    this.opts = {
      fps: 30,
      cursor: DEFAULT_CURSOR,
      ...options,
    };
    this.framesDir = join(options.outDir, "frames");
    this.companionFramesDir = join(options.outDir, "frames-b");
    this.pos = {
      x: options.viewport.width / 2,
      y: options.viewport.height + 60,
    };
  }

  private get frameMs(): number {
    return 1000 / this.opts.fps;
  }

  /**
   * Installs the overlay and clears any frames from a previous run.
   *
   * Must be called before the first navigation: `addInitScript` applies to
   * documents opened *after* it is registered, so a page already loaded keeps
   * running without the overlay and every screenshot comes back cursorless.
   */
  async start(): Promise<void> {
    rmSync(this.framesDir, { recursive: true, force: true });
    mkdirSync(this.framesDir, { recursive: true });
    await this.page.addInitScript(bootstrap, {
      style: this.opts.cursor,
      css: STILL_CSS,
    });

    const { companion } = this.opts;
    if (companion) {
      rmSync(this.companionFramesDir, { recursive: true, force: true });
      mkdirSync(this.companionFramesDir, { recursive: true });
      // The still-frame CSS, but no pointer: a clip has one cursor, and it
      // belongs to whichever page is being driven. `hidden: true` makes
      // `bootstrap` install the freeze and skip the overlay.
      await companion.page.addInitScript(bootstrap, {
        style: this.opts.cursor,
        css: STILL_CSS,
        hidden: true,
      });
    }
  }

  /** Pushes the overlay's state into the page, then captures one still. */
  private async shoot(): Promise<string> {
    await this.page.evaluate(
      ({ x, y, r, visible }) => {
        const demo = window.__demo;
        if (!demo) return;
        if (!visible) {
          demo.hide();
          return;
        }
        demo.cursor(x, y);
        demo.ripple(r);
      },
      {
        x: this.pos.x,
        y: this.pos.y,
        r: this.ripplePhase,
        visible: this.cursorVisible,
      },
    );

    const file = `${String(++this.seq).padStart(4, "0")}.png`;
    await this.page.screenshot({
      path: join(this.framesDir, file),
      animations: "disabled",
      caret: "hide",
    });

    /**
     * The companion is photographed under the *same* name, immediately after.
     * "Immediately" is the whole contract: the pair is what lets the finished
     * clip claim the two screens moved together, so nothing may be awaited
     * between them beyond the screenshots themselves.
     */
    const { companion } = this.opts;
    if (companion) {
      await companion.page.screenshot({
        path: join(this.companionFramesDir, file),
        animations: "disabled",
        caret: "hide",
      });
    }
    return file;
  }

  /** Captures one still and holds it for `ms` of finished video. */
  async hold(ms: number, label?: string): Promise<void> {
    const file = await this.shoot();
    this.timeline.push({ kind: "frame", file, durationMs: ms, label });
  }

  /** Captures one still that lasts a single frame. */
  private async tick(): Promise<void> {
    const file = await this.shoot();
    this.timeline.push({ kind: "frame", file, durationMs: this.frameMs });
  }

  /** Takes the pointer off the shot, for a beat that is about the screen. */
  async hideCursor(): Promise<void> {
    this.cursorVisible = false;
  }

  async showCursor(): Promise<void> {
    this.cursorVisible = true;
  }

  /** Viewport-relative centre of a locator, scrolled into view first. */
  private async centreOf(target: Locator): Promise<Point> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) {
      throw new Error(
        "Cannot aim the demo pointer at a locator with no bounding box — " +
          "it is detached or not visible.",
      );
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Glides the pointer to a target over `frames` stills. */
  async moveTo(target: Locator | Point, frames = 9): Promise<void> {
    const to = "x" in target ? target : await this.centreOf(target);
    const from = this.pos;
    for (let i = 1; i <= frames; i++) {
      const t = ease(i / frames);
      this.pos = { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
      await this.tick();
    }
  }

  /**
   * Glides to a control, presses it, and holds the result.
   *
   * The real click fires between the ripple's first and second frame, so the
   * press is visible *before* the UI reacts and the ring then expands over the
   * new state — the order a viewer reads as cause and effect.
   */
  async click(
    target: Locator,
    opts: { settleMs?: number; rippleFrames?: number; label?: string } = {},
  ): Promise<void> {
    const { settleMs = 700, rippleFrames = 6, label } = opts;

    await this.moveTo(target);

    this.ripplePhase = 0;
    await this.tick();

    await target.click();
    // Let the click's own state change land before photographing the ripple
    // over it; without this the first ripple frame still shows the old screen.
    await this.page.waitForTimeout(120);

    for (let i = 1; i <= rippleFrames; i++) {
      this.ripplePhase = i / rippleFrames;
      await this.tick();
    }
    this.ripplePhase = -1;

    await this.hold(settleMs, label);
  }

  /**
   * Types into a field, `chunk` characters per frame.
   *
   * Per-character frames read as unnaturally slow at 30fps and cost a
   * screenshot each; two or three at a time looks like ordinary typing.
   *
   * The caret is put at the end of whatever the field already holds, because
   * this has to click the field to focus it and a click drops the caret
   * wherever the pointer landed — which, in a field holding a drafted reply,
   * is the middle of a sentence. Pressing End first does not survive that
   * click, and would only reach the end of the *line* in a textarea anyway;
   * setting the selection directly is both correct and independent of the
   * platform's key bindings.
   *
   * Only *some* inputs have a selection to set. `setSelectionRange` throws
   * `InvalidStateError` on `email`, `number`, `date` and the rest of the typed
   * inputs — HTML only defines the selection APIs for `text`, `search`, `url`,
   * `tel` and `password` — so the call is made where it is defined and skipped
   * where it is not. Skipping costs nothing: a field with no selection API is
   * one the app holds no draft in, so the click that focused it has already put
   * the caret at the end of whatever short value is there.
   */
  async type(
    target: Locator,
    text: string,
    opts: { chunk?: number; settleMs?: number } = {},
  ): Promise<void> {
    const { chunk = 3, settleMs = 500 } = opts;
    await target.click();
    await target.evaluate((el) => {
      const SELECTABLE = ["text", "search", "url", "tel", "password"];
      if (el instanceof HTMLTextAreaElement) {
        el.setSelectionRange(el.value.length, el.value.length);
      } else if (
        el instanceof HTMLInputElement &&
        SELECTABLE.includes(el.type)
      ) {
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    for (let i = 0; i < text.length; i += chunk) {
      await target.pressSequentially(text.slice(i, i + chunk), { delay: 0 });
      await this.tick();
    }
    await this.hold(settleMs);
  }

  /**
   * Scrolls one of the app's scroll containers to `top`, over `frames` stills.
   *
   * `apps/app` scrolls inner elements, not the window — the three columns each
   * have their own scroller — so `window.scrollTo` moves nothing and the frames
   * come back identical. Pass the container's `data-testid`
   * (`workspace-candidates-scroll`, `conversation-messages`); the fallback is
   * the first Base UI scroll-area viewport on the page.
   */
  async scrollTo(
    testId: string | null,
    top: number,
    frames = 8,
  ): Promise<void> {
    const selector = testId
      ? `[data-testid="${testId}"]`
      : '[data-slot="scroll-area-viewport"], main, .overflow-y-auto';

    const start = await this.page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      return el ? el.scrollTop : window.scrollY;
    }, selector);

    for (let i = 1; i <= frames; i++) {
      const y = lerp(start, top, ease(i / frames));
      await this.page.evaluate(
        ({ sel, next }: { sel: string; next: number }) => {
          const el = document.querySelector(sel);
          if (el) el.scrollTop = next;
          else window.scrollTo(0, next);
        },
        { sel: selector, next: y },
      );
      await this.tick();
    }
  }

  /**
   * Runs a navigation and records a dissolve across it.
   *
   * Only the two endpoints are captured; `render-demo.mjs` interpolates the
   * frames between them with ffmpeg's `xfade`. Doing it that way rather than
   * animating in-page keeps the transition independent of whatever the app's
   * own router animation happens to be, and identical on every re-run.
   */
  async transition(
    navigate: () => Promise<void>,
    opts: {
      /**
       * The control the navigation comes from. Given one, the pointer glides to
       * it and the press is captured *before* the dissolve, so the clip reads
       * as "clicked that, went there" rather than as an unexplained cut.
       *
       * Only the press is drawn, never the ripple's full expansion: a ring
       * still growing while the screen slides out competes with the slide.
       */
      press?: Locator;
      style?: TransitionStyle;
      durationMs?: number;
      settleMs?: number;
      label?: string;
    } = {},
  ): Promise<void> {
    const {
      press,
      style = "fade",
      durationMs = 320,
      settleMs = 800,
      label,
    } = opts;

    if (press) {
      await this.moveTo(press);
      this.ripplePhase = 0;
      await this.tick();
      this.ripplePhase = 0.45;
      await this.tick();
    }

    const from = await this.shoot();
    // Cleared before the destination is photographed: the ring belongs to the
    // screen being left, and would otherwise be blended into the new one.
    this.ripplePhase = -1;
    await navigate();
    const to = await this.shoot();

    this.timeline.push({
      kind: "transition",
      from,
      to,
      style,
      durationMs,
      label,
    });
    this.timeline.push({
      kind: "frame",
      file: to,
      durationMs: settleMs,
      label,
    });
  }

  /** Total length of the finished clip, in milliseconds. */
  get durationMs(): number {
    return this.timeline.reduce((sum, e) => sum + e.durationMs, 0);
  }

  /** Writes `manifest.json` beside `frames/`. Returns the finished timeline. */
  finish(): DemoManifest {
    const { companion, viewport, deviceScaleFactor } = this.opts;
    // Combined, when there are two pages: what the renderer will emit after it
    // composites each pair, which is what `width` has to describe.
    const cssWidth = viewport.width + (companion?.viewport.width ?? 0);
    const manifest: DemoManifest = {
      name: this.opts.name,
      fps: this.opts.fps,
      width: cssWidth * deviceScaleFactor,
      height: viewport.height * deviceScaleFactor,
      ...(companion ? { companion: true } : {}),
      timeline: this.timeline,
    };
    writeFileSync(
      join(this.opts.outDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return manifest;
  }
}
