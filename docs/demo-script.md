# Demo narration script

The voiceover for the stitched demo film — what to say, and when.

```bash
pnpm capture:demo     # film all seven clips
pnpm render:demo -- --name <each>
pnpm stitch:demo      # → .scratch/marketing/demos/_stitched/match-build-demo.mp4
```

**These words are burned into the film.** `stitch-demo.mjs` reads the
blockquotes below straight out of this file, cuts them into cards and lays them
under the picture, so the subtitles and this script cannot drift apart — edit a
line here, re-stitch, and the film says the new line. A matching `.srt` is
written beside the mp4.

So the way to record is simply to **read each card while it is on screen**. The
cards are timed by word count, which means one that takes longer to say is on
screen for longer, and a narrator who keeps pace with a clip's cards finishes
with the clip.

The film runs **1:45** at 0.95× — a deliberate five percent slower than it was
filmed, to leave air to speak into — and is well inside the three-minute
submission limit. The running order is `DEFAULT_ORDER` in
[`stitch-demo.mjs`](../tooling/marketing/scripts/stitch-demo.mjs); this script is
written against it, so if you reorder one, reorder both, and the section count
has to match the clip count or the stitch refuses to run.

Section timings below are where each *clip* starts and ends in the finished
film. They are for orientation — the cards on screen are the real cue.

---

## The script

### 1 · Onboard & invite — 0:00 – 0:17

*On screen: a book with three candidates → Onboard → an address, a name, an
Instagram handle, the DMs pasted in → the thread arrives with its history,
marked "Only visible to you".*

> Independent matchmakers run their whole business out of Instagram DMs.
> match.build gets them out of it. Paste the conversation you've already had,
> send one invitation — and the history comes with you, marked private.
> Yours, not theirs.

### 2 · The inbox and a drafted reply — 0:16 – 0:31

*On screen: the book in one column, Sam's thread in the next, a reply already
drafted above the composer → she edits it → she sends it.*

> Now the whole book is one screen. Every candidate, every thread — and a reply
> already drafted in her voice, by OpenAI's models through Convex's AI gateway.
> She edits it. She sends it. She stays the matchmaker.

### 3 · The profile builds itself — 0:31 – 0:49

*On screen: Sam mentions children → the Profile panel → a proposed fact quoting
his own sentence → approved → the History entry naming both of them.*

> Each person's profile builds itself out of what they actually say. But the
> agent never edits the record — it proposes, and quotes the sentence it heard,
> so she can check it. She approves. And the history names them both:
> suggested by the assistant, approved by her.

### 4 · The match board — 0:49 – 1:07

*On screen: an empty board over a full book → **Find matches** → scored cards
with reasons → one card expanded → moved to Introduced.*

> Then the book reads itself as pairs. That run is real — a deterministic scorer
> over every profile, running in Convex. No model, no black box. Every card
> shows its reasons, including the ones against. She moves it forward.
> It never moves itself.

### 5 · The candidate's own view — 1:06 – 1:23

*On screen: Maya's thread including her private note → dissolve → the same
thread as Sam, without it → he replies.*

> Her candidate signs in and sees the same conversation — without the note she
> wrote to herself. Same thread, two identities, and the rule is enforced on the
> server, not hidden in the interface.

### 6 · Live, on both screens — 1:22 – 1:33

*On screen: her laptop beside his phone. He types, he sends, and both move.*

> He writes from his phone. Her book moves. No polling, no refresh — that's a
> Convex subscription, and every screen in the product works this way.

### 7 · What it costs — 1:33 – 1:45

*On screen: the admin usage page — generations, tokens, dollars, by agent and
by model.*

> And every token the agents spend is counted and priced — by agent, by day, by
> model. A matchmaker knows exactly what her assistant costs.
>
> match.build. The operating system for human matchmakers.

---

## Delivering it

- **~245 words over ~105 seconds** is about 140 words a minute — an unhurried
  pace. If you are still rushing, the fix is to lengthen a `hold` in the capture
  and re-render that clip, or to drop `--speed` further; not to talk faster.
  The durations are the edit.
- **Read the card, not the page.** Every card is on screen for as long as its
  own words take to say, so the timing looks after itself.
- **Let the silences sit.** The long holds are deliberate: the quote under the
  proposal, the reasons on a match card and the cost tiles all need a moment to
  be *read*. Say the line, then stop.
- **Say "she", not "the user".** Every clip follows one matchmaker through one
  working day; the film is about a person, and criterion one is everyday
  usefulness.
- **Record the audio separately** and lay it over the mp4. The clips have no
  sound, so there is nothing to duck.
- **If you would rather have no burnt-in text**, `pnpm stitch:demo --
  --no-subtitles` renders the same film clean, and the `.srt` beside it can be
  attached as a soft subtitle track instead.

## Staying honest on camera

Three things on screen are seeded rather than earned in the take, because the
Convex AI gateway needs a paid Cloud deployment and the captures run against a
**local anonymous** backend that cannot make a model call:

| What | Real in production? |
|---|---|
| The **drafted reply** in clip 2 | Yes — written by the conversation agent. Only the take's copy is seeded. |
| The **proposed fact** in clip 3 | Yes — written by the candidate-profile agent. Same. |
| The **token counts** in clip 7 | Yes — every generation records its own. The rows here are a fortnight's worth, seeded. |

Everything a person *does* with those in the film — editing the draft, sending
it, approving the proposal, moving the card — is the real product, and the
match board's run in clip 4 is genuinely computed during the take.

So the narration above says "drafted in her voice" and "the agent proposes",
which is true of the product. **Don't ad-lib a claim that the model is running
live in this recording** — it isn't, and it is the one thing a judge could check
and catch.

If you would rather not rely on that distinction at all, record clip 2, 3 and 7
against the Cloud deployment by hand instead; everything else can stay as
filmed.
