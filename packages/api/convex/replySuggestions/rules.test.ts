import { describe, expect, it } from "vitest";
import {
  aiFunctionStates,
  aiSwitchPatch,
  type Brief,
  type BriefedThrough,
  draftInstruction,
  MAX_NOTICED,
  NEVER_BRIEFED,
  openingBrief,
  parseDrafts,
  parseNoticed,
  REPLY_DEFAULTS,
  settingNumber,
  splitGeneration,
  updateBrief,
  voiceUpdate,
} from "./rules";

const brief: Brief = {
  candidateName: "Sam",
  matchmakerName: "Maya",
  voice: "Warm and brief.",
  facts: [
    {
      key: "wantsKids",
      label: "Wants children",
      value: "maybe",
      source: "matchmaker",
      updatedAt: 100,
    },
    {
      key: "pets",
      label: "Pets",
      value: "A cat",
      source: "agent_approved",
      updatedAt: 300,
    },
  ],
  notes: [
    {
      key: "matchmakerNotes",
      label: "Matchmaker notes",
      value: "Would introduce to Jordan first.",
      source: "matchmaker",
      updatedAt: 100,
    },
  ],
  messages: [
    {
      seq: 1,
      author: "matchmaker",
      visibility: "everyone",
      source: "typed",
      body: "Hi Sam, welcome!",
    },
    {
      seq: 2,
      author: "candidate",
      visibility: "everyone",
      source: "typed",
      body: "Based in Toronto.",
    },
  ],
  gaps: ["Occupation", "Date of birth"],
};

describe("openingBrief", () => {
  it("tells the agent who is who, and whose voice it is writing in", () => {
    const text = openingBrief(brief);
    expect(text).toContain("drafting replies for Maya");
    expect(text).toContain("to send to Sam");
    expect(text).toContain("Warm and brief.");
  });

  it("carries the whole profile, the matchmaker's own notes included", () => {
    const text = openingBrief(brief);
    expect(text).toContain("Wants children: maybe");
    expect(text).toContain("Would introduce to Jordan first.");
  });

  it("says a note is to draft from and never to repeat", () => {
    expect(openingBrief(brief)).toContain("never to repeat back");
  });

  it("marks which messages the candidate never saw", () => {
    const text = openingBrief({
      ...brief,
      messages: [
        {
          seq: 3,
          author: "matchmaker",
          visibility: "matchmaker",
          source: "typed",
          body: "Strong fit for Jordan.",
        },
        {
          seq: 4,
          author: "candidate",
          visibility: "matchmaker",
          source: "imported",
          body: "We spoke on WhatsApp.",
        },
      ],
    });
    expect(text).toContain("private note, the candidate never saw this");
    expect(text).toContain("imported from an earlier conversation");
  });

  it("says so rather than going quiet when there is no voice yet", () => {
    const text = openingBrief({ ...brief, voice: "" });
    expect(text).toContain("have not described their voice yet");
  });

  it("names an empty thread as the opening message", () => {
    expect(openingBrief({ ...brief, messages: [] })).toContain(
      "This would be the opening message.",
    );
  });

  it("leaves out the matchmaker's notes when they have written none", () => {
    const bare = openingBrief({ ...brief, facts: [], notes: [] });
    expect(bare).not.toContain("OWN NOTES");
    // The profile is the exception: it is stated even when empty, because
    // "nobody has asked yet" is the single most useful thing the agent can
    // know about a freshly invited candidate.
    expect(bare).toContain("HAS TOLD THEM");
  });
});

describe("updateBrief", () => {
  const since: BriefedThrough = {
    seq: 2,
    voiceUpdatedAt: 50,
    profileUpdatedAt: 200,
  };

  it("carries only the messages the agent has not seen", () => {
    const text = updateBrief(
      {
        ...brief,
        messages: [
          ...brief.messages,
          {
            seq: 3,
            author: "candidate",
            visibility: "everyone",
            source: "typed",
            body: "And I love hiking.",
          },
        ],
      },
      since,
    );
    expect(text).toContain("And I love hiking.");
    expect(text).not.toContain("Hi Sam, welcome!");
  });

  it("carries only the profile entries that have changed", () => {
    const text = updateBrief(brief, since);
    // `pets` moved at 300, after the last briefing; `wantsKids` at 100 did not.
    expect(text).toContain("Pets: A cat");
    expect(text).not.toContain("Wants children");
  });

  it("says a changed entry replaces what it was told before", () => {
    expect(updateBrief(brief, since)).toContain("out of date");
  });

  it("is null when nothing has happened", () => {
    expect(
      updateBrief(brief, { seq: 2, voiceUpdatedAt: 50, profileUpdatedAt: 400 }),
    ).toBeNull();
  });

  it("carries everything when the agent has never been briefed", () => {
    const text = updateBrief(brief, NEVER_BRIEFED);
    expect(text).toContain("Hi Sam, welcome!");
    expect(text).toContain("Wants children: maybe");
  });
});

describe("voiceUpdate", () => {
  const since: BriefedThrough = {
    seq: 2,
    voiceUpdatedAt: 50,
    profileUpdatedAt: 200,
  };

  it("re-states the voice once it has been rewritten", () => {
    const text = voiceUpdate(brief, since, 90);
    expect(text).toContain("Warm and brief.");
    expect(text).toContain("replaces what you were told before");
  });

  it("stays quiet while it has not moved", () => {
    expect(voiceUpdate(brief, since, 50)).toBeNull();
    expect(voiceUpdate(brief, since, 10)).toBeNull();
  });

  it("has nothing to say about a voice nobody has written", () => {
    expect(voiceUpdate({ ...brief, voice: "" }, since, 90)).toBeNull();
  });
});

describe("draftInstruction", () => {
  /** 2026-09-21, so the date the instruction states is a fixed one. */
  const NOW = Date.parse("2026-09-21T12:00:00Z");

  it("tells the model what day it is", () => {
    // Without it, "see you tomorrow" is a date the model cannot resolve. It
    // goes here, in the per-turn instruction, rather than in the opening
    // brief: a thread outlives the day it was opened.
    expect(draftInstruction(3, "Sam", NOW)).toContain("Monday, 2026-09-21");
  });

  it("asks for as many as it was told to", () => {
    expect(draftInstruction(3, "Sam", NOW)).toContain("3 messages");
    expect(draftInstruction(1, "Sam", NOW)).toContain("one message");
  });

  it("repeats the rule that matters most, where the model will act on it", () => {
    expect(draftInstruction(3, "Sam", NOW)).toContain(
      "Never repeat the matchmaker's private notes",
    );
  });

  it("gives it a way to decline", () => {
    expect(draftInstruction(3, "Sam", NOW)).toContain("NOTHING");
  });

  it("asks for an opening the candidate can answer, one question at a time", () => {
    const text = draftInstruction(3, "Sam", NOW);
    expect(text).toContain("easily answer");
    expect(text).toContain("no message should ask more than one question");
  });

  it("asks for three that differ in what they do, not one reworded", () => {
    expect(draftInstruction(3, "Sam", NOW)).toContain("genuinely different");
    // With one draft there is nothing to differ from.
    expect(draftInstruction(1, "Sam", NOW)).not.toContain(
      "genuinely different",
    );
  });

  it("asks for both halves, replies first", () => {
    const instruction = draftInstruction(3, "Sam", NOW);
    expect(instruction).toContain("REPLIES");
    expect(instruction).toContain("NOTICED");
    // The half a matchmaker sees is the half described first (prd §4.4).
    expect(instruction.indexOf("REPLIES")).toBeLessThan(
      instruction.indexOf("NOTICED"),
    );
  });

  it("insists the quote is the candidate's own words", () => {
    expect(draftInstruction(3, "Sam", NOW)).toContain(
      "character for character",
    );
  });
});

describe("splitGeneration", () => {
  it("cuts one generation into its two halves", () => {
    const { replies, noticed } = splitGeneration(
      "REPLIES\n1. Lovely!\n\nNOTICED\n- Lives in Leeds | I moved to Leeds",
    );
    expect(parseDrafts(replies, 3)).toEqual(["Lovely!"]);
    expect(parseNoticed(noticed)).toEqual([
      { observation: "Lives in Leeds", quote: "I moved to Leeds" },
    ]);
  });

  it("degrades to drafts alone when the model ignored the headings", () => {
    // The feature that shipped before this one still works: a bare numbered
    // list is perfectly good drafts and nothing noticed.
    const { replies, noticed } = splitGeneration("1. Hello there\n2. Hi Sam!");
    expect(parseDrafts(replies, 3)).toEqual(["Hello there", "Hi Sam!"]);
    expect(parseNoticed(noticed)).toEqual([]);
  });

  it("survives a model that decorated the headings", () => {
    const { replies, noticed } = splitGeneration(
      "## REPLIES\n1. Hi\n\n**NOTICED**\n- Vegan | I went vegan last year",
    );
    expect(parseDrafts(replies, 3)).toEqual(["Hi"]);
    expect(parseNoticed(noticed)).toHaveLength(1);
  });

  it("never lets a noticed line become a draft", () => {
    const { replies } = splitGeneration(
      "REPLIES\n1. Hi\n\nNOTICED\n- Vegan | I went vegan",
    );
    expect(parseDrafts(replies, 3)).toEqual(["Hi"]);
  });
});

describe("parseNoticed", () => {
  it("reads the observation and the quote either side of the pipe", () => {
    expect(parseNoticed("- Wants children | I'd love kids one day")).toEqual([
      { observation: "Wants children", quote: "I'd love kids one day" },
    ]);
  });

  it("drops a line with no quote, because the quote is the point", () => {
    // An observation nobody can trace back to a message is the invention this
    // pipeline must not launder into a profile.
    expect(parseNoticed("- Probably wealthy")).toEqual([]);
    expect(parseNoticed("- Probably wealthy |   ")).toEqual([]);
  });

  it("takes bullets, asterisks or nothing at all", () => {
    expect(parseNoticed("* A | b\n- C | d\nE | f")).toHaveLength(3);
  });

  it("unwraps a quoted quote", () => {
    expect(parseNoticed('- Vegan | "I went vegan last year"')).toEqual([
      { observation: "Vegan", quote: "I went vegan last year" },
    ]);
  });

  it("takes NOTHING for an answer", () => {
    expect(parseNoticed("NOTHING")).toEqual([]);
    expect(parseNoticed("  ")).toEqual([]);
  });

  it("caps what one generation can hand on", () => {
    const lines = Array.from(
      { length: MAX_NOTICED + 5 },
      (_, i) => `- Thing ${i} | said ${i}`,
    ).join("\n");
    expect(parseNoticed(lines)).toHaveLength(MAX_NOTICED);
  });
});

describe("parseDrafts", () => {
  it("reads the numbered list it asked for", () => {
    expect(parseDrafts("1. Hello there\n2. Hi Sam!", 3)).toEqual([
      "Hello there",
      "Hi Sam!",
    ]);
  });

  it("accepts the other numbering a model reaches for", () => {
    expect(parseDrafts("1) One\n2) Two", 3)).toEqual(["One", "Two"]);
  });

  it("keeps one unnumbered draft rather than throwing it away", () => {
    expect(parseDrafts("Lovely to hear from you.", 3)).toEqual([
      "Lovely to hear from you.",
    ]);
  });

  it("takes the quotes off a draft that arrived wrapped", () => {
    expect(parseDrafts('1. "Hello there"', 3)).toEqual(["Hello there"]);
  });

  it("turns an escaped newline into one", () => {
    expect(parseDrafts("1. Hi Sam,\\nHow was the weekend?", 3)).toEqual([
      "Hi Sam,\nHow was the weekend?",
    ]);
  });

  it("stops at the limit", () => {
    expect(parseDrafts("1. a\n2. b\n3. c\n4. d", 2)).toEqual(["a", "b"]);
  });

  it("is empty when the agent declines, or says nothing at all", () => {
    expect(parseDrafts("NOTHING", 3)).toEqual([]);
    expect(parseDrafts("  ", 3)).toEqual([]);
    expect(parseDrafts("1. NOTHING", 3)).toEqual([]);
  });
});

describe("the live window", () => {
  it("is 50, because there is no summariser behind it", () => {
    // prd/phase-2.md §2 dropped the summariser from v1, so this number is the
    // whole of what the agent ever sees.
    expect(REPLY_DEFAULTS.liveWindow).toBe(50);
  });
});

describe("settingNumber", () => {
  it("takes the deployment's value", () => {
    expect(settingNumber("7", 3, { min: 1, max: 10 })).toBe(7);
  });

  it("falls back where nothing is set, or what is set is not a number", () => {
    expect(settingNumber(undefined, 3, { min: 1, max: 10 })).toBe(3);
    expect(settingNumber("soon", 3, { min: 1, max: 10 })).toBe(3);
  });

  it("clamps rather than trusting a typo", () => {
    expect(settingNumber("9000", 3, { min: 1, max: 10 })).toBe(10);
    expect(settingNumber("-4", 3, { min: 1, max: 10 })).toBe(1);
  });
});

describe("openingBrief, on a candidate nobody has learned anything about", () => {
  const cold: Brief = { ...brief, facts: [], notes: [], messages: [] };

  it("says the profile is empty rather than omitting it", () => {
    // The bug this replaced: the heading was dropped when there were no facts,
    // so the agent could not tell "nobody has asked yet" from "nothing left to
    // ask" — and drafted a greeting back at "hey".
    const text = openingBrief(cold);
    expect(text).toContain("WHAT SAM HAS TOLD THEM");
    expect(text).toContain("Their profile is empty");
  });

  it("lists what is still unknown, and says it is not a checklist", () => {
    const text = openingBrief(cold);
    expect(text).toContain("STILL UNKNOWN ABOUT SAM");
    expect(text).toContain("- Occupation");
    expect(text).toContain("not a checklist");
    expect(text).toContain("at most one");
  });

  it("says so when a match has everything it needs", () => {
    const text = openingBrief({ ...cold, gaps: [] });
    expect(text).toContain("STILL UNKNOWN ABOUT SAM");
    expect(text).toContain("Nothing a match turns on");
    expect(text).not.toContain("not a checklist");
  });
});

describe("updateBrief and what is still unknown", () => {
  it("restates the gaps when the profile has moved", () => {
    const text = updateBrief(brief, { ...NEVER_BRIEFED, seq: 2 });
    expect(text).toContain("PROFILE HAS CHANGED");
    expect(text).toContain("STILL UNKNOWN ABOUT SAM");
  });

  it("leaves them alone when only a message arrived", () => {
    // The opening brief's list still stands, and re-sending it every turn is
    // both noise and a nudge to ask again.
    const since: BriefedThrough = {
      seq: 1,
      voiceUpdatedAt: 0,
      profileUpdatedAt: 999,
    };
    const text = updateBrief(brief, since);
    expect(text).toContain("NEW MESSAGES");
    expect(text).not.toContain("STILL UNKNOWN");
  });
});

describe("aiFunctionStates", () => {
  it("is all on for a conversation nobody has touched", () => {
    expect(aiFunctionStates({})).toEqual({
      drafts: true,
      profile: true,
      voice: true,
    });
  });

  it("takes the profile down with the drafts, because they are one call", () => {
    const off = aiFunctionStates({ aiOff: true });
    expect(off.drafts).toBe(false);
    expect(off.profile).toBe(false);
  });

  it("lets the profile go off on its own, with drafts left running", () => {
    expect(aiFunctionStates({ profileOff: true })).toEqual({
      drafts: true,
      profile: false,
      voice: true,
    });
  });

  it("follows the master switch for a voice nobody has set", () => {
    // The gap this closes: a conversation switched off before the voice field
    // existed was still feeding the voice agent the matchmaker's half of it.
    expect(aiFunctionStates({ aiOff: true }).voice).toBe(false);
  });

  it("obeys an explicit voice over the master switch, either way", () => {
    expect(aiFunctionStates({ aiOff: true, voiceOff: false }).voice).toBe(true);
    expect(aiFunctionStates({ voiceOff: true }).voice).toBe(false);
  });
});

describe("aiSwitchPatch", () => {
  it("stores only the exception for drafts and profile", () => {
    expect(
      aiSwitchPatch({ aiOff: true }, "drafts", true).aiOff,
    ).toBeUndefined();
    expect(
      aiSwitchPatch({ profileOff: true }, "profile", true).profileOff,
    ).toBeUndefined();
  });

  it("takes an untouched voice down with the drafts", () => {
    // Left unset, so it keeps following the master switch — and the panel
    // shows that switch move rather than leaving voice on behind an off one.
    const patch = aiSwitchPatch({}, "drafts", false);
    expect(patch.voiceOff).toBeUndefined();
    expect(aiFunctionStates(patch).voice).toBe(false);
  });

  it("leaves an explicit voice alone when drafts move", () => {
    const patch = aiSwitchPatch({ voiceOff: false }, "drafts", false);
    expect(aiFunctionStates(patch)).toMatchObject({
      drafts: false,
      voice: true,
    });
  });

  it("stores a voice both ways, because absent is not off here", () => {
    expect(aiSwitchPatch({}, "voice", false).voiceOff).toBe(true);
    expect(aiSwitchPatch({}, "voice", true).voiceOff).toBe(false);
  });
});
