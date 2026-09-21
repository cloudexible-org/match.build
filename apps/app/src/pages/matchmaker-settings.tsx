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
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { Page, PageHeader } from "../shell/page";
import { useWorkspace } from "../workspace/workspace-layout";

/**
 * Matchmaker profile settings (prd/phase-1.md §4): display name and business
 * name, and the fixed username.
 *
 * The profile's own change history is still recorded (§5.1) and still
 * readable through `matchmakers.queries.profileHistory`; it is no longer
 * shown here, where it was a log of the two fields on the same screen.
 */
export function MatchmakerSettingsPage() {
  const workspace = useWorkspace();
  return (
    <Page>
      <PageHeader
        title="Profile settings"
        description="How you appear to the candidates in your book."
      />
      <ProfileForm key={workspace.matchmakerId} />
    </Page>
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
