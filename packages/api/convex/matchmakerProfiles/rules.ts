/**
 * The matchmaker's own profile (prd/phase-2.md §4.1C): their **voice**, and
 * three things about their **practice** — under the same rules as a
 * candidate's profile: a policy that says who may write a field, a record of
 * who did, and an agent that may propose but not overwrite.
 *
 * Columns, not a map, as this file said the second field would be: what the
 * product knows about a matchmaker is a short, deliberate list, unlike a
 * candidate's profile, which grows with whatever a conversation turns up.
 *
 * **The practice fields exist because `voice` could not hold them.** Its own
 * description claimed "how they work and what they care about in a match", but
 * the voice agent rewrites that field end to end with a description of how
 * somebody writes — so a matchmaker who typed their niche into it would lose
 * it the moment they accepted a suggestion. A field an agent replaces cannot
 * also be a field a person keeps facts in.
 *
 * Plain code with no Convex imports, exported through `@repo/api`.
 */

import type { ProfileFieldDef } from "../profiles/rules";

/**
 * How they write, in their own words, with examples.
 *
 * **Only how they write.** It used to be the one place anything about a
 * matchmaker lived, and so was described as covering how they work too; the
 * practice fields below are that, and this is now what its name says. The
 * voice agent is the reason the split matters — it proposes a replacement for
 * the whole of this field, and anything else kept here would go with it.
 */
export const VOICE_FIELD: ProfileFieldDef = {
  key: "voice",
  label: "Voice",
  value: { kind: "text", maxLength: 4_000 },
  // How someone writes is theirs. The voice-profile agent distils a draft from
  // their sent messages; they decide it sounds like them.
  policy: "suggest",
  personal: false,
  hint: "How you write, in your own words — register, warmth, sentence length, how you open and sign off, phrases you use, things you never say. Paste a few real messages as examples.",
};

/**
 * What the field looks like empty, for the settings page. Prose rather than a
 * placeholder value: a matchmaker staring at a blank box needs to be told what
 * kind of thing goes in it, and the assistant reads whatever they write
 * verbatim.
 */
export const VOICE_PLACEHOLDER = `Warm but brief. I write like I talk — short sentences, no exclamation marks, never "reach out".

I open with their first name and no greeting. I sign off with just my name.

Examples:
"Sam — I've got someone in mind. Free for a call Thursday?"
"That makes sense. Let's park it and see how the next one goes."`;

/*
 * ─── What this matchmaker's practice is ─────────────────────────────────────
 *
 * Three things the drafting agent has no other way to know: who this
 * matchmaker serves, how they run an introduction, and what they will not do.
 *
 * **Every one is `matchmaker` policy, and that is the point.** These are facts
 * about somebody's business, not something to be inferred from a conversation
 * and proposed back — an agent that could write here would be guessing at a
 * person's livelihood from a handful of messages. `agentWriteMode` refuses a
 * `matchmaker` field outright, so there is no path by which one is written
 * except a person typing it.
 *
 * **Only the conversation agent is shown them.** The profile agent is
 * deliberately not: it decides what gets written down about a candidate, and
 * an agent that knows the matchmaker serves one community would start
 * inferring that about a candidate who never said it — an invention that would
 * land on a real person's record. The voice agent is not shown them either; it
 * is describing how somebody writes, and this would push it towards describing
 * their business instead.
 *
 * Shorter than `voice` on purpose. This is standing context on every draft, so
 * it is paid for on every generation, and a field long enough to write an
 * essay in is a field somebody writes an essay in.
 */

export const PRACTICE_FIELDS: readonly ProfileFieldDef[] = [
  {
    key: "whoYouWorkWith",
    label: "Who you work with",
    value: { kind: "text", maxLength: 1_500 },
    policy: "matchmaker",
    personal: false,
    hint: "The people your book is for — community, faith, age, city, anything that makes someone a fit or not. The assistant has no other way to know.",
  },
  {
    key: "howYouWork",
    label: "How you work",
    value: { kind: "text", maxLength: 1_500 },
    policy: "matchmaker",
    personal: false,
    hint: "What happens after someone joins: how you meet, how you introduce, what you ask of them, what you charge if that comes up.",
  },
  {
    key: "whatYouDont",
    label: "What you don't do",
    value: { kind: "text", maxLength: 1_500 },
    policy: "matchmaker",
    personal: false,
    hint: "Your lines. Things you never promise, questions you won't ask, matches you won't make. The assistant is told not to cross these.",
  },
];

/** A practice field's key, as the mutation and the audit trail name it. */
export type PracticeFieldKey = "whoYouWorkWith" | "howYouWork" | "whatYouDont";

export const PRACTICE_FIELD_KEYS: readonly PracticeFieldKey[] = [
  "whoYouWorkWith",
  "howYouWork",
  "whatYouDont",
];

export function isPracticeFieldKey(value: string): value is PracticeFieldKey {
  return (PRACTICE_FIELD_KEYS as readonly string[]).includes(value);
}

export function practiceField(key: string): ProfileFieldDef | null {
  return PRACTICE_FIELDS.find((field) => field.key === key) ?? null;
}

/**
 * What each field looks like empty. Prose rather than a placeholder value, for
 * the reason `VOICE_PLACEHOLDER` is: somebody staring at a blank box needs to
 * be shown the kind of thing that goes in it, and the assistant reads whatever
 * they write verbatim.
 */
export const PRACTICE_PLACEHOLDERS: Record<PracticeFieldKey, string> = {
  whoYouWorkWith: `British Indian families in London and the South East. Mostly 28–40, professionals, first marriages.

Both sides usually want families involved early. I don't work outside the UK.`,
  howYouWork: `A call with me first, then I introduce two people by email and step back.

I check in with both after a fortnight. Nobody pays until an introduction is made.`,
  whatYouDont: `I never share a photo before both sides have agreed.

I don't discuss anyone's income, and I don't chase people who have gone quiet.`,
};

/** The audit trail records the field by name; there is no map to qualify. */
export const VOICE_AUDIT_FIELD = "voice";

/*
 * ─── What the voice agent is told, and what it says back ────────────────────
 *
 * prd/phase-2.md §4.1C. It reads what the matchmaker has written — the voice
 * they typed themselves, and the messages they have actually sent — and
 * describes how they write, so drafts can be written in it.
 *
 * It **proposes**, always: `VOICE_FIELD.policy` is `suggest`, so
 * `applyAgentVoice` turns whatever it produces into a suggestion sitting
 * beside their own words rather than over them. How someone writes is theirs.
 */

/** How many sent messages between runs. prd/phase-2.md §9.2 guessed 20. */
export const VOICE_SAMPLE_MESSAGES = 20;

/** A message the matchmaker actually sent, as the agent is shown it. */
export type VoiceSample = { body: string; sentAt: number };

/**
 * The whole prompt: there is no thread, because a run happens once every
 * `VOICE_SAMPLE_MESSAGES` messages and has nothing to remember between them
 * that the profile does not already hold. A thread would be a second copy of
 * a matchmaker's writing in tables `ctx.db` cannot see, kept for no gain.
 */
export function voiceInstruction(
  matchmakerName: string,
  current: string,
  samples: VoiceSample[],
): string {
  const parts = [
    `Describe how ${matchmakerName} writes, for another writer to work from.`,
  ];

  parts.push(
    current === ""
      ? `THEY HAVE NOT DESCRIBED THEIR OWN VOICE YET.\nWork only from the messages below.`
      : `HOW THEY DESCRIBE THEIR OWN VOICE — their words, and the thing you are refining rather than replacing\n${current}`,
  );

  parts.push(
    `MESSAGES ${matchmakerName.toUpperCase()} HAS SENT, oldest first\n${samples
      .map((sample) => `- ${sample.body}`)
      .join("\n")}`,
  );

  parts.push(
    [
      "Write the description as prose, in the second person, addressed to nobody — it is read by them and by the drafting agent.",
      "Cover: register and warmth, how long their sentences run, how they open and close a message, phrases that are characteristically theirs, and what they never say.",
      "Quote a habit rather than naming it. A description another writer could work from, not a list of adjectives.",
      `Keep to what their own words support. If the messages are too few or too alike to tell you much, say what you can and no more — do not fill it out with what a matchmaker is generally like.`,
      current === ""
        ? ""
        : "Keep what they said about themselves where the messages bear it out, and correct it only where the messages plainly contradict it.",
      `At most ${VOICE_FIELD.value.kind === "text" ? VOICE_FIELD.value.maxLength : 4_000} characters.`,
      "Nothing else — no preamble, no heading, no explanation of what you did.",
      "If you cannot describe them from this, reply with the single word NOTHING.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );

  return parts.join("\n\n");
}

/**
 * The description, out of whatever the model returned.
 *
 * Forgiving in one direction only: a preamble is stripped, but a refusal is
 * taken at its word. An empty voice is a voice that stays as it was.
 */
export function parseVoice(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "NOTHING") return null;
  // A model that answered with a heading it was told not to write.
  const stripped = trimmed.replace(
    /^[\s>*_#]*(voice|description)\b[:\s]*/i,
    "",
  );
  const body = stripped.trim();
  return body === "" ? null : body;
}
