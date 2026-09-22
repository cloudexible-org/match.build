/**
 * The synthetic pointer drawn into the page for demo capture.
 *
 * Playwright's screenshots contain no cursor — the real pointer is an OS
 * artefact the renderer never sees — so a captured click is indistinguishable
 * from a jump cut. This injects a pointer the page *does* own, and therefore
 * one that appears in every PNG.
 *
 * **Every visual is driven by an explicit setter, never by a CSS animation.**
 * Frames are captured one screenshot at a time, seconds of wall clock apart, so
 * anything self-animating would be sampled at whatever phase it happened to be
 * in — the ripple would land half-drawn in one take and finished in the next.
 * `ripple(progress)` takes the phase as an argument instead, which is what makes
 * a re-run produce the same clip.
 */

/** Injected as `window.__demo`. Kept structural so the Director can type it. */
export interface DemoOverlay {
  /** Moves the pointer to viewport coordinates and shows it. */
  cursor(x: number, y: number): void;
  hide(): void;
  /** Draws the click ring at phase `p` (0 → 1). Any `p < 0` clears it. */
  ripple(p: number): void;
}

declare global {
  interface Window {
    __demo?: DemoOverlay;
  }
}

/** Tunables the init script closes over, since `addInitScript` takes one arg. */
export interface CursorStyle {
  /** Pointer diameter in CSS pixels. */
  size: number;
  /** Fill of the pointer body. */
  fill: string;
  /** Border around the pointer body — what defines it against a light surface. */
  ring: string;
  /**
   * The expanding click ring. Separate from `ring` because the two are read
   * against different things: the border sits on the white dot, while the
   * ripple expands across the app's own background.
   */
  ripple: string;
}

export const DEFAULT_CURSOR: CursorStyle = {
  // Larger than a phone capture's would be: these clips are shown scaled down
  // into a slide, and a 26px dot on a 1440-wide screen disappears at that size.
  size: 30,
  // White body on a dark ring reads on both light and dark screens: on a light
  // surface the ring and shadow define it, on a dark one the body does.
  fill: "rgba(255,255,255,0.94)",
  ring: "rgba(17,17,17,0.85)",
  ripple: "rgba(120,120,130,0.95)",
};

/**
 * Suppresses everything that varies between two screenshots of the *same*
 * state: the caret blink, scrollbar gutters, and the app's own transitions.
 *
 * Durations go to 1ms rather than 0 — several Base UI primitives unmount on
 * `transitionend`/`animationend`, and a zero duration in Chromium fires no such
 * event, leaving a dialog that never closes.
 */
export const STILL_CSS = `
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
  * { caret-color: transparent !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html { scrollbar-width: none !important; }
`;

/** The single argument `bootstrap` receives, since `addInitScript` takes one. */
export interface BootstrapArg {
  style: CursorStyle;
  css: string;
  /**
   * Install the stillness CSS but no pointer overlay.
   *
   * For a `Director` companion page: a clip has one cursor, and it belongs to
   * whichever page is being driven. The companion still needs its animations
   * frozen, or two screenshots of the same state would differ.
   */
  hidden?: boolean;
}

/**
 * Runs before any page script, on every navigation — so both the pointer and
 * the stillness CSS survive the client-side routing a demo flow is made of.
 *
 * Must stay self-contained: Playwright serialises this function to inject it,
 * so it cannot reference anything in module scope beyond its own argument.
 *
 * The layer mounts on `documentElement` rather than `body` because React owns
 * `body`'s subtree and will unmount a stray child during a route change.
 */
export function bootstrap({ style, css, hidden }: BootstrapArg): void {
  const mount = (): void => {
    const root = document.documentElement;
    if (!root) return;

    if (!document.getElementById("__demo-css")) {
      const tag = document.createElement("style");
      tag.id = "__demo-css";
      tag.textContent = css;
      root.appendChild(tag);
    }

    if (hidden) return;
    if (document.getElementById("__demo-layer")) return;

    const layer = document.createElement("div");
    layer.id = "__demo-layer";
    layer.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483647";

    const circle = (extra: string): HTMLDivElement => {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:absolute",
        "top:0",
        "left:0",
        `width:${style.size}px`,
        `height:${style.size}px`,
        "border-radius:9999px",
        "opacity:0",
        "will-change:transform",
        extra,
      ].join(";");
      return el;
    };

    const ring = circle(`border:3px solid ${style.ripple}`);
    const dot = circle(
      `background:${style.fill};border:2px solid ${style.ring};box-shadow:0 2px 10px rgba(0,0,0,0.45)`,
    );

    layer.append(ring, dot);
    root.appendChild(layer);

    let cx = -100;
    let cy = -100;

    const place = (
      el: HTMLElement,
      x: number,
      y: number,
      scale: number,
    ): void => {
      const half = style.size / 2;
      el.style.transform = `translate(${x - half}px, ${y - half}px) scale(${scale})`;
    };

    window.__demo = {
      cursor(x: number, y: number) {
        cx = x;
        cy = y;
        dot.style.opacity = "1";
        place(dot, x, y, 1);
      },
      hide() {
        dot.style.opacity = "0";
        ring.style.opacity = "0";
      },
      ripple(p: number) {
        if (p < 0) {
          ring.style.opacity = "0";
          place(dot, cx, cy, 1);
          return;
        }
        // The ring expands to ~2.6x and fades; the pointer body dips on contact,
        // which is what sells it as a press rather than a halo.
        ring.style.opacity = String(Math.max(0, 0.85 * (1 - p)));
        place(ring, cx, cy, 0.5 + p * 2.1);
        place(dot, cx, cy, 1 - 0.18 * Math.sin(p * Math.PI));
      },
    };
  };

  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}
