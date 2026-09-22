# Demo narration script

The voiceover for the stitched demo film — what to say, and when.

```bash
pnpm capture:demo     # film all seven clips
pnpm render:demo -- --name <each>
pnpm stitch:demo      # → .scratch/marketing/demos/_stitched/match-build-demo.mp4
```

**This file is the film's edit, not a description of it.** `stitch-demo.mjs`
reads it: the `## Title card` becomes the opening card, each `**Card:**` line
becomes the scene card that introduces its clip, and the blockquotes become the
subtitles burned under the picture. Edit a line here, re-stitch, and the film
says the new line. A matching `.srt` is written beside the mp4.

So the way to record is simply to **read each subtitle while it is on screen**.
They are timed by word count, so one that takes longer to say is on screen for
longer, and a narrator who keeps pace with a clip finishes with it.

The film runs about **2:00** at 0.95× — a deliberate five percent slower than it
was filmed, to leave air to speak into — and is well inside the three-minute
submission limit.

---

## It is one afternoon, not seven features

The first cut played as seven demos in a row: each clip was fine and the film
was not, because nothing carried from one to the next and the matchmaker on
screen was never introduced. Two things fix that, and both live in this file.

**Maya is a person before she is a screen.** The narration names her in the
first eight words, over the shot of her own book with her name already in the
header, and then follows *her* through one stretch of work — onboarding Aisha,
clearing the morning's thread, approving what the agent heard, asking for pairs.
The scenes are beats in that, not entries in a feature list, and the words that
open each one ("A week later", "While she works", "That record is what it is all
for") are the joins.

**Every scene gets a card, and the cards are silent.** A held title on a dark
frame is the stopgap: it ends the previous thought, gives the narrator somewhere
to breathe, and tells the viewer a new one is starting before any UI appears.
They cost about two seconds each, and they are most of what turns seven clips
into a film.

---

## Title card

> match.build
> The operating system for independent matchmakers

## The script

### 1 · Out of the DMs — 0:03 – 0:20

*On screen: Maya's book, three candidates → Onboard → an address, a name, an
Instagram handle, the DMs pasted in → the thread arrives with its history,
marked "Only visible to you".*

> This is Maya — an independent matchmaker whose entire book lived in Instagram
> DMs. So the first thing she does is paste the conversation she has already had
> with Aisha, and send one invitation. The history comes with her, marked
> private.

### 2 · The morning inbox — 0:22 – 0:37

**Card:** The morning inbox

*On screen: the book in one column, Sam's thread in the next, a reply already
drafted above the composer → she edits it → she sends it.*

> A week later, her whole book is one screen. And the thread that needs her most
> already has a reply drafted — in her voice, by OpenAI through Convex's AI
> gateway. She edits it. She sends it.

### 3 · The profile writes itself — 0:39 – 0:58

**Card:** The profile writes itself

*On screen: Sam mentions children → the Profile panel → a proposed fact quoting
his own sentence → approved → the History entry naming both of them.*

> While she works, the record fills itself in. Sam mentions children in passing,
> and the agent does not touch his profile. It proposes the change, and quotes
> the sentence it heard, so Maya can check it. She approves. The history names
> them both.

### 4 · Finding the pairs — 1:00 – 1:18

**Card:** Finding the pairs

*On screen: an empty board over a full book → **Find matches** → scored cards
with reasons → one card expanded → moved to Introduced.*

> That record is what it is all for. When Maya asks for pairs, the run is real —
> a deterministic scorer over every profile, in Convex. No model. Every card
> shows its reasons, including the ones against. She moves it forward; it never
> moves itself.

### 5 · From the other side — 1:20 – 1:37

**Card:** From the other side

*On screen: Maya's thread including her private note → dissolve → the same
thread as Sam, without it → he replies.*

> Sam sees all of this from the other end — or rather, he sees most of it. The
> note Maya wrote to herself is not there. Same thread, two identities, and the
> rule is enforced on the server.

### 6 · Live, at both ends — 1:39 – 1:50

**Card:** Live, at both ends

*On screen: her laptop beside his phone. He types, he sends, and both move.*

> And they are in it together. Sam writes from his phone; Maya's book moves.
> No polling, no refresh — that is a Convex subscription.

### 7 · What it costs — 1:52 – 2:05

**Card:** What it costs

*On screen: the admin usage page — generations, tokens, dollars, by agent and
by model.*

> One last thing Maya needs: what her assistant costs her. Every token is
> counted and priced — by agent, by day, by model.
>
> match.build. The operating system for human matchmakers.

---

## Delivering it

- **~250 words over ~120 seconds** is about 125 words a minute, and the cards
  are silent on top of that — an unhurried pace with real pauses in it. If you
  are still rushing, lengthen a `hold` in the capture and re-render that clip,
  or drop `--speed` further. Do not talk faster.
- **Say nothing over the cards.** They are the breath between scenes; filling
  them puts the film back where it started.
- **Read the subtitle, not the page.** Each one is on screen for about as long
  as its own words take to say, so the timing looks after itself.
- **Let the long holds sit.** The quote under the proposal, the reasons on a
  match card and the cost tiles all need a moment to be *read*.
- **Say "she", not "the user".** The film is about one person's afternoon, and
  the first judging criterion is everyday usefulness.
- **Record the audio separately** and lay it over the mp4. The clips have no
  sound, so there is nothing to duck.
- **If you would rather have no burnt-in text**, `pnpm stitch:demo --
  --no-subtitles` renders the same film clean — cards and all — and the `.srt`
  beside it can be attached as a soft subtitle track instead.

## Staying honest on camera

Three things on screen are seeded rather than earned in the take, because the
Convex AI gateway needs a paid Cloud deployment and the captures run against a
**local anonymous** backend that cannot make a model call:

| What | Real in production? |
|---|---|
| The **drafted reply** in scene 2 | Yes — written by the conversation agent. Only the take's copy is seeded. |
| The **proposed fact** in scene 3 | Yes — written by the candidate-profile agent. Same. |
| The **token counts** in scene 7 | Yes — every generation records its own. The rows here are a fortnight's worth, seeded. |

Everything a person *does* with those in the film — editing the draft, sending
it, approving the proposal, moving the card — is the real product, and the match
board's run in scene 4 is genuinely computed during the take.

So the narration says "drafted in her voice" and "the agent proposes", which is
true of the product. **Don't ad-lib a claim that the model is running live in
this recording** — it isn't, and it is the one thing a judge could check and
catch.

If you would rather not rely on that distinction at all, record scenes 2, 3 and
7 against the Cloud deployment by hand instead; everything else can stay as
filmed.
