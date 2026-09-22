# Feature demo clips

How a ten-second walkthrough of the app — the kind that goes on a pitch-deck
slide — gets produced from the E2E harness, and how to add one for a new
feature.

Everything lives in [`tooling/marketing`](../tooling/marketing). Nothing here
runs in CI or as part of `pnpm test:e2e`.

```bash
pnpm capture:demo                          # drive the app, write frames + a manifest
pnpm render:demo -- --name inbox-ai-reply  # render mp4 / gif / poster
pnpm stitch:demo                           # join the rendered clips into one film
```

## The demos

In the running order [`stitch-demo.mjs`](../tooling/marketing/scripts/stitch-demo.mjs)
joins them in, which is also the order the narration in
[`demo-script.md`](./demo-script.md) is written against — change the two
together.

| Name | What it shows | For |
|---|---|---|
| `onboard-invite` | The book → Onboard → an address, a handle, the DMs pasted in → the thread, history and all, marked "Only visible to you" | The problem: a book that lives in Instagram DMs, and the one move that gets it out |
| `inbox-ai-reply` | The book → Sam's thread → a reply already drafted → edited → sent | The core claim: better than running a book out of Instagram DMs |
| `profile-builds-itself` | A proposed fact, quoting the sentence it came from → approved → named in the History | "AI drafts, you decide", and the audit trail behind it |
| `match-board` | An empty board over a full book → **a real scoring run** → a card's reasons → moved to Introduced | What the book is *for*, and that the scorer explains itself |
| `candidate-view` | Maya's thread, private note and all → the same thread as Sam, without it | Tenancy, shown rather than claimed |
| `realtime-two-up` | Her laptop beside his phone; he sends, both move | Convex subscriptions, in the only form that proves anything |
| `admin-ai-cost` | Tokens and dollars, by agent, by day, by model | That the AI is metered, and the product costed |

Two of them need more than the defaults:

- **`realtime-two-up` films two pages at once.** The Director takes a
  `companion` page and photographs it at every beat under the same frame name;
  the renderer pastes the pair side by side before it encodes anything. See
  *Two screens at once* below.
- **`admin-ai-cost` drives `apps/admin`, not `apps/app`.** Its filename starts
  with `admin-`, which is what the `capture-admin` project in
  `playwright.config.ts` matches to give it the right `baseURL`. Any future
  admin capture needs the same prefix.

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
`--gif-fps` for the GIF, `--crf` for quality, `--two-up-gap` / `--two-up-gap-color`
for the gutter in a two-up clip, `--keep` to leave the
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

### Two screens at once

`realtime-two-up` has to show a candidate's phone and a matchmaker's laptop
moving *together*; filming them separately and cutting between would demonstrate
nothing, since the whole claim is simultaneity.

So the `Director` takes a **companion page**. It belongs to the caller — its own
browser context, its own session, its own viewport — and at every beat it is
photographed immediately after the main page, under the same frame number, into
`frames-b/`. `render-demo.mjs` sees `companion: true` in the manifest and pastes
each pair side by side before anything else runs, so the concat list, the
`xfade` expansion and the GIF palette all keep seeing one directory of numbered
stills.

Two details are load-bearing:

- **A dark gutter between the halves.** Butted together, two takes of the same
  app in the same palette read as a single window with an extra column, and the
  shot says nothing. `--two-up-gap 0` removes it if you want that.
- **No cursor on the companion.** A clip has one pointer and it belongs to the
  page being driven. `Director.type` clicks its target directly and works on
  either page, but `Director.click` *glides the pointer*, so it must not be
  aimed at a companion locator — the pointer would move across the wrong screen
  to coordinates from the other one. Click companion controls directly and hold.

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
   nothing you write can resolve to a real person. Slugs stay namespaced, so
   the rows are still isolated.

   The **username** needs a decision rather than a default. In the matchmaker's
   own workspace it only appears in the URL, which a screenshot does not show,
   so the seeder's `<ns>.<key>` is fine. The *candidate* shell prints it under
   the matchmaker's name in two places — `candidate-view` and
   `realtime-two-up` therefore pass an explicit one, and pass a *different* one
   each, because `capture:demo` seeds every scenario into a single backend and
   two captures claiming one username collide.

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

## Stitching the clips into one film

```bash
pnpm stitch:demo                                    # the default running order
pnpm stitch:demo -- --names match-board,candidate-view
pnpm stitch:demo -- --xfade 0                       # hard cuts
```

Writes `.scratch/marketing/demos/_stitched/match-build-demo.mp4`, with the
narration burned in and a matching `.srt` beside it. The running
order lives in `DEFAULT_ORDER` in
[`stitch-demo.mjs`](../tooling/marketing/scripts/stitch-demo.mjs) and is an
argument rather than a tour — the problem, the daily work, what that work
builds, what it is for, who else is in it, that it is live, what it costs.
[`demo-script.md`](./demo-script.md) is the narration written against it;
change the two together.

Each clip is scaled onto a common canvas and re-encoded rather than
stream-copied, because the clips are not all the same size — a two-up capture is
wider than a single screen — and because a hard cut between two pale screens of
the same app reads as a glitch rather than as a new scene. Joining is kept
separate from rendering so that re-cutting the film costs one encode and no
browser.

The film plays at **0.95×** — five percent slower than it was filmed, because it
is narrated over and speech wants more air than watching does. `--speed 1`
gives the captured pacing back.

The script prints the finished length and **warns if it goes over three
minutes**, which is the hackathon submission's own limit. To shorten it, cut a
clip's `hold` numbers and re-render that clip — not the whole film.

### Cards, and why the film has them

The first cut was seven clips joined by dissolves, and it played as seven demos
in a row: nothing carried from one to the next, and the matchmaker on screen was
never introduced. The fix is in the edit, not the footage.

`stitch-demo.mjs` reads [`demo-script.md`](./demo-script.md) for two more things
besides the narration — a `## Title card` blockquote, and a `**Card:**` line in
each scene — and inserts each as a **segment of its own**: the picture stops,
a held title sits on a dark frame for about two seconds, and the next scene
begins. That pause is the punctuation. It ends one thought, tells the viewer a
new one is starting, and gives the narrator somewhere to breathe.
`--title-card` / `--scene-card` change how long they hold; a scene with no
`**Card:**` line simply gets none.

### Subtitles

The cards come from the blockquotes in
[`demo-script.md`](./demo-script.md) — parsed, split into at most fourteen words
apiece and given a share of their clip's running time proportional to their word
count, so each card is on screen for about as long as it takes to say. That is
what makes the film usable as a teleprompter. `--no-subtitles` renders it clean.

Two things about them are not obvious:

- **They are drawn in Chromium, not by ffmpeg.** This machine's ffmpeg is built
  without libass *and* without libfreetype, so `subtitles` and `drawtext` are
  both missing and `overlay` is the only route text has into the picture. Each
  cue becomes a transparent PNG rendered by the browser already in the
  dependency tree, which also gets real line breaking and the project's own
  colours for free. See [`lib/subtitles.mjs`](../tooling/marketing/lib/subtitles.mjs).
- **They sit in a band below the picture, not over it.** This app keeps the
  things a demo is about at the bottom of the screen — the suggestion card with
  its quote and its Accept button is directly above the composer, and so is
  Send. An overlaid caption covered exactly those. The band costs 170px of
  frame height (`--band-height`) and occludes nothing.

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
