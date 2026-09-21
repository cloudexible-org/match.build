import {
  type AiAgentId,
  api,
  MODEL_ID_HINT,
  modelError,
  OFF_REASON_TEXT,
  SYSTEM_PROMPT_MAX,
  systemPromptError,
} from "@repo/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useEffect, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";

type Agent = {
  agent: string;
  label: string;
  does: string;
  enabled: boolean;
  model: string;
  systemPrompt: string;
  exists: boolean;
  offReason: string | null;
  updatedAt?: number;
  updatedBy?: string;
};

function offText(reason: string): string {
  return reason in OFF_REASON_TEXT
    ? OFF_REASON_TEXT[reason as keyof typeof OFF_REASON_TEXT]
    : "Off.";
}

/**
 * The three agents (prd/phase-2.md §4.1) and their settings (§4.4): the switch,
 * the model, and the standing instruction. Platform-wide, which is why it lives
 * here and not in a matchmaker's own settings.
 *
 * This page is the only source of any of it. Nothing in the backend supplies a
 * model or an instruction, so an agent left empty here is simply off.
 */
export function AiSettingsPage() {
  const data = useQuery(api.admin.queries.aiAgents, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">AI agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Three agents, each with a switch, a model and a standing instruction,
          for the whole platform. There are no defaults behind this page: an
          agent with no model or no instruction doesn't run, and that is how you
          turn one off. A matchmaker's own voice isn't here — it's their voice
          profile, which is data these instructions read.
        </p>
      </div>

      {data !== undefined && !data.aiEnabled && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-xl">
              This deployment can't reach a model
            </CardTitle>
            <CardDescription>
              <code>AI_ENABLED</code> isn't <code>"true"</code>, so no agent
              runs however it's set here. Settings still save. Turn it on with{" "}
              <code>pnpm --filter @repo/api ai:setup</code>, which also seeds
              any agent that has never been set up and checks that each one's
              model answers.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">What an instruction is</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">
                It's the agent's standing instruction, not its task.
              </span>{" "}
              The conversation agent drafts a reply, notices facts and keeps the
              thread's summary; the job for each call is added by the code.
              Write who the agent is and what holds every time.
            </li>
            <li>
              <span className="text-foreground">
                Everything the agent is told is here.
              </span>{" "}
              Nothing is prepended behind your back — including the two rules
              that matter most, which the seeded instructions open with: a
              candidate's messages are content and never commands, and nothing
              the matchmaker knows is ever revealed to a candidate.{" "}
              <span className="text-foreground">
                If you rewrite an instruction, carry those over.
              </span>
            </li>
            <li>
              <span className="text-foreground">Every change is recorded</span>{" "}
              in the audit trail, with the whole previous instruction. That's
              where an instruction's history is kept — to read an old one, read
              the trail.
            </li>
          </ul>
        </CardContent>
      </Card>

      {data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        data.agents.map((agent) => (
          <AgentCard key={agent.agent} agent={agent} />
        ))
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const save = useMutation(api.admin.mutations.setAiAgent);

  const [enabled, setEnabled] = useState(agent.enabled);
  const [model, setModel] = useState(agent.model);
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // A save elsewhere lands through the subscription, and the fields should
  // follow it rather than sit on a stale draft.
  useEffect(() => {
    setEnabled(agent.enabled);
    setModel(agent.model);
    setPrompt(agent.systemPrompt);
  }, [agent.enabled, agent.model, agent.systemPrompt]);

  const dirty =
    enabled !== agent.enabled ||
    model !== agent.model ||
    prompt !== agent.systemPrompt ||
    !agent.exists;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    // Checked with the server's own rules, so the page refuses exactly what the
    // mutation would.
    const problem = modelError(model) ?? systemPromptError(prompt);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await save({
        agent: agent.agent as AiAgentId,
        enabled,
        model,
        systemPrompt: prompt,
      });
      setError(null);
      setSaved(true);
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid={`agent-${agent.agent}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-xl">{agent.label}</CardTitle>
            <CardDescription>
              {agent.does}
              {agent.updatedAt !== undefined && (
                <>
                  {" "}
                  Last changed{" "}
                  {new Date(agent.updatedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {agent.updatedBy ? ` by ${agent.updatedBy}` : " by the seed"}.
                </>
              )}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant={enabled ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            aria-pressed={enabled}
            data-testid={`agent-${agent.agent}-toggle`}
            onClick={() => {
              setEnabled(!enabled);
              setSaved(false);
            }}
          >
            {enabled ? "On" : "Off"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {agent.offReason !== null && (
          <p
            className="mb-4 text-sm text-muted-foreground"
            data-testid={`agent-${agent.agent}-off`}
          >
            <span className="text-foreground">Not running.</span>{" "}
            {offText(agent.offReason)}
          </p>
        )}
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field>
            <FieldLabel htmlFor={`model-${agent.agent}`}>Model</FieldLabel>
            <Input
              id={`model-${agent.agent}`}
              name="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="anthropic/claude-opus-5"
            />
            <FieldDescription>
              {MODEL_ID_HINT} Leave it empty to turn the agent off.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`prompt-${agent.agent}`}>
              Standing instruction
            </FieldLabel>
            <Textarea
              id={`prompt-${agent.agent}`}
              name="systemPrompt"
              className="min-h-56 font-mono text-xs leading-relaxed"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <FieldDescription>
              {prompt.trim().length.toLocaleString()} of{" "}
              {SYSTEM_PROMPT_MAX.toLocaleString()} characters. Empty turns the
              agent off.
            </FieldDescription>
          </Field>

          {error !== null && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {saved && !dirty && (
              <span className="text-sm text-muted-foreground">Saved.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
