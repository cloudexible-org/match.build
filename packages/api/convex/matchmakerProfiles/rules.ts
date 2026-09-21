/**
 * The matchmaker's own profile (prd/phase-2.md §4.1C). One field so far —
 * their **voice** — under the same rules as a candidate's profile: a policy
 * that says who may write it, a record of who did, and an agent that may
 * propose but not overwrite.
 *
 * Not a registry and not a map, because there is one field. When a second one
 * arrives, it becomes a column beside `voice`, not a key in a bag: what the
 * product knows about a matchmaker is a short, deliberate list, unlike a
 * candidate's profile, which grows with whatever a conversation turns up.
 *
 * Plain code with no Convex imports, exported through `@repo/api`.
 */

import type { ProfileFieldDef } from "../profiles/rules";

/**
 * How they write, in their own words, with examples.
 *
 * Wider than the name suggests (prd/phase-2.md §4.1): not only register and
 * rhythm, but how they work and what they care about in a match. What the
 * product learns about the *matchmaker* lands here, because `candidateProfiles`
 * is keyed to a candidate and there is deliberately no third place.
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
