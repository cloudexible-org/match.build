import { describe, expect, test } from "vitest";
import { valueError } from "../profiles/rules";
import {
  parseVoice,
  VOICE_FIELD,
  VOICE_SAMPLE_MESSAGES,
  voiceInstruction,
} from "./rules";

const samples = [
  { body: "Sam — I've got someone in mind. Free Thursday?", sentAt: 1 },
  { body: "That makes sense. Let's park it.", sentAt: 2 },
];

describe("voiceInstruction", () => {
  test("shows the agent what they actually wrote", () => {
    const instruction = voiceInstruction("Maya", "", samples);
    for (const sample of samples) expect(instruction).toContain(sample.body);
  });

  test("says plainly when they have not described themselves", () => {
    expect(voiceInstruction("Maya", "", samples)).toContain(
      "HAVE NOT DESCRIBED THEIR OWN VOICE",
    );
  });

  test("frames their own words as the thing being refined, not replaced", () => {
    // The policy makes this a proposal whatever the prompt says, but an agent
    // told to rewrite them from scratch writes a worse proposal.
    const instruction = voiceInstruction("Maya", "Warm but brief.", samples);
    expect(instruction).toContain("Warm but brief.");
    expect(instruction).toContain("refining rather than replacing");
    expect(instruction).toContain("correct it only where");
  });

  test("tells it not to pad from what matchmakers are generally like", () => {
    expect(voiceInstruction("Maya", "", samples)).toContain(
      "do not fill it out",
    );
  });

  test("asks for no more than the field can hold", () => {
    // A generation longer than this is refused by applyAgentVoice, so asking
    // for it is spending output tokens on something already destined for the
    // bin.
    expect(voiceInstruction("Maya", "", samples)).toContain(
      String(
        VOICE_FIELD.value.kind === "text" ? VOICE_FIELD.value.maxLength : 0,
      ),
    );
  });

  test("gives it a way to decline", () => {
    expect(voiceInstruction("Maya", "", samples)).toContain("NOTHING");
  });
});

describe("parseVoice", () => {
  test("takes the description as written", () => {
    expect(parseVoice("Warm but brief. Short sentences.")).toBe(
      "Warm but brief. Short sentences.",
    );
  });

  test("strips a heading it was told not to write", () => {
    expect(parseVoice("Voice: Warm but brief.")).toBe("Warm but brief.");
    expect(parseVoice("## Description\nWarm but brief.")).toBe(
      "Warm but brief.",
    );
  });

  test("takes a refusal at its word", () => {
    expect(parseVoice("NOTHING")).toBeNull();
    expect(parseVoice("   ")).toBeNull();
  });

  test("never returns something the field would refuse to hold", () => {
    // parseVoice is forgiving; applyAgentVoice is not. Anything that survives
    // here still has to pass the same validation a typed value does.
    const parsed = parseVoice("Warm but brief.");
    expect(parsed).not.toBeNull();
    expect(valueError(VOICE_FIELD, parsed ?? "")).toBeNull();
  });
});

describe("the sampling cadence", () => {
  test("is a number of messages, and not one", () => {
    // prd/phase-2.md §4.1C: on a schedule or after every N sent messages,
    // never per message.
    expect(VOICE_SAMPLE_MESSAGES).toBeGreaterThan(1);
  });
});
