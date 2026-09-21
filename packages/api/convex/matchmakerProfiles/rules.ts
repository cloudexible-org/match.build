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
