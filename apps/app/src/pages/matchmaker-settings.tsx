import {
  api,
  displayNameError,
  MATCHMAKER_LIMITS,
  PRACTICE_FIELDS,
  PRACTICE_PLACEHOLDERS,
  PROFILE_SOURCE_LABELS,
  type PracticeFieldKey,
  VOICE_FIELD,
  VOICE_PLACEHOLDER,
  valueError,
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
  FieldError,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { Page, PageHeader } from "../shell/page";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * Matchmaker profile settings (prd/phase-1.md §4, prd/phase-2.md §5): display
 * name and business name, the fixed username, their practice, and their
 * voice.
 *
 * The profile's own change history is still recorded (§5.1) and still
 * readable through `matchmakers.queries.profileHistory`; it is no longer
 * shown here, where it was a log of the two fields on the same screen.
 */
export function MatchmakerSettingsPage() {
  const workspace = useWorkspace();
  return (
    <Page className="flex flex-col gap-6">
      <PageHeader
        title="Profile settings"
        description="How you appear to the candidates in your book."
      />
      <ProfileForm key={`profile-${workspace.matchmakerId}`} />
      <PracticeForm key={`practice-${workspace.matchmakerId}`} />
      <VoiceForm key={`voice-${workspace.matchmakerId}`} />
    </Page>
  );
}

type Errors = { displayName?: string; form?: string };

function ProfileForm() {
  const workspace = useWorkspace();
  const update = useMutation(api.matchmakers.mutations.update);
  const [displayName, setDisplayName] = useState(workspace.displayName);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid: Errors = {
      displayName: displayNameError(displayName) ?? undefined,
    };
    setErrors(invalid);
    if (invalid.displayName) return;
    setStatus("saving");
    try {
      await update({
        matchmakerId: workspace.matchmakerId,
        displayName,
      });
      setStatus("saved");
    } catch (error) {
      setErrors({
        form: serverErrorMessage(error, "We couldn't save. Try again."),
      });
      setStatus("idle");
    }
  }

  function edited() {
    if (status === "saved") setStatus("idle");
  }

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          data-testid="matchmaker-settings-form"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Username</span>
            <span data-testid="matchmaker-settings-username">
              {workspace.username}
            </span>
            <span className="text-sm text-muted-foreground">
              Your workspace address. Usernames can't be changed.
            </span>
          </div>

          <Field invalid={errors.displayName !== undefined}>
            <FieldLabel>Display name</FieldLabel>
            <Input
              maxLength={MATCHMAKER_LIMITS.displayName + 10}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                edited();
              }}
            />
            {errors.displayName ? (
              <FieldError match>{errors.displayName}</FieldError>
            ) : (
              <FieldDescription>
                Candidates see your display name.
              </FieldDescription>
            )}
          </Field>

          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
            <span
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-testid="matchmaker-settings-status"
            >
              {status === "saved" ? "Saved." : ""}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Their practice (`matchmakerProfiles/rules.ts`): who they work with, how they
 * work, what they don't do.
 *
 * **The assistant has no other way to learn any of it.** It is shown a
 * conversation and a candidate; that this matchmaker serves one community, or
 * never discusses money, is in neither — so a draft would avoid the subject or
 * invent an answer. Everything typed here goes to the drafting agent as
 * standing fact, and to no other agent.
 *
 * **Nothing here is ever written by an agent.** All three are `matchmaker`
 * policy, which `agentWriteMode` refuses outright rather than turning into a
 * proposal — unlike the voice below, which an agent may draft for them. So
 * there is no suggestion card here and no "approved by you": what it says is
 * what they typed. The card says so, because a matchmaker deciding whether to
 * write down how they run their business deserves to know which of the two
 * kinds of field they are filling in.
 */
function PracticeForm() {
  return (
    <Card data-testid="practice-form">
      <CardHeader>
        <CardTitle>Your practice</CardTitle>
        <CardDescription>
          What the assistant should know about how you work, so it can draft
          within it. Only you write these — the assistant never changes them,
          and never repeats them to a candidate who hasn't asked.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {PRACTICE_FIELDS.map((field) => (
          <PracticeField key={field.key} fieldKey={field.key} />
        ))}
      </CardContent>
    </Card>
  );
}

/** One practice field, saved on its own so a long edit cannot lose a sibling. */
function PracticeField({ fieldKey }: { fieldKey: string }) {
  const workspace = useWorkspace();
  const profile = useQuery(api.matchmakerProfiles.queries.get, {
    matchmakerId: workspace.matchmakerId,
  });
  const save = useMutation(api.matchmakerProfiles.mutations.setPracticeField);

  const field = PRACTICE_FIELDS.find((candidate) => candidate.key === fieldKey);
  const key = fieldKey as PracticeFieldKey;
  const stored = profile?.[key]?.value ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  if (field === undefined) return null;
  // The stored value until they type, then their draft — so a save landing
  // from another tab is picked up rather than clobbering what they are writing.
  const value = draft ?? stored;
  const dirty = draft !== null && draft !== stored;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (field === undefined) return;
    const invalid = valueError(field, value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await save({
        matchmakerId: workspace.matchmakerId,
        field: key,
        value,
      });
      setDraft(null);
      setStatus("saved");
    } catch (thrown) {
      setStatus("idle");
      setError(serverErrorMessage(thrown, "Couldn't save that."));
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      data-testid={`practice-${field.key}`}
    >
      <Field invalid={error !== null}>
        <FieldLabel>{field.label}</FieldLabel>
        <Textarea
          aria-label={field.label}
          rows={5}
          maxLength={
            field.value.kind === "text" ? field.value.maxLength : undefined
          }
          placeholder={PRACTICE_PLACEHOLDERS[key]}
          value={value}
          onChange={(event) => {
            setDraft(event.target.value);
            if (status === "saved") setStatus("idle");
          }}
        />
        {error ? (
          <FieldError match>{error}</FieldError>
        ) : (
          <FieldDescription>{field.hint}</FieldDescription>
        )}
      </Field>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={status === "saving" || !dirty}
          data-testid={`practice-${field.key}-save`}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
        <span
          aria-live="polite"
          className="text-sm text-muted-foreground"
          data-testid={`practice-${field.key}-status`}
        >
          {status === "saved" && !dirty ? "Saved." : ""}
        </span>
      </div>
    </form>
  );
}

/**
 * Their voice (prd/phase-2.md §4.1C): how they write, and the thing every
 * drafted reply is written in. What they *do* is the practice card above; this
 * is only the writing, and the split is the reason the practice card exists —
 * an agent rewrites this field end to end, so nothing else can be kept in it.
 *
 * It is a `suggest` field, so the voice-profile agent may distil a draft from
 * what they have actually sent and never change this under them. When there is
 * a draft waiting, it sits above the box rather than in it — a suggestion that
 * overwrote what it was suggesting a change to would not be a suggestion.
 */
function VoiceForm() {
  const workspace = useWorkspace();
  const profile = useQuery(api.matchmakerProfiles.queries.get, {
    matchmakerId: workspace.matchmakerId,
  });
  const save = useMutation(api.matchmakerProfiles.mutations.setVoice);
  const resolve = useMutation(
    api.matchmakerProfiles.mutations.resolveVoiceSuggestion,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const stored = profile?.voice?.value ?? "";
  const value = draft ?? stored;
  const pending = profile?.voice?.pending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = valueError(VOICE_FIELD, value);
    setError(invalid);
    if (invalid) return;
    setStatus("saving");
    try {
      await save({ matchmakerId: workspace.matchmakerId, value });
      setDraft(null);
      setStatus("saved");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
      setStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice</CardTitle>
        <CardDescription>
          How you write. The assistant drafts replies from this, and never
          changes it without asking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending && (
          <div
            className="mb-5 flex flex-col gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3"
            data-testid="voice-suggestion"
          >
            <span className="text-xs text-muted-foreground">
              {pending.action === "clear"
                ? "The assistant suggests clearing this."
                : "The assistant has drafted a voice for you."}
            </span>
            {pending.action === "set" && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {pending.value}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                data-testid="voice-suggestion-accept"
                onClick={() =>
                  void resolve({
                    matchmakerId: workspace.matchmakerId,
                    accept: true,
                  }).then(() => setDraft(null))
                }
              >
                {pending.action === "clear" ? "Clear it" : "Use it"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="voice-suggestion-dismiss"
                onClick={() =>
                  void resolve({
                    matchmakerId: workspace.matchmakerId,
                    accept: false,
                  })
                }
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          data-testid="voice-form"
        >
          <Field invalid={error !== null}>
            <FieldLabel>{VOICE_FIELD.label}</FieldLabel>
            <Textarea
              aria-label="Voice"
              rows={10}
              maxLength={
                VOICE_FIELD.value.kind === "text"
                  ? VOICE_FIELD.value.maxLength
                  : undefined
              }
              placeholder={VOICE_PLACEHOLDER}
              value={value}
              onChange={(event) => {
                setDraft(event.target.value);
                if (status === "saved") setStatus("idle");
              }}
            />
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              <FieldDescription>{VOICE_FIELD.hint}</FieldDescription>
            )}
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Saving…" : "Save voice"}
            </Button>
            <span
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-testid="voice-status"
            >
              {status === "saved"
                ? "Saved."
                : profile?.voice?.value
                  ? PROFILE_SOURCE_LABELS[profile.voice.source]
                  : ""}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
