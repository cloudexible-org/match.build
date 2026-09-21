import { describe, expect, test } from "vitest";
import {
  AI_AGENT_IDS,
  AI_AGENT_LABELS,
  isAiAgentId,
  isModelId,
  modelError,
  offReasonFor,
  SYSTEM_PROMPT_MAX,
  systemPromptError,
} from "./rules";

describe("the agent list", () => {
  test("is the three agents prd/phase-2.md §4.1 settles on", () => {
    expect(AI_AGENT_IDS).toEqual([
      "conversation",
      "candidate_profile",
      "voice_profile",
    ]);
  });

  test("labels every agent", () => {
    for (const agent of AI_AGENT_IDS) {
      expect(AI_AGENT_LABELS[agent].label).not.toBe("");
      expect(AI_AGENT_LABELS[agent].does).not.toBe("");
    }
  });

  test("recognises its own ids and nothing else", () => {
    expect(isAiAgentId("conversation")).toBe(true);
    expect(isAiAgentId("reply_suggester")).toBe(false);
    expect(isAiAgentId("")).toBe(false);
  });

  test("supplies no model or instruction of its own", async () => {
    // The point of prd/phase-2.md §4.4: settings come from the database, so this
    // module must hold no value anything could fall back to. Checked by asking
    // whether any exported string *is* a model id — `MODEL_ID_HINT` names one as
    // an example, which is help text and not something a generation could run on.
    const source = await import("./rules");
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(source);
    expect(strings.filter((s) => isModelId(s))).toEqual([]);
    // A prompt is long; nothing here should be.
    expect(strings.filter((s) => s.length > 400)).toEqual([]);
  });
});

describe("isModelId", () => {
  test("accepts the gateway's provider/model shape", () => {
    expect(isModelId("anthropic/claude-opus-5")).toBe(true);
    expect(isModelId("anthropic/claude-haiku-4-5")).toBe(true);
  });

  test("rejects a bare model name or a stray path", () => {
    expect(isModelId("claude-opus-5")).toBe(false);
    expect(isModelId("anthropic/claude/opus")).toBe(false);
  });
});

describe("what the settings page may save", () => {
  test("allows empty, because empty is how an agent is turned off", () => {
    expect(modelError("")).toBeNull();
    expect(modelError("   ")).toBeNull();
    expect(systemPromptError("")).toBeNull();
  });

  test("still refuses a non-empty model that can't work", () => {
    expect(modelError("opus")).toMatch(/provider, a slash/);
    expect(modelError("anthropic/claude-opus-5")).toBeNull();
  });

  test("refuses an instruction past the ceiling, and says by how much", () => {
    expect(systemPromptError("x".repeat(SYSTEM_PROMPT_MAX + 1))).toMatch(
      /at most/,
    );
    expect(systemPromptError("x".repeat(SYSTEM_PROMPT_MAX))).toBeNull();
  });
});

describe("offReasonFor", () => {
  const configured = {
    exists: true,
    enabled: true,
    model: "anthropic/claude-opus-5",
    systemPrompt: "Do the thing.",
  };

  test("names each of the four ways of being off", () => {
    expect(offReasonFor({ ...configured, exists: false })).toBe("unconfigured");
    expect(offReasonFor({ ...configured, enabled: false })).toBe("disabled");
    expect(offReasonFor({ ...configured, model: "" })).toBe("no_model");
    expect(offReasonFor({ ...configured, systemPrompt: "  " })).toBe(
      "no_instruction",
    );
  });

  test("is null only when everything is in place", () => {
    expect(offReasonFor(configured)).toBeNull();
  });

  test("reports the missing row before anything else", () => {
    // An agent that was never set up is not "disabled" — nobody disabled it.
    expect(
      offReasonFor({
        exists: false,
        enabled: false,
        model: "",
        systemPrompt: "",
      }),
    ).toBe("unconfigured");
  });
});
