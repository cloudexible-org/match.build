# Feature demo clips

How a ten-second walkthrough of the app — the kind that goes on a pitch-deck
slide — gets produced from the E2E harness, and how to add one for a new
feature.

Everything lives in [`tooling/marketing`](../tooling/marketing). Nothing here
runs in CI or as part of `pnpm test:e2e`.

```bash
pnpm capture:demo                          # drive the app, write frames + a manifest
pnpm render:demo -- --name inbox-ai-reply  # render mp4 / gif / poster
```

## The demos

| Name | What it shows | For |
|---|---|---|
| `inbox-ai-reply` | The book → Sam's thread → a reply already drafted → edited → sent | The core claim: better than running a book out of Instagram DMs |

`capture:demo` runs every one of them. To film a single demo, name its spec:

```bash
pnpm --filter marketing exec playwright test captures/demos/inbox-ai-reply.spec.ts
```

Three files are rendered into `.scratch/marketing/demos/<name>/out/`:

| File | For |
|---|---|
| `<name>.mp4` | 1920×1080 — the clip on a slide, or `<video>` on the site |
| `<name>.gif` | 800px, 12fps, palette-optimised — email and chat, the only format that animates everywhere |
| `<name>-poster.png` | closing frame — a still slide, `<video poster>`, email fallback |

Nothing is uploaded anywhere, and nothing is written into the repo.
`.scratch/` is gitignored, so re-rendering costs nothing and puts no binaries
in git history; copy the file you want into the deck yourself.

Flags worth knowing: `--width 2560` for a bigger mp4, `--gif-width` /
`--gif-fps` for the GIF, `--crf` for quality, `--keep` to leave the
intermediate `xfade` frames behind for inspection.

---

## Why frames and a manifest, rather than a recording

Playwright records video directly, and that was the obvious first thing to try.
The problem is that a recording's pacing is the *run's* pacing: every Convex
round trip and every `waitFor` lands in the finished clip as dead air, and the
length changes from run to run. A ten-second demo cannot be cut from that by
trimming.

So the browser produces **stills plus a timeline** — what was on screen, and how
long each thing should be on screen for. Wall-clock time during capture stops
mattering: a step that took four seconds to settle becomes one frame held for
900ms. `scripts/render-demo.mjs` turns the pair into a clip of exactly the
intended length, and a re-run produces the same video.

The trade is that motion *within* a screen has to be asked for. A cursor glide
is N stills the script captures on purpose; a recorder does not pick it up free.

### The pointer is drawn into the page

Screenshots contain no cursor — the real pointer is an OS artefact the renderer
never sees — so a captured click is indistinguishable from a jump cut.
`lib/cursor.ts` injects a pointer the page itself owns, and therefore one that
appears in every PNG.

Its every visual is driven by an explicit setter, **never** a CSS animation.
Frames are captured one screenshot at a time, seconds of wall clock apart, so
anything self-animating would be sampled at whatever phase it happened to be in
— the click ripple would land half-drawn in one take and finished in the next.
The same init script also freezes the app's own transitions and the caret blink,
so two screenshots of the same state are byte-identical.

### Transitions are ffmpeg's job

Between screens the renderer interpolates with `xfade`, from just the two
endpoint stills the capture recorded. Doing it there rather than animating
in-page keeps the dissolve independent of whatever the app's router happens to
do, and identical on every re-run.

---

## Adding a demo for a new feature

1. **Write the capture** — copy `captures/demos/inbox-ai-reply.spec.ts`. It is a
   Playwright script, not a test: it asserts nothing, and the real coverage
   stays in `tooling/e2e/specs/`.

2. **Seed a photogenic world.** Give people real names *and real addresses*:
   the seeder namespaces anything it has to invent, so an unnamed candidate
   shows on camera as `sam.e7cd29bdc@matchmaker-e2e.test`. Pass explicit `name`
   and `email` for everyone visible; `example.com` is reserved by RFC 2606, so
   nothing you write can resolve to a real person. Slugs and usernames stay
   namespaced, so the rows are still isolated — and the username only ever
   appears in the URL, which a screenshot does not show.

3. **Reuse the page objects.** Import them through
   `@repo/harness/page-objects` rather than writing selectors — when a
   `data-testid` moves, the demo follows the suite instead of silently
   photographing the wrong element.

4. **Script the beats** with the `Director`:

   ```ts
   await director.hold(1100, "the book");            // a still, on screen 1100ms

   await director.transition(                         // press, dissolve, land
     async () => { await row.click(); await page.waitForLoadState("networkidle"); },
     { press: row, style: "fade", settleMs: 1400 },
   );

   await director.click(sendButton, { settleMs: 2000 });   // glide + ripple
   await director.scrollTo("conversation-messages", 280);  // smooth scroll
   await director.type(input, " Which one next?");         // typed, 3 chars a frame
   ```

   The durations *are* the edit. Change them, re-render, and the clip re-paces
   without touching a browser.

5. **Render and watch it.** `pnpm render:demo -- --name <name>`, then open the
   mp4.

6. **Keep it short.** Eight to twelve seconds. The capture prints its own total
   length when it finishes.

---

## Gotchas

- **`networkidle` is not "the screen has settled".** A Convex subscription can
  still have an update in flight when the network goes quiet, so the opening
  frame catches one state and every frame after it another — which reads as a
  glitch, not a load. Wait on the thing you are about to photograph, by
  *position* where position matters: `expect(list.getByRole("listitem")
  .first()).toContainText("Sam Okonkwo")`, not merely that the row exists.

- **Anything modal will ruin the shot.** Dismiss the push nudge and pin the
  theme in an `addInitScript` before the first navigation — an init script only
  applies to documents opened *after* it is registered, so a page that is
  already loaded keeps running without it. The push nudge is the one to watch:
  it appears just after a message is sent, which is exactly where a chat demo
  ends.

- **A click moves the caret.** `Director.type` puts the caret at the end of
  whatever the field already holds, because it has to click to focus and the
  click lands the caret under the pointer — mid-sentence, in a composer holding
  a drafted reply. Pressing End does not survive the click, and in a textarea
  only reaches the end of the *line*.

- **Locators that are fine in a spec can be ambiguous on camera.** A demo puts
  the app in states a spec never combines. A drafted reply's card carries its
  own Send, so an unscoped `getByRole("button", { name: /^Send/ })` matches two.
  Fix it in the page object, not in the capture — the suite will confirm the
  tighter locator, and the next spec to reach that state is spared.

- **Ordering is data, not layout.** The candidate list is ordered by the
  conversation's `lastMessageAt`, and the seeder ends every thread at the same
  `now`, so the whole book ties and the index breaks the tie on
  `_creationTime`. Whoever you seed *last* is at the top. Seed the star of the
  demo last.

- **Frames are gitignored.** One clip is ~70 PNGs at 2880×1620. Only what you
  copy out of `.scratch/` survives.
