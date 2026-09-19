import {
  api,
  businessNameError,
  displayNameError,
  MATCHMAKER_LIMITS,
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
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { describeProfileEvent } from "../workspace/profile-history";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * Matchmaker profile settings (prd/phase-1.md §4): display name and business
 * name, the fixed username, and the profile's own change history (§5.1).
 */
export function MatchmakerSettingsPage() {
  const workspace = useWorkspace();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-3xl">Profile settings</h1>
      <ProfileForm key={workspace.matchmakerId} />
      <ProfileHistory />
    </main>
  );
}

type Errors = { displayName?: string; businessName?: string; form?: string };

function ProfileForm() {
  const workspace = useWorkspace();
  const update = useMutation(api.matchmakers.mutations.update);
  const [displayName, setDisplayName] = useState(workspace.displayName);
  const [businessName, setBusinessName] = useState(
    workspace.businessName ?? "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid: Errors = {
      displayName: displayNameError(displayName) ?? undefined,
      businessName: businessNameError(businessName) ?? undefined,
    };
    setErrors(invalid);
    if (invalid.displayName || invalid.businessName) return;
    setStatus("saving");
    try {
      await update({
        matchmakerId: workspace.matchmakerId,
        displayName,
        businessName,
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
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Candidates see your display name.</CardDescription>
      </CardHeader>
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
            {errors.displayName && (
              <FieldError match>{errors.displayName}</FieldError>
            )}
          </Field>

          <Field invalid={errors.businessName !== undefined}>
            <FieldLabel>Business name (optional)</FieldLabel>
            <Input
              autoComplete="organization"
              maxLength={MATCHMAKER_LIMITS.businessName + 10}
              value={businessName}
              onChange={(event) => {
                setBusinessName(event.target.value);
                edited();
              }}
            />
            {errors.businessName ? (
              <FieldError match>{errors.businessName}</FieldError>
            ) : (
              <FieldDescription>Leave blank to remove it.</FieldDescription>
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

const when = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function ProfileHistory() {
  const workspace = useWorkspace();
  const history = useQuery(api.matchmakers.queries.profileHistory, {
    matchmakerId: workspace.matchmakerId,
  });

  return (
    <section
      aria-labelledby="profile-history-heading"
      className="flex flex-col gap-3"
      data-testid="profile-history"
    >
      <h2
        id="profile-history-heading"
        className="text-sm font-medium uppercase tracking-wide text-muted-foreground"
      >
        History
      </h2>
      {history === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {history.map((event) => (
            <li key={event._id} className="flex flex-col gap-0.5 px-4 py-3">
              {describeProfileEvent(event.action, event.changes).map((line) => (
                <span key={line} className="text-sm">
                  {line}
                </span>
              ))}
              <time
                dateTime={new Date(event._creationTime).toISOString()}
                className="text-xs text-muted-foreground"
              >
                You · {when.format(event._creationTime)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
