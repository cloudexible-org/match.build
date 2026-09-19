import {
  api,
  businessNameError,
  displayNameError,
  MATCHMAKER_LIMITS,
  normaliseUsername,
  usernameError,
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
import { Navigate, useNavigate } from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";
import { serverErrorMessage } from "../lib/server-error";

type Errors = {
  username?: string;
  displayName?: string;
  businessName?: string;
  form?: string;
};

/**
 * Create a matchmaker profile (prd/phase-1.md §1). The username rules are the
 * server's own (`@repo/api`), checked as the person types once they've left
 * the field; whether the name is taken is only known on submit.
 *
 * The UI allows one profile per account, so an account that already owns one
 * is sent to it.
 */
export function CreateMatchmakerPage() {
  const me = useQuery(api.users.queries.me);
  const home = useQuery(api.users.queries.home);
  const create = useMutation(api.matchmakers.mutations.create);
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  if (me === undefined || home === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null || home === null) return null; // RequireAuth handles this
  const existing = home.matchmakerProfiles[0];
  // Not while saving: the new profile shows up here before navigate() runs.
  if (existing !== undefined && !saving) {
    return <Navigate to={`/mm/${existing.username}`} replace />;
  }

  const liveUsernameError = usernameTouched
    ? (usernameError(username) ?? undefined)
    : undefined;
  const shownUsernameError = errors.username ?? liveUsernameError;
  const preview = normaliseUsername(username) || "your.username";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setUsernameTouched(true);
    const invalid: Errors = {
      username: usernameError(username) ?? undefined,
      displayName: displayNameError(displayName) ?? undefined,
      businessName: businessNameError(businessName) ?? undefined,
    };
    setErrors(invalid);
    if (invalid.username || invalid.displayName || invalid.businessName) {
      return;
    }
    setSaving(true);
    try {
      const created = await create({ username, displayName, businessName });
      navigate(`/mm/${created.username}`, { replace: true });
    } catch (error) {
      const message = serverErrorMessage(
        error,
        "We couldn't create your profile. Try again.",
      );
      setErrors(
        message === "That username is taken."
          ? { username: message }
          : { form: message },
      );
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <AppHeader name={me.name ?? ""} />
      <main className="flex justify-center px-4 py-8 sm:py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Create your matchmaker profile</CardTitle>
            <CardDescription>
              Your workspace for onboarding candidates and running your
              conversations with them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              onSubmit={handleSubmit}
              className="flex flex-col gap-5"
              data-testid="create-matchmaker-form"
            >
              <Field invalid={shownUsernameError !== undefined}>
                <FieldLabel>Username</FieldLabel>
                <Input
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={MATCHMAKER_LIMITS.usernameMax + 10}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setErrors(({ username: _, ...rest }) => rest);
                  }}
                  onBlur={() => setUsernameTouched(username !== "")}
                  autoFocus
                />
                {shownUsernameError ? (
                  <FieldError match>{shownUsernameError}</FieldError>
                ) : (
                  <FieldDescription>
                    6–30 letters, numbers and periods. It's your workspace
                    address, <span className="font-medium">/mm/{preview}</span>,
                    and can't be changed later.
                  </FieldDescription>
                )}
              </Field>

              <Field invalid={errors.displayName !== undefined}>
                <FieldLabel>Display name</FieldLabel>
                <Input
                  maxLength={MATCHMAKER_LIMITS.displayName + 10}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                {errors.displayName ? (
                  <FieldError match>{errors.displayName}</FieldError>
                ) : (
                  <FieldDescription>
                    What candidates see. You can change it any time.
                  </FieldDescription>
                )}
              </Field>

              <Field invalid={errors.businessName !== undefined}>
                <FieldLabel>Business name (optional)</FieldLabel>
                <Input
                  autoComplete="organization"
                  maxLength={MATCHMAKER_LIMITS.businessName + 10}
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />
                {errors.businessName && (
                  <FieldError match>{errors.businessName}</FieldError>
                )}
              </Field>

              {errors.form && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              )}

              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
