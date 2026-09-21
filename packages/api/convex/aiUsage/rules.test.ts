import { describe, expect, test } from "vitest";
import {
  dayKey,
  formatCost,
  formatRate,
  formatUsd,
  generationCostMicroUsd,
  groupCostMicroUsd,
  MAX_USD_PER_MILLION,
  modelRateError,
  parseRate,
  rateError,
  storedTokens,
  windowDays,
  windowStartDay,
} from "./rules";

describe("storedTokens", () => {
  test("keeps what the provider reported", () => {
    expect(
      storedTokens({
        inputTokens: 1200,
        outputTokens: 340,
        totalTokens: 1540,
        inputTokenDetails: { cacheReadTokens: 900, cacheWriteTokens: 100 },
        outputTokenDetails: { reasoningTokens: 40 },
      }),
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      cachedInputTokens: 900,
      cacheWriteTokens: 100,
      reasoningTokens: 40,
    });
  });

  test("adds the halves when no total came back", () => {
    const tokens = storedTokens({ inputTokens: 10, outputTokens: 5 });
    expect(tokens.totalTokens).toBe(15);
  });

  test("leaves a detail absent rather than calling it zero", () => {
    // Absent and zero are different answers: one is "the provider didn't say".
    const tokens = storedTokens({ inputTokens: 10, outputTokens: 5 });
    expect(tokens.cachedInputTokens).toBeUndefined();
    expect(tokens.reasoningTokens).toBeUndefined();
  });

  test("records a row of zeroes for a generation that reported nothing", () => {
    // A call was made and cost whatever it cost. A row of zeroes says "we
    // weren't told"; no row at all would say "nothing ran".
    expect(storedTokens(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: undefined,
      cacheWriteTokens: undefined,
      reasoningTokens: undefined,
    });
  });

  test("refuses nonsense a provider might send", () => {
    const tokens = storedTokens({
      inputTokens: -5,
      outputTokens: Number.NaN,
      totalTokens: Number.POSITIVE_INFINITY,
      inputTokenDetails: { cacheReadTokens: 9_000 },
    });
    expect(tokens.inputTokens).toBe(0);
    expect(tokens.outputTokens).toBe(0);
    expect(tokens.totalTokens).toBe(0);
    // A cached count can't exceed the prompt it is part of.
    expect(tokens.cachedInputTokens).toBe(0);
  });
});

describe("generationCostMicroUsd", () => {
  const rate = { inputUsdPerMillion: 3, outputUsdPerMillion: 15 };

  test("is tokens times dollars per million, in micro-dollars", () => {
    // 1,000 input at $3/M and 500 output at $15/M is $0.003 + $0.0075.
    const cost = generationCostMicroUsd(
      storedTokens({ inputTokens: 1_000, outputTokens: 500 }),
      rate,
    );
    expect(cost).toBe(10_500);
    expect(formatUsd(cost as number)).toBe("$0.0105");
  });

  test("prices cached input at its own rate, as a subset of the prompt", () => {
    const tokens = storedTokens({
      inputTokens: 1_000,
      outputTokens: 0,
      inputTokenDetails: { cacheReadTokens: 800 },
    });
    // 200 fresh at $3/M plus 800 cached at $0.30/M.
    expect(
      generationCostMicroUsd(tokens, {
        ...rate,
        cachedInputUsdPerMillion: 0.3,
      }),
    ).toBe(840);
    // With no cached rate the whole prompt is priced as input, which
    // over-states rather than under-states.
    expect(generationCostMicroUsd(tokens, rate)).toBe(3_000);
  });

  test("is null for an unpriced model, never zero", () => {
    // A zero in a total reads as "this was free", which is the one thing an
    // unpriced generation must not say.
    expect(
      generationCostMicroUsd(
        storedTokens({ inputTokens: 1_000, outputTokens: 1_000 }),
        null,
      ),
    ).toBeNull();
    expect(formatCost(null)).toBe("No rate");
  });
});

describe("rateError", () => {
  test("allows empty, which means unpriced", () => {
    expect(rateError("")).toBeNull();
    expect(rateError("   ")).toBeNull();
    expect(parseRate("")).toBeNull();
  });

  test("refuses what isn't a non-negative number", () => {
    expect(rateError("cheap")).toMatch(/number/);
    expect(rateError("-1")).toMatch(/negative/);
  });

  test("catches the typo that matters: a price per token", () => {
    expect(rateError(String(MAX_USD_PER_MILLION + 1))).toMatch(/per token/);
    expect(rateError("3")).toBeNull();
    expect(rateError("0.075")).toBeNull();
  });
});

describe("modelRateError", () => {
  test("wants both rates or neither", () => {
    // An input rate with no output rate would bill every reply as free.
    expect(modelRateError("3", "")).toMatch(/both/);
    expect(modelRateError("", "15")).toMatch(/both/);
    expect(modelRateError("", "")).toBeNull();
    expect(modelRateError("3", "15")).toBeNull();
  });
});

describe("days", () => {
  const noon = Date.UTC(2026, 8, 21, 12, 0, 0);

  test("buckets by UTC day, so a row's day doesn't depend on the reader", () => {
    expect(dayKey(noon)).toBe("2026-09-21");
    // Late evening in UTC-7 is already tomorrow in UTC, and stays that way.
    expect(dayKey(Date.UTC(2026, 8, 22, 3, 0, 0))).toBe("2026-09-22");
  });

  test("a one-day window is today alone", () => {
    expect(windowDays(noon, 1)).toEqual(["2026-09-21"]);
    expect(windowStartDay(noon, 1)).toBe("2026-09-21");
  });

  test("a week is seven days, oldest first, ending today", () => {
    const days = windowDays(noon, 7);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-09-15");
    expect(days.at(-1)).toBe("2026-09-21");
  });

  test("crosses a month boundary", () => {
    expect(windowStartDay(Date.UTC(2026, 9, 2, 12), 7)).toBe("2026-09-26");
  });
});

describe("formatting", () => {
  test("shows a fraction of a cent, so a column isn't all $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(300)).toBe("$0.0003");
    expect(formatUsd(10_500)).toBe("$0.0105");
    // A whole number of cents needs no fraction.
    expect(formatUsd(10_000)).toBe("$0.01");
  });

  test("rounds to cents from a dollar up, where the fraction is noise", () => {
    expect(formatUsd(8_333_000)).toBe("$8.33");
    expect(formatUsd(12_340_000)).toBe("$12.34");
    expect(formatUsd(999_900)).toBe("$0.9999");
  });

  test("renders an unset rate as an empty field", () => {
    expect(formatRate(undefined)).toBe("");
    expect(formatRate(0.3)).toBe("0.3");
  });
});

describe("groupCostMicroUsd", () => {
  test("is null only when nothing in the group was priced", () => {
    expect(
      groupCostMicroUsd({ generations: 2, unpriced: 2, costMicroUsd: 0 }),
    ).toBeNull();
  });

  test("reports what was spent when a model's rate has since been cleared", () => {
    // The runs keep the cost they were recorded with, so the group has a real
    // total even though the model is unpriced today. Reading "has a rate now" as
    // "has a cost" would hide spend that happened.
    expect(
      groupCostMicroUsd({
        generations: 2,
        unpriced: 0,
        costMicroUsd: 9_000_000,
      }),
    ).toBe(9_000_000);
  });

  test("reports the part it can price when a group is mixed", () => {
    expect(
      groupCostMicroUsd({ generations: 3, unpriced: 1, costMicroUsd: 500 }),
    ).toBe(500);
  });

  test("is zero for a group where nothing ran", () => {
    expect(
      groupCostMicroUsd({ generations: 0, unpriced: 0, costMicroUsd: 0 }),
    ).toBe(0);
  });
});
