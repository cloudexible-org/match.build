import { describe, expect, test } from "vitest";
import { DEFAULT_MODELS, isModelId, modelFor } from "./rules";

describe("isModelId", () => {
  test("accepts the gateway's provider/model shape", () => {
    expect(isModelId("anthropic/claude-opus-5")).toBe(true);
    expect(isModelId("anthropic/claude-haiku-4-5")).toBe(true);
  });

  test("rejects a bare model name or a stray path", () => {
    expect(isModelId("claude-opus-5")).toBe(false);
    expect(isModelId("anthropic/claude/opus")).toBe(false);
    expect(isModelId("")).toBe(false);
  });
});

describe("modelFor", () => {
  test("falls back to the job's default when unset", () => {
    expect(modelFor("replies", undefined)).toBe(DEFAULT_MODELS.replies);
    expect(modelFor("extraction", "  ")).toBe(DEFAULT_MODELS.extraction);
  });

  test("takes a deployment override", () => {
    expect(modelFor("replies", " anthropic/claude-sonnet-5 ")).toBe(
      "anthropic/claude-sonnet-5",
    );
  });

  test("ignores an override that can't be a model id", () => {
    // A typo in a deployment setting degrades to the default rather than
    // failing every generation with a provider error.
    expect(modelFor("replies", "opus")).toBe(DEFAULT_MODELS.replies);
  });
});
