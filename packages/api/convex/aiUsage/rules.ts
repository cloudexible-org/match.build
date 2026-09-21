/**
 * What a generation cost, and the arithmetic that turns tokens into money.
 * Plain code with no Convex imports, exported through `@repo/api` so the admin
 * page prices a row exactly as the server did.
 *
 * ─── Tokens are measured; money is computed ─────────────────────────────────
 *
 * The Convex AI gateway is an OpenAI-compatible endpoint: it answers with a
 * `usage` block and **says nothing about price**. Neither does
 * `@convex-dev/agent`, which passes that block along. So there is exactly one
 * fact per generation — how many tokens — and everything in dollars on the
 * usage page is arithmetic over a rate somebody typed at /admin/usage.
 *
 * The two are kept apart everywhere in this file and on that page. A token
 * count is what happened. A cost is what we believe it cost, and a model with
 * no rate has **no** cost rather than a zero — a zero would quietly report a
 * bill as paid off.
 */

/**
 * One generation's usage, in the shape AI SDK 7 reports it (`LanguageModelUsage`),
 * but with every field optional: an OpenAI-compatible provider may report the
 * totals and none of the detail, and the details object itself can be absent.
 */
export type GenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: {
    reasoningTokens?: number;
  };
};

/**
 * A generation's tokens as they are stored. `inputTokens` is the whole prompt,
 * cached part included — that is what the SDK means by it, and the cached count
 * sits beside it as a *subset*, never as an extra.
 *
 * The three detail fields are optional because absent and zero are different
 * answers: absent means the provider did not say, and reporting that as a zero
 * would invent a fact.
 */
export type StoredTokens = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
};

/** A non-negative whole number, or `undefined` for anything else. */
function count(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

/**
 * The usage block as it will be stored.
 *
 * Nothing here trusts the provider's arithmetic: a missing total is the two
 * halves added, a cached count larger than the prompt it is part of is clamped
 * to it, and anything that isn't a non-negative number is dropped. A run whose
 * usage came back empty still records a row — that a generation happened is
 * itself worth knowing, and a row of zeroes says "the provider told us
 * nothing" where a missing row says "nothing ran".
 */
export function storedTokens(usage: GenerationUsage | undefined): StoredTokens {
  const inputTokens = count(usage?.inputTokens) ?? 0;
  const outputTokens = count(usage?.outputTokens) ?? 0;
  const reported = count(usage?.totalTokens);
  const cached = count(usage?.inputTokenDetails?.cacheReadTokens);
  const written = count(usage?.inputTokenDetails?.cacheWriteTokens);
  const reasoning = count(usage?.outputTokenDetails?.reasoningTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: reported ?? inputTokens + outputTokens,
    cachedInputTokens:
      cached === undefined ? undefined : Math.min(cached, inputTokens),
    cacheWriteTokens:
      written === undefined ? undefined : Math.min(written, inputTokens),
    reasoningTokens:
      reasoning === undefined ? undefined : Math.min(reasoning, outputTokens),
  };
}

/**
 * What one model costs, in US dollars per million tokens — the unit every
 * provider publishes, so an admin copies the number off a pricing page rather
 * than converting it.
 */
export type ModelRate = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  /**
   * What a cached input token costs instead. Absent means cached tokens are
   * priced as ordinary input, which over-states the bill rather than
   * under-stating it — the safer direction for a number someone budgets by.
   */
  cachedInputUsdPerMillion?: number;
};

/** Costs are stored as whole micro-dollars: $1 is 1,000,000. */
export const MICRO_USD_PER_USD = 1_000_000;

/**
 * What a generation cost, in micro-dollars, or `null` when the model has no
 * rate. **`null`, never 0** — an unpriced generation is one nobody has priced,
 * and a zero in a total is a claim that it was free.
 *
 * The arithmetic looks like it is missing a division and is not: a rate is
 * dollars per *million* tokens, and a dollar is a million micro-dollars, so the
 * two cancel and `tokens × rate` is already micro-dollars. 1,000 tokens at
 * $3/M is 3,000 µ$, which is $0.003.
 *
 * Cache *writes* are priced as ordinary input. A provider that charges a
 * premium for them is under-reported here, which is the one direction this file
 * errs in knowingly — the count is stored, so correcting it later is arithmetic
 * over rows we already have rather than a gap in them.
 */
export function generationCostMicroUsd(
  tokens: StoredTokens,
  rate: ModelRate | null,
): number | null {
  if (rate === null) return null;
  const cached = tokens.cachedInputTokens ?? 0;
  const fresh = Math.max(tokens.inputTokens - cached, 0);
  const cachedRate = rate.cachedInputUsdPerMillion ?? rate.inputUsdPerMillion;
  return Math.round(
    fresh * rate.inputUsdPerMillion +
      cached * cachedRate +
      tokens.outputTokens * rate.outputUsdPerMillion,
  );
}

/*
 * ─── What may be typed into a rate ──────────────────────────────────────────
 */

/**
 * A ceiling on a rate, in dollars per million tokens. Not a policy about what a
 * model may cost: it is there to catch the typo that matters, which is entering
 * a price per *token* in a field that means per million.
 */
export const MAX_USD_PER_MILLION = 10_000;

export const MODEL_RATE_HINT =
  "In US dollars per million tokens, as providers publish it — 3 means $3 per million.";

/** The rate as typed, or `null` when the field is empty. */
export function parseRate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Why a typed rate can't be saved, or `null`. **Empty is allowed and means
 * unpriced**, which is how a rate is taken back off a model — the same shape as
 * an empty model turning an agent off (`ai/rules.ts`).
 */
export function rateError(value: string): string | null {
  const parsed = parseRate(value);
  if (parsed === null) return null;
  if (Number.isNaN(parsed)) return "A rate is a number, or empty for unpriced.";
  if (parsed < 0) return "A rate can't be negative.";
  if (parsed > MAX_USD_PER_MILLION) {
    return `That's more than $${MAX_USD_PER_MILLION.toLocaleString()} per million tokens — check whether you meant per token.`;
  }
  return null;
}

/**
 * Why a pair of typed rates can't be saved together, or `null`. A model is
 * priced or it isn't: an input rate with no output rate would silently bill
 * every reply as free.
 */
export function modelRateError(input: string, output: string): string | null {
  const problem = rateError(input) ?? rateError(output);
  if (problem !== null) return problem;
  const hasInput = parseRate(input) !== null;
  const hasOutput = parseRate(output) !== null;
  if (hasInput !== hasOutput) {
    return "Give both rates, or clear both to leave the model unpriced.";
  }
  return null;
}

/*
 * ─── Days ───────────────────────────────────────────────────────────────────
 *
 * Usage is bucketed by **UTC** day, and the page says so. A local-day bucket
 * would mean a row's day depended on where the reader was standing, and two
 * admins in two time zones would disagree about yesterday's bill.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day a moment falls in, as `YYYY-MM-DD`. */
export function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The window's days, oldest first. `days: 1` is today alone. */
export function windowDays(now: number, days: number): string[] {
  const span = Math.max(Math.trunc(days), 1);
  const keys: string[] = [];
  for (let back = span - 1; back >= 0; back -= 1) {
    keys.push(dayKey(now - back * DAY_MS));
  }
  return keys;
}

/** The first day in the window, for an index range scan. */
export function windowStartDay(now: number, days: number): string {
  return windowDays(now, days)[0];
}

/** The windows the page offers. */
export const USAGE_WINDOWS = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
] as const;

export const DEFAULT_USAGE_WINDOW_DAYS = 7;

/** The longest window a request may ask for. */
export const MAX_USAGE_WINDOW_DAYS = 90;

/**
 * The most generations one read of the page will load.
 *
 * A ceiling rather than a rollup table, deliberately: at phase-2 volumes a
 * matchmaker's whole month is a few hundred rows, and a daily rollup would be a
 * second copy of this data to keep true. **The page says when it hits this**
 * rather than quietly reporting a smaller bill — which is the whole reason the
 * ceiling is visible in the returned shape instead of hidden in a `.take()`.
 * The read walks the window newest-first, so what a truncated window loses is
 * its oldest days.
 */
export const MAX_USAGE_ROWS = 5_000;

/*
 * ─── Rendering ──────────────────────────────────────────────────────────────
 */

/**
 * Micro-dollars as money.
 *
 * Four decimal places under a dollar, and only when there is a fraction of a
 * cent to show; two at a dollar and above. A single generation routinely costs
 * a thousandth of a cent, so rounding everything to cents would print "$0.00"
 * down a whole column — and printing a month's total as "$8.3330" is noise in
 * the other direction. Both tests are exact, because a cost is a whole number
 * of micro-dollars and a cent is 10,000 of them.
 */
export function formatUsd(microUsd: number): string {
  const whole = Math.round(microUsd);
  const digits =
    Math.abs(whole) < MICRO_USD_PER_USD && whole % 10_000 !== 0 ? 4 : 2;
  return `$${(microUsd / MICRO_USD_PER_USD).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** A cost, or the reason there isn't one. */
export function formatCost(microUsd: number | null): string {
  return microUsd === null ? "No rate" : formatUsd(microUsd);
}

/**
 * What a group of generations came to, or `null` when **none** of them was
 * priced — which is the only case where there is no cost to report rather than a
 * partial one.
 *
 * The distinction matters most for a model whose rate was cleared: the runs it
 * already made keep the cost they were recorded with (`aiUsage/mutations.ts`), so
 * the group has a real total even though the model is unpriced today. Reading
 * "has a rate now" as "has a cost" would hide spend that happened.
 *
 * A group with no generations at all has a cost of zero, because nothing ran.
 */
export function groupCostMicroUsd(totals: {
  generations: number;
  unpriced: number;
  costMicroUsd: number;
}): number | null {
  if (totals.generations > 0 && totals.unpriced === totals.generations) {
    return null;
  }
  return totals.costMicroUsd;
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/** A rate for a form field: the number as typed, or empty when unpriced. */
export function formatRate(usdPerMillion: number | undefined): string {
  return usdPerMillion === undefined ? "" : String(usdPerMillion);
}
