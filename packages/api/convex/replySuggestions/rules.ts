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
  /** Older messages, where the thread has outgrown the live window. */
  summary?: string;
  /** Oldest first, already cut to the live window. */
  messages: BriefMessage[];
};

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
  const parts: string[] = [
    `You are drafting replies for ${brief.matchmakerName}, a matchmaker, to send to ${brief.candidateName}, a candidate in their book.`,
  ];

  parts.push(
    brief.voice
      ? `HOW ${brief.matchmakerName.toUpperCase()} WRITES\n${brief.voice}`
      : `HOW ${brief.matchmakerName.toUpperCase()} WRITES\nThey have not described their voice yet. Match the way they write in the thread below.`,
  );

  if (brief.facts.length > 0) {
    parts.push(
      `WHAT ${brief.candidateName.toUpperCase()} HAS TOLD THEM\n${entryLines(brief.facts)}`,
    );
  }
  if (brief.notes.length > 0) {
    parts.push(
      `${brief.matchmakerName.toUpperCase()}'S OWN NOTES — to draft from, never to repeat back\n${entryLines(brief.notes)}`,
    );
  }
  if (brief.summary !== undefined && brief.summary !== "") {
    parts.push(`EARLIER IN THE CONVERSATION\n${brief.summary}`);
  }

  parts.push(
    brief.messages.length > 0
      ? `THE CONVERSATION SO FAR\n${brief.messages.map((m) => transcribe(m, brief)).join("\n")}`
      : "THE CONVERSATION SO FAR\nNothing yet. This would be the opening message.",
  );

  return parts.join("\n\n");
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
 * Asked for as numbered lines rather than JSON. A draft is prose a person will
 * read, and every wrapper the model has to close correctly is another way for
 * a perfectly good draft to arrive unusable.
 */
export function draftInstruction(count: number, candidateName: string): string {
  return [
    `Draft ${count === 1 ? "one reply" : `${count} replies`} the matchmaker could send to ${candidateName} next, in their voice.`,
    "",
    `Write ${count === 1 ? "it" : "each one"} on a single line, numbered, like:`,
    "1. <the reply>",
    count > 1 ? "2. <a different reply>" : "",
    "",
    "Nothing else — no preamble, no explanation, no quotation marks around the reply.",
    `Each one should be a complete message, ready to send. Use a newline inside a reply only if the matchmaker would have used one; write it as "\\n".`,
    "Never repeat the matchmaker's private notes back to the candidate, and never mention another candidate by name.",
    "If there is genuinely nothing useful to say next, reply with the single word NOTHING.",
  ]
    .filter((line) => line !== "")
    .join("\n");
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
  /** Messages sent verbatim; older ones are the summary's job. */
  liveWindow: 20,
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
