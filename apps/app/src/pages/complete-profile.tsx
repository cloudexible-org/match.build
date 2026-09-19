import { useAuthActions } from "@convex-dev/auth/react";
import { accountNameError, api, USER_LIMITS } from "@repo/api";
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
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";

/**
 * The last step of sign-up: a new account has an email but no name yet.
 * Shown by RequireAuth in place of whatever page was requested, which then
 * renders once the name is saved.
 */
export function CompleteProfilePage() {
  const setName = useMutation(api.users.mutations.setName);
  const { signOut } = useAuthActions();
  const [name, setNameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = accountNameError(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await setName({ name });
    } catch {
      setError("We couldn't save your name. Try again.");
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>What's your name?</CardTitle>
          <CardDescription>
            Matchmakers you join will see it. You can change it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            data-testid="complete-profile-form"
          >
            <Field invalid={error !== null}>
              <FieldLabel>Your name</FieldLabel>
              <Input
                autoComplete="name"
                maxLength={USER_LIMITS.name}
                value={name}
                onChange={(event) => setNameValue(event.target.value)}
                autoFocus
              />
              {error ? (
                <FieldError match>{error}</FieldError>
              ) : (
                <FieldDescription>First name is fine.</FieldDescription>
              )}
            </Field>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
