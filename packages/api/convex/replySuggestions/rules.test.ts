import { describe, expect, it } from "vitest";
import {
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

  it("leaves out a section it has nothing for", () => {
    const bare = openingBrief({ ...brief, facts: [], notes: [] });
    expect(bare).not.toContain("HAS TOLD THEM");
    expect(bare).not.toContain("OWN NOTES");
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
  it("asks for as many as it was told to", () => {
    expect(draftInstruction(3, "Sam")).toContain("3 replies");
    expect(draftInstruction(1, "Sam")).toContain("one reply");
  });

  it("repeats the rule that matters most, where the model will act on it", () => {
    expect(draftInstruction(3, "Sam")).toContain(
      "Never repeat the matchmaker's private notes",
    );
  });

  it("gives it a way to decline", () => {
    expect(draftInstruction(3, "Sam")).toContain("NOTHING");
  });

  it("asks for both halves, replies first", () => {
    const instruction = draftInstruction(3, "Sam");
    expect(instruction).toContain("REPLIES");
    expect(instruction).toContain("NOTICED");
    // The half a matchmaker sees is the half described first (prd §4.4).
    expect(instruction.indexOf("REPLIES")).toBeLessThan(
      instruction.indexOf("NOTICED"),
    );
  });

  it("insists the quote is the candidate's own words", () => {
    expect(draftInstruction(3, "Sam")).toContain("character for character");
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
