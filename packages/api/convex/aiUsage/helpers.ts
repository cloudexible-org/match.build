/**
 * Recording what a generation cost, and adding it up for /admin/usage.
 *
 * `recordUsage` is the only thing this backend's four model calls know about,
 * and `usageSummary` the only thing the admin query knows about. Nothing here is
 * registered as a function.
 */

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { AI_AGENT_IDS, AI_AGENT_LABELS, type AiAgentId } from "../ai/rules";
import {
  type GenerationUsage,
  MAX_USAGE_ROWS,
  type ModelRate,
  windowDays,
  windowStartDay,
} from "./rules";

/** The stored rate for a model, or `null` when nobody has priced it. */
export async function modelRate(
  ctx: QueryCtx,
  model: string,
): Promise<ModelRate | null> {
  const row = await storedModelRate(ctx, model);
  if (row === null) return null;
  return {
    inputUsdPerMillion: row.inputUsdPerMillion,
    outputUsdPerMillion: row.outputUsdPerMillion,
    cachedInputUsdPerMillion: row.cachedInputUsdPerMillion,
  };
}

export async function storedModelRate(
  ctx: QueryCtx,
  model: string,
): Promise<Doc<"aiModelRates"> | null> {
  return await ctx.db
    .query("aiModelRates")
    .withIndex("by_model", (q) => q.eq("model", model.trim()))
    .unique();
}

/**
 * Records one generation's tokens, and what we believe they cost.
 *
 * **It cannot throw.** Every caller is an action in the middle of something a
 * matchmaker is waiting on — a draft above their composer, a fact reaching a
 * profile — and an accounting write is never worth losing one of those for. A
 * failure is logged and the run carries on, which is the same bargain the
 * drafting run already makes with its own errors (prd/phase-2.md, Principle).
 *
 * Called with whatever the generation returned, `undefined` included: a provider
 * that reported no usage still made a call, and a row of zeroes says "we weren't
 * told" where a missing row would say "nothing ran".
 */
export async function recordUsage(
  ctx: ActionCtx,
  args: {
    agent: AiAgentId;
    model: string;
    usage: GenerationUsage | undefined;
    /** Who it was for. A gateway probe has neither. */
    conversationId?: Id<"conversations">;
    matchmakerId?: Id<"matchmakers">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.aiUsage.mutations.record, {
      agent: args.agent,
      model: args.model,
      inputTokens: args.usage?.inputTokens,
      outputTokens: args.usage?.outputTokens,
      totalTokens: args.usage?.totalTokens,
      cachedInputTokens: args.usage?.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: args.usage?.inputTokenDetails?.cacheWriteTokens,
      reasoningTokens: args.usage?.outputTokenDetails?.reasoningTokens,
      conversationId: args.conversationId,
      matchmakerId: args.matchmakerId,
    });
  } catch (error) {
    console.error(
      `Recording AI usage failed for ${args.agent} on ${args.model}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/*
 * ─── Adding it up ───────────────────────────────────────────────────────────
 */

/** Running totals over some set of generations. */
export type UsageTotals = {
  generations: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  /** What the priced generations came to. */
  costMicroUsd: number;
  /**
   * How many had no rate, and so are missing from `costMicroUsd`. The number
   * that stops a total being read as the whole bill.
   */
  unpriced: number;
};

function emptyTotals(): UsageTotals {
  return {
    generations: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    costMicroUsd: 0,
    unpriced: 0,
  };
}

function add(totals: UsageTotals, row: Doc<"aiGenerations">): void {
  totals.generations += 1;
  totals.inputTokens += row.inputTokens;
  totals.outputTokens += row.outputTokens;
  totals.cachedInputTokens += row.cachedInputTokens ?? 0;
  totals.totalTokens += row.totalTokens;
  if (row.costMicroUsd === undefined) totals.unpriced += 1;
  else totals.costMicroUsd += row.costMicroUsd;
}

/** A group of generations sharing a key, with its own totals. */
export type UsageGroup<K extends string = string> = UsageTotals & { key: K };

function grouped<K extends string>(
  rows: Doc<"aiGenerations">[],
  keyOf: (row: Doc<"aiGenerations">) => K | null,
): Map<K, UsageTotals> {
  const groups = new Map<K, UsageTotals>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    let totals = groups.get(key);
    if (totals === undefined) {
      totals = emptyTotals();
      groups.set(key, totals);
    }
    add(totals, row);
  }
  return groups;
}

/** Most expensive first, then most tokens — so unpriced groups still sort. */
function byCost<T extends UsageTotals>(rows: T[]): T[] {
  return rows.sort(
    (a, b) => b.costMicroUsd - a.costMicroUsd || b.totalTokens - a.totalTokens,
  );
}

/** How many matchmakers the page lists, and how many rates it will read. */
export const USAGE_TENANT_ROWS = 20;
const MAX_RATE_ROWS = 200;

export type UsageSummary = {
  /** How many UTC days the window covers. */
  days: number;
  total: UsageTotals;
  /** Newest first, with quiet days included so a gap is visible as a zero. */
  byDay: UsageGroup[];
  byAgent: (UsageGroup<AiAgentId> & { label: string })[];
  byModel: (UsageGroup & {
    /** What it is priced at, or `null` when nobody has priced it. */
    rate: ModelRate | null;
    /** Whether an agent is set to run on it right now. */
    configured: boolean;
  })[];
  byMatchmaker: (UsageGroup & { label: string })[];
  /** Generations with no matchmaker behind them: the gateway probe. */
  platform: UsageTotals;
  /**
   * Whether the window held more rows than one read may load. The page says so
   * rather than reporting the smaller number as the whole of it.
   */
  truncated: boolean;
};

/**
 * Everything /admin/usage shows, for one window of UTC days.
 *
 * One read of `aiGenerations` and a pass per grouping, rather than a query per
 * card: they would be the same rows read five times, which is five chances for
 * the totals to disagree with each other.
 */
export async function usageSummary(
  ctx: QueryCtx,
  days: number,
): Promise<UsageSummary> {
  const now = Date.now();
  const dayKeys = windowDays(now, days);
  const from = windowStartDay(now, days);

  // Newest day first, so a window that hits the ceiling loses its oldest days
  // rather than the recent ones somebody opened the page to look at.
  const rows = await ctx.db
    .query("aiGenerations")
    .withIndex("by_day", (q) => q.gte("day", from))
    .order("desc")
    .take(MAX_USAGE_ROWS + 1);
  const truncated = rows.length > MAX_USAGE_ROWS;
  const window = truncated ? rows.slice(0, MAX_USAGE_ROWS) : rows;

  const total = emptyTotals();
  const platform = emptyTotals();
  for (const row of window) {
    add(total, row);
    if (row.matchmakerId === undefined) add(platform, row);
  }

  const dayGroups = grouped(window, (row) => row.day);
  const byDay = [...dayKeys]
    .reverse()
    .map((key) => ({ key, ...(dayGroups.get(key) ?? emptyTotals()) }));

  const agentGroups = grouped(window, (row) => row.agent);
  const byAgent = AI_AGENT_IDS.map((agent) => ({
    key: agent,
    label: AI_AGENT_LABELS[agent].label,
    ...(agentGroups.get(agent) ?? emptyTotals()),
  }));

  // Every model worth a row: one that ran in this window, one an agent is set to
  // run on now, and one somebody has priced. The last two matter because a rate
  // should be enterable *before* the first bill rather than after it.
  const modelGroups = grouped(window, (row) => row.model);
  const models = new Set<string>(modelGroups.keys());
  const configured = new Set<string>();
  for (const agent of AI_AGENT_IDS) {
    const stored = await ctx.db
      .query("aiAgentSettings")
      .withIndex("by_agent", (q) => q.eq("agent", agent))
      .unique();
    const model = stored?.model.trim() ?? "";
    if (model !== "") {
      models.add(model);
      configured.add(model);
    }
  }
  const rates = new Map<string, ModelRate>();
  for (const row of await ctx.db.query("aiModelRates").take(MAX_RATE_ROWS)) {
    models.add(row.model);
    rates.set(row.model, {
      inputUsdPerMillion: row.inputUsdPerMillion,
      outputUsdPerMillion: row.outputUsdPerMillion,
      cachedInputUsdPerMillion: row.cachedInputUsdPerMillion,
    });
  }
  const byModel = byCost(
    [...models].map((model) => ({
      key: model,
      rate: rates.get(model) ?? null,
      configured: configured.has(model),
      ...(modelGroups.get(model) ?? emptyTotals()),
    })),
  );

  const tenantGroups = grouped(window, (row) => row.matchmakerId ?? null);
  const byMatchmaker = await Promise.all(
    byCost([...tenantGroups].map(([key, totals]) => ({ key, ...totals })))
      .slice(0, USAGE_TENANT_ROWS)
      .map(async (group) => {
        const matchmaker = await ctx.db.get(
          "matchmakers",
          group.key as Id<"matchmakers">,
        );
        return {
          ...group,
          label:
            matchmaker === null
              ? "Deleted matchmaker"
              : `${matchmaker.displayName} (@${matchmaker.username})`,
        };
      }),
  );

  return {
    days: dayKeys.length,
    total,
    byDay,
    byAgent,
    byModel,
    byMatchmaker,
    platform,
    truncated,
  };
}
