/**
 * What the drafting agent is told, and what it is told next time
 * (prd/phase-2.md §4A).
 *
 * **The agent is briefed once, then kept up to date.** A conversation gets one
 * agent thread. The first turn carries everything — the matchmaker's voice,
 * the candidate's whole profile, the recent thread — and every turn after it
 * carries only what has changed since: the new messages, a voice that has been
 * rewritten, profile entries that have been added or corrected. The thread
 * itself is the memory, so re-sending the world on every message would be
 * paying twice for something already in the context.
 *
 * **It sees everything the matchmaker knows**, including the notes they typed
 * themselves. It is drafting in their voice, for them to read before anyone
 * else does, and a drafter working from half the file writes worse drafts. The
 * rule that matters is not what it may *see* but what it may *say*: a note is
 * something to draft *from*, never something to repeat to the candidate. That
 * rule is in the agent's standing instruction (`seed/ai/fixture.ts`), and the
 * matchmaker pressing Send is the control behind it.
 *
 * Plain code with no Convex imports, so the prompts are unit-testable and a
 * reader can see exactly what leaves this deployment.
 */

import { todayLine } from "../ai/rules";

/** Where a value on the profile came from, as the registry records it. */
export type EntrySource = "matchmaker" | "agent" | "agent_approved";

export type BriefEntry = {
  /** The registry key, e.g. `wantsKids`. */
  key: string;
  /** What it is called on screen, e.g. "Wants children". */
  label: string;
  value: string;
  source: EntrySource;
  updatedAt: number;
};

export type BriefMessage = {
  seq: number;
  author: "matchmaker" | "candidate" | "system";
  visibility: "everyone" | "matchmaker";
  source: "typed" | "imported" | "system";
  body: string;
};

export type Brief = {
  candidateName: string;
  matchmakerName: string;
  /** The matchmaker's voice, or "" where they have not written one. */
  voice: string;
  facts: BriefEntry[];
  notes: BriefEntry[];
  /**
   * Oldest first, already cut to the live window — and there is nothing
   * behind them. There is no summariser in v1 (prd/phase-2.md §2), so a
   * thread longer than the window is simply read from where the window
   * starts, and the standing instruction tells the agent as much.
   */
  messages: BriefMessage[];
  /**
   * The labels of match-critical fields the profile still has no answer for,
   * most conversational first, already capped (`helpers.ts`).
   *
   * **Without this the agent cannot see what it does not know.** The profile
   * section lists what is filled, so on a new candidate it is empty and the
   * agent reads an absence of information as an absence of anything to ask —
   * which is how a thread dies at "hey". Empty here means the profile has
   * every field a match is decided on, which is a real state and worth saying.
   */
  gaps: string[];
};

/*
 * ─── The three switches on one conversation ─────────────────────────────────
 *
 * A matchmaker turns AI off on a conversation by function rather than
 * wholesale: the drafts, the profile the drafting run keeps up to date, and
 * whether what they type here teaches the product how they write.
 *
 * **One resolver, because two of the three are not independent.** Read the
 * stored fields directly and a caller has to remember that drafting and
 * noticing are one generation, and that an unset voice follows the master
 * switch — which is three chances to get it wrong in three different files.
 */

export const AI_FUNCTIONS = ["drafts", "profile", "voice"] as const;

export type AiFunction = (typeof AI_FUNCTIONS)[number];

export function isAiFunction(value: string): value is AiFunction {
  return (AI_FUNCTIONS as readonly string[]).includes(value);
}

/** The three fields as `conversations` stores them. */
export type AiSwitches = {
  aiOff?: boolean;
  profileOff?: boolean;
  voiceOff?: boolean;
};

/** Whether each function runs on this conversation. */
export type AiFunctionStates = Record<AiFunction, boolean>;

/**
 * What is actually on, out of what is stored.
 *
 * **`profile` cannot outlive `drafts`.** One generation produces the replies
 * and the observations both (`draftInstruction`), and `reconcile` is scheduled
 * from inside the drafting run with what that run noticed — so there is no
 * path by which a profile is kept up to date while drafting is off. The UI
 * disables the control and says so rather than offering a switch that would
 * quietly do nothing.
 *
 * **An unset `voice` follows `aiOff`.** A conversation switched off before
 * that field existed would otherwise still be feeding the voice agent the
 * matchmaker's half of it, which is not what somebody who turned AI off here
 * was agreeing to. Touching the control makes it explicit, after which it is
 * independent — including staying on over a conversation whose drafts are off.
 */
export function aiFunctionStates(stored: AiSwitches): AiFunctionStates {
  const drafts = stored.aiOff !== true;
  return {
    drafts,
    profile: drafts && stored.profileOff !== true,
    voice: stored.voiceOff === undefined ? drafts : stored.voiceOff !== true,
  };
}

/**
 * The patch that sets one function, given what is stored now.
 *
 * **Turning drafts off takes an untouched voice with it, visibly.** The rule
 * is the one `aiFunctionStates` states and nothing here overrides it: unset
 * follows the master switch, and the panel shows the switch move. The
 * alternative was to pin voice to whatever it was displaying whenever drafts
 * moved, which would have made two conversations that both read "drafts off"
 * behave differently depending on whether they predated the field — a
 * difference nothing on screen could explain.
 *
 * Touching voice writes it either way, after which it is that matchmaker's
 * answer and the master switch stops speaking for it. That is why `false` is
 * stored here where the other two store only the exception.
 */
export function aiSwitchPatch(
  stored: AiSwitches,
  fn: AiFunction,
  enabled: boolean,
): AiSwitches {
  switch (fn) {
    case "drafts":
      return { ...stored, aiOff: enabled ? undefined : true };
    case "profile":
      return { ...stored, profileOff: enabled ? undefined : true };
    case "voice":
      return { ...stored, voiceOff: !enabled };
  }
}

/** What the agent has already been told, so the next turn can be a delta. */
export type BriefedThrough = {
  seq: number;
  voiceUpdatedAt: number;
  profileUpdatedAt: number;
};

export const NEVER_BRIEFED: BriefedThrough = {
  seq: 0,
  voiceUpdatedAt: 0,
  profileUpdatedAt: 0,
};

/** How a message reads in the transcript handed to the agent. */
function transcribe(message: BriefMessage, names: Brief): string {
  const who =
    message.author === "system"
      ? "System"
      : message.author === "matchmaker"
        ? names.matchmakerName
        : names.candidateName;
  // Private and imported messages are marked, because the agent has to know
  // which of them the candidate has actually seen. An imported message is
  // their own earlier conversation, moved here; a private one is the
  // matchmaker talking to themselves.
  const aside =
    message.source === "imported"
      ? " (imported from an earlier conversation)"
      : message.visibility === "matchmaker"
        ? " (private note, the candidate never saw this)"
        : "";
  return `${who}${aside}: ${message.body}`;
}

function entryLines(entries: BriefEntry[]): string {
  return entries.map((entry) => `- ${entry.label}: ${entry.value}`).join("\n");
}

/**
 * The first thing the agent is ever told about this conversation: who the two
 * people are, how the matchmaker writes, everything on the candidate's
 * profile, and the thread so far.
 */
export function openingBrief(brief: Brief): string {
  const them = brief.candidateName.toUpperCase();
  const parts: string[] = [
    `You are drafting replies for ${brief.matchmakerName}, a matchmaker, to send to ${brief.candidateName}, a candidate in their book.`,
  ];

  parts.push(
    brief.voice
      ? `HOW ${brief.matchmakerName.toUpperCase()} WRITES\n${brief.voice}`
      : `HOW ${brief.matchmakerName.toUpperCase()} WRITES\nThey have not described their voice yet. Match the way they write in the thread below.`,
  );

  // Emitted even when empty, where the old brief dropped the heading
  // entirely. An agent shown no profile section has no way to tell a candidate
  // nobody has asked anything yet from a candidate there is nothing left to
  // ask, and the two call for opposite drafts.
  parts.push(
    brief.facts.length > 0
      ? `WHAT ${them} HAS TOLD THEM\n${entryLines(brief.facts)}`
      : `WHAT ${them} HAS TOLD THEM\nNothing. Their profile is empty — nobody has learned anything about them yet.`,
  );

  if (brief.notes.length > 0) {
    parts.push(
      `${brief.matchmakerName.toUpperCase()}'S OWN NOTES — to draft from, never to repeat back\n${entryLines(brief.notes)}`,
    );
  }

  parts.push(gapSection(brief));

  parts.push(
    brief.messages.length > 0
      ? `THE CONVERSATION SO FAR\n${brief.messages.map((m) => transcribe(m, brief)).join("\n")}`
      : "THE CONVERSATION SO FAR\nNothing yet. This would be the opening message.",
  );

  return parts.join("\n\n");
}

/**
 * What is still missing, and how to treat it.
 *
 * The framing does as much work as the list. A bare list of field labels is
 * read as a form to get through, which is the failure the opposite of silence:
 * an agent that opens by asking a stranger their religion and their income.
 * So the heading says what it is not, and the standing instruction
 * (`seed/ai/fixture.ts`) carries the pacing rules that go with it.
 */
function gapSection(brief: Brief): string {
  const heading = `STILL UNKNOWN ABOUT ${brief.candidateName.toUpperCase()}`;
  if (brief.gaps.length === 0) {
    return `${heading}\nNothing a match turns on. Ask only what this conversation calls for.`;
  }
  return [
    `${heading} — what a match turns on and nobody has asked yet.`,
    "This is what is missing, not a checklist and not an order to follow. Ask at most one of these, and only where the conversation has made it natural.",
    brief.gaps.map((label) => `- ${label}`).join("\n"),
  ].join("\n");
}

/**
 * What has happened since the agent was last spoken to: the new messages, and
 * anything about the matchmaker or the candidate that has changed.
 *
 * Returns `null` when nothing has — there is no point waking a model to tell
 * it nothing is new.
 */
export function updateBrief(
  brief: Brief,
  since: BriefedThrough,
): string | null {
  const parts: string[] = [];

  const fresh = brief.messages.filter((message) => message.seq > since.seq);
  const changedFacts = brief.facts.filter(
    (entry) => entry.updatedAt > since.profileUpdatedAt,
  );
  const changedNotes = brief.notes.filter(
    (entry) => entry.updatedAt > since.profileUpdatedAt,
  );

  if (changedFacts.length > 0) {
    parts.push(
      `${brief.candidateName.toUpperCase()}'S PROFILE HAS CHANGED\nThese are current; anything you were told earlier about the same field is out of date.\n${entryLines(changedFacts)}`,
    );
    // Restated only when the profile moved, because that is the only thing
    // that shortens the list — and a gap list left standing from the opening
    // brief is how an agent asks a second time for something it was told.
    parts.push(gapSection(brief));
  }
  if (changedNotes.length > 0) {
    parts.push(
      `${brief.matchmakerName.toUpperCase()}'S NOTES HAVE CHANGED — to draft from, never to repeat back\n${entryLines(changedNotes)}`,
    );
  }
  if (fresh.length > 0) {
    parts.push(
      `NEW MESSAGES\n${fresh.map((m) => transcribe(m, brief)).join("\n")}`,
    );
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/**
 * Whether the matchmaker's voice needs re-stating. It is one block of prose
 * rather than a list, so it goes in whole or not at all.
 */
export function voiceUpdate(
  brief: Brief,
  since: BriefedThrough,
  voiceUpdatedAt: number,
): string | null {
  if (voiceUpdatedAt <= since.voiceUpdatedAt) return null;
  if (brief.voice === "") return null;
  return `HOW ${brief.matchmakerName.toUpperCase()} WRITES — they have rewritten this, so it replaces what you were told before\n${brief.voice}`;
}

/**
 * The instruction appended to every turn: what to produce, and in what shape.
 *
 * **Two jobs in one generation** (prd/phase-2.md §4A). The agent has just read
 * the new messages to draft from them; asking it, in the same breath, what
 * those messages revealed costs one section of output rather than a second
 * call over the same text. What it notices goes nowhere near the profile on
 * its own — it is handed to the profile agent, which owns that write path and
 * decides what the registry can actually hold (§4.1B).
 *
 * The risk this runs, and the reason the sections are ordered this way: a
 * prompt serving two tasks can serve neither (§4.4). REPLIES is asked for
 * first and described first, because it is the half a matchmaker sees.
 *
 * Asked for as labelled lines rather than JSON. A draft is prose a person will
 * read, and every wrapper the model has to close correctly is another way for
 * a perfectly good draft to arrive unusable.
 */
export function draftInstruction(
  count: number,
  candidateName: string,
  now: number,
): string {
  return [
    todayLine(now),
    "",
    "Do two things, and label them with the headings below exactly as written.",
    "",
    "REPLIES",
    // "Message the matchmaker could send next" rather than "reply": a reply is
    // a response to content, and the thread this agent most often meets has no
    // content in it — a candidate who was invited and typed "hey". Asked for a
    // reply to that, a model writes a greeting back and the thread stops.
    `Draft ${count === 1 ? "one message" : `${count} messages`} the matchmaker could send to ${candidateName} next, in their voice.`,
    `Write ${count === 1 ? "it" : "each one"} on a single line, numbered, like:`,
    "1. <the message>",
    count > 1 ? "2. <a different message>" : "",
    "No preamble, no explanation, no quotation marks around the message.",
    `Each one should be a complete message, ready to send. Use a newline inside a message only if the matchmaker would have used one; write it as "\\n".`,
    // The pacing rules live in the standing instruction; these two are here
    // because they are about the shape of this batch, which only this turn
    // knows. Three drafts that differ only in wording are one draft.
    `Almost every one should end with something ${candidateName} can easily answer, and no message should ask more than one question.`,
    count > 1
      ? "Make them genuinely different in what they do — a different question, a different thing picked up on, a different length — not the same message reworded."
      : "",
    "Never repeat the matchmaker's private notes back to the candidate, and never mention another candidate by name.",
    "If there is genuinely nothing useful to say next, write NOTHING under this heading.",
    "",
    "NOTICED",
    `What the new messages reveal about ${candidateName} — who they are, how they live, what they are looking for. One per line:`,
    "- <what it tells you> | <their exact words>",
    "",
    `Only what ${candidateName} said about themselves in this conversation. Their exact words must be copied character for character from a message, not paraphrased, so the matchmaker can check it.`,
    "Nothing the matchmaker told you, nothing from their notes, and nothing you inferred beyond what the words support.",
    "Nothing you have already been told about them that has not changed.",
    "If they revealed nothing new, write NOTHING under this heading.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** One thing the agent noticed, on its way to the profile agent (§4.1B). */
export type NoticedFact = {
  /** What it tells you, in the agent's words. */
  observation: string;
  /** The candidate's own words, verbatim. */
  quote: string;
};

/** How many observations one generation may hand on, however many it writes. */
export const MAX_NOTICED = 12;

/**
 * Splits one generation into its two halves.
 *
 * **A missing or misspelled heading is not a failed generation.** A model that
 * answered with a bare numbered list has written perfectly good drafts, so the
 * whole text falls through to the replies parser and nothing is noticed —
 * degrading to exactly the feature that shipped before this.
 */
export function splitGeneration(text: string): {
  replies: string;
  noticed: string;
} {
  const match = /^[\s>*_#-]*NOTICED\b[^\n]*$/im.exec(text);
  if (match === null || match.index === undefined) {
    return { replies: stripHeading(text, "REPLIES"), noticed: "" };
  }
  return {
    replies: stripHeading(text.slice(0, match.index), "REPLIES"),
    noticed: text.slice(match.index + match[0].length),
  };
}

/** Drops a leading section heading the model was asked to write. */
function stripHeading(section: string, heading: string): string {
  return section.replace(
    new RegExp(`^[\\s>*_#-]*${heading}\\b[^\\n]*\\n?`, "i"),
    "",
  );
}

/**
 * The observations, out of the `- <what> | <their words>` lines.
 *
 * A line with no quote is dropped rather than kept with an empty one. The
 * quote is the whole point: it is what a matchmaker checks a proposal against,
 * and an observation nobody can trace back to a message is exactly the kind of
 * confident invention this pipeline must not launder into a profile.
 */
export function parseNoticed(text: string): NoticedFact[] {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NOTHING") return [];

  const noticed: NoticedFact[] = [];
  for (const line of trimmed.split("\n")) {
    const bare = line.trim().replace(/^[-*\u2022]\s*/, "");
    if (bare === "" || bare.toUpperCase() === "NOTHING") continue;
    const cut = bare.indexOf("|");
    if (cut === -1) continue;
    const observation = bare.slice(0, cut).trim();
    const quote = unwrap(bare.slice(cut + 1).trim());
    if (observation === "" || quote === "") continue;
    noticed.push({ observation, quote });
    if (noticed.length === MAX_NOTICED) break;
  }
  return noticed;
}

/**
 * The drafts, out of the numbered list the model was asked for.
 *
 * Forgiving on purpose: a model that ignores the format and returns one
 * unnumbered paragraph has still written a usable draft, and throwing it away
 * to punish the formatting helps nobody.
 */
export function parseDrafts(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NOTHING") return [];

  const numbered = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+[.)]\s/.test(line))
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim());

  const drafts = numbered.length > 0 ? numbered : [trimmed];

  return drafts
    .map(unwrap)
    .filter((draft) => draft !== "" && draft.toUpperCase() !== "NOTHING")
    .slice(0, limit);
}

/** A model that wrapped its draft in quotes, and its literal newlines. */
function unwrap(draft: string): string {
  const unquoted =
    draft.length > 1 && draft.startsWith('"') && draft.endsWith('"')
      ? draft.slice(1, -1)
      : draft;
  return unquoted.replaceAll("\\n", "\n").trim();
}

/** How many drafts to ask for, and how far back to read. */
export const REPLY_DEFAULTS = {
  /** prd/phase-2.md §9.2: three may be choice paralysis on a phone. */
  count: 3,
  /** Seconds after the last message before drafting, so a burst is one call. */
  debounceSeconds: 5,
  /**
   * Messages sent verbatim, and the whole of what the agent sees: there is no
   * summariser in v1, so nothing older reaches it (prd/phase-2.md §2, §9.2).
   */
  liveWindow: 50,
} as const;

/** A number from a deployment setting, or the default when it is unusable. */
export function settingNumber(
  raw: string | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
