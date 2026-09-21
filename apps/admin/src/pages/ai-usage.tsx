import {
  api,
  DEFAULT_USAGE_WINDOW_DAYS,
  formatCost,
  formatRate,
  formatTokens,
  groupCostMicroUsd,
  MODEL_RATE_HINT,
  modelRateError,
  USAGE_WINDOWS,
} from "@repo/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";

type Totals = {
  generations: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  costMicroUsd: number;
  unpriced: number;
};

type Group = Totals & { key: string };
type Labelled = Group & { label: string };
type ModelRow = Group & {
  rate: {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
    cachedInputUsdPerMillion?: number;
  } | null;
  configured: boolean;
};

/**
 * What the AI is costing (prd/phase-2.md §6, "cost control"): tokens per day,
 * per agent, per model and per matchmaker, over a window of UTC days.
 *
 * **Tokens are measured and money is computed**, and the page keeps the two
 * apart everywhere. The Convex AI gateway answers with a token count and no
 * price, so every figure in dollars here is arithmetic over a rate typed into
 * the table at the bottom — and a generation on a model nobody has priced
 * reports its tokens and no cost rather than a zero.
 */
export function AiUsagePage() {
  const [days, setDays] = useState<number>(DEFAULT_USAGE_WINDOW_DAYS);
  const data = useQuery(api.admin.queries.aiUsage, { days });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">AI usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every call that left this deployment for a model, by UTC day. The
          gateway reports <span className="text-foreground">tokens</span> and no
          price, so the money on this page is arithmetic over the rates at the
          bottom — a model nobody has priced still counts its tokens and simply
          has no cost.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="usage-windows">
        {USAGE_WINDOWS.map((window) => (
          <Button
            key={window.days}
            type="button"
            size="sm"
            variant={window.days === days ? "default" : "outline"}
            aria-pressed={window.days === days}
            data-testid={`usage-window-${window.days}`}
            onClick={() => setDays(window.days)}
          >
            {window.label}
          </Button>
        ))}
      </div>

      {data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Summary total={data.total} />

          {data.truncated && (
            <p
              className="text-sm text-destructive"
              role="alert"
              data-testid="usage-truncated"
            >
              This window holds more generations than one read loads, so the
              oldest days are missing from every number above. Choose a shorter
              window.
            </p>
          )}

          <Breakdown
            title="By agent"
            column="Agent"
            description="Which of the three agents (prd/phase-2.md §4.1) is spending it."
            testId="usage-by-agent"
            rows={data.byAgent}
          />

          <Models rows={data.byModel} />

          <Breakdown
            title="By matchmaker"
            column="Matchmaker"
            description="Whose book the spend is on, most expensive first. The per-matchmaker budget prd/phase-2.md §9.2 still owes is the number this table is here to inform."
            testId="usage-by-matchmaker"
            rows={data.byMatchmaker}
            empty="No generation in this window had a matchmaker behind it."
            footer={
              data.platform.generations > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Plus {formatTokens(data.platform.generations)} generation
                  {data.platform.generations === 1 ? "" : "s"} with no
                  matchmaker behind{" "}
                  {data.platform.generations === 1 ? "it" : "them"} — gateway
                  probes from <code>ai:setup</code> — at{" "}
                  {formatTokens(data.platform.totalTokens)} tokens and{" "}
                  {formatCost(groupCostMicroUsd(data.platform))}.
                </p>
              ) : null
            }
          />

          <Days rows={data.byDay} />
        </>
      )}
    </div>
  );
}

function Summary({ total }: { total: Totals }) {
  return (
    <section
      aria-label="Totals"
      data-testid="usage-totals"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Tile label="Generations" value={formatTokens(total.generations)} />
      <Tile label="Input tokens" value={formatTokens(total.inputTokens)}>
        {total.cachedInputTokens > 0
          ? `${formatTokens(total.cachedInputTokens)} of them cached`
          : null}
      </Tile>
      <Tile label="Output tokens" value={formatTokens(total.outputTokens)} />
      <Tile label="Cost" value={formatCost(groupCostMicroUsd(total))}>
        {total.unpriced > 0
          ? `${formatTokens(total.unpriced)} generation${total.unpriced === 1 ? "" : "s"} on an unpriced model, not in this figure`
          : null}
      </Tile>
    </section>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`usage-tile-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      {children ? (
        <p className="mt-1 text-xs text-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}

/** The four columns every breakdown shares, so they read as one table. */
function TotalsHead({ first }: { first: string }) {
  return (
    <thead>
      <tr className="border-b border-border text-left text-muted-foreground">
        <th className="py-2 pr-4 font-medium">{first}</th>
        <th className="py-2 pr-4 text-right font-medium">Generations</th>
        <th className="py-2 pr-4 text-right font-medium">In</th>
        <th className="py-2 pr-4 text-right font-medium">Out</th>
        <th className="py-2 text-right font-medium">Cost</th>
      </tr>
    </thead>
  );
}

function TotalsCells({ row }: { row: Totals }) {
  return (
    <>
      <td className="py-2 pr-4 text-right tabular-nums">
        {formatTokens(row.generations)}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {formatTokens(row.inputTokens)}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {formatTokens(row.outputTokens)}
      </td>
      {/* A group where nothing was priced shows no cost rather than $0.00 — the
          whole point of keeping tokens and money apart. */}
      <td className="py-2 text-right tabular-nums">
        {formatCost(groupCostMicroUsd(row))}
      </td>
    </>
  );
}

function Breakdown({
  title,
  column,
  description,
  testId,
  rows,
  empty,
  footer,
}: {
  title: string;
  /** The first column's heading. Not derived from the title: "By agent" minus
      "By " is "agent", and a lowercase column heading beside four capitalised
      ones reads as a mistake. */
  column: string;
  description: string;
  testId: string;
  rows: Labelled[];
  empty?: string;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {empty ?? "Nothing in this window."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid={testId}>
              <TotalsHead first={column} />
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-border/50 last:border-0"
                    data-testid={`${testId}-row`}
                  >
                    <td className="py-2 pr-4">{row.label}</td>
                    <TotalsCells row={row} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

function Days({ rows }: { rows: Group[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">By day</CardTitle>
        <CardDescription>
          Newest first, in UTC — so two admins in two time zones agree about
          yesterday. A quiet day is a row of zeroes rather than a gap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="usage-by-day">
            <TotalsHead first="Day" />
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    row.generations === 0 && "text-muted-foreground",
                  )}
                  data-testid="usage-by-day-row"
                >
                  <td className="py-2 pr-4 tabular-nums">{row.key}</td>
                  <TotalsCells row={row} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Models({ rows }: { rows: ModelRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">By model, and what it costs</CardTitle>
        <CardDescription>
          {MODEL_RATE_HINT} Clear both rates to leave a model unpriced. A change
          here prices <span className="text-foreground">new</span> generations
          only — what a run cost is stored when it happens, so correcting a rate
          can't rewrite last month. Every change is in the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No model has run or been configured yet, so there is nothing to
            price.
          </p>
        ) : (
          rows.map((row) => <ModelCard key={row.key} row={row} />)
        )}
      </CardContent>
    </Card>
  );
}

function ModelCard({ row }: { row: ModelRow }) {
  const save = useMutation(api.admin.mutations.setAiModelRate);

  const [input, setInput] = useState(() =>
    formatRate(row.rate?.inputUsdPerMillion),
  );
  const [output, setOutput] = useState(() =>
    formatRate(row.rate?.outputUsdPerMillion),
  );
  const [cached, setCached] = useState(() =>
    formatRate(row.rate?.cachedInputUsdPerMillion),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // A save elsewhere lands through the subscription; the fields follow it
  // rather than sitting on a stale draft.
  useEffect(() => {
    setInput(formatRate(row.rate?.inputUsdPerMillion));
    setOutput(formatRate(row.rate?.outputUsdPerMillion));
    setCached(formatRate(row.rate?.cachedInputUsdPerMillion));
  }, [
    row.rate?.inputUsdPerMillion,
    row.rate?.outputUsdPerMillion,
    row.rate?.cachedInputUsdPerMillion,
  ]);

  const dirty =
    input !== formatRate(row.rate?.inputUsdPerMillion) ||
    output !== formatRate(row.rate?.outputUsdPerMillion) ||
    cached !== formatRate(row.rate?.cachedInputUsdPerMillion);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    // The server's own rule, so the page refuses exactly what the mutation
    // would.
    const problem = modelRateError(input, output);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await save({
        model: row.key,
        inputUsdPerMillion: input,
        outputUsdPerMillion: output,
        cachedInputUsdPerMillion: cached,
      });
      setError(null);
      setSaved(true);
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "Couldn't save that rate."));
    } finally {
      setBusy(false);
    }
  }

  const field = `rate-${row.key.replaceAll(/[^a-zA-Z0-9]/g, "-")}`;

  return (
    <section
      className="rounded-lg border border-border p-4"
      data-testid={`usage-model-${row.key}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{row.key}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.configured
              ? "An agent is set to run on it."
              : "No agent is set to run on it."}{" "}
            {row.generations === 0
              ? "Nothing in this window."
              : `${formatTokens(row.generations)} generation${row.generations === 1 ? "" : "s"}, ${formatTokens(row.totalTokens)} tokens.`}
          </p>
        </div>
        <p
          className="font-display text-xl tabular-nums"
          data-testid={`usage-model-${row.key}-cost`}
        >
          {/* What its generations were recorded as costing — not whether it has
              a rate today. A model whose rate was just cleared still spent what
              it spent. */}
          {formatCost(groupCostMicroUsd(row))}
        </p>
      </div>

      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
        <Rate
          id={`${field}-in`}
          label="Input $/M"
          value={input}
          onChange={setInput}
        />
        <Rate
          id={`${field}-out`}
          label="Output $/M"
          value={output}
          onChange={setOutput}
        />
        <Rate
          id={`${field}-cached`}
          label="Cached input $/M"
          value={cached}
          onChange={setCached}
          hint="Optional"
        />
        <Button type="submit" size="sm" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-muted-foreground">Saved.</span>
        )}
      </form>

      {error !== null && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Rate({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
        {hint ? ` (${hint})` : ""}
      </label>
      <Input
        id={id}
        className="w-28 tabular-nums"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
