import { useAuthActions } from "@convex-dev/auth/react";
import {
  emailError,
  normaliseEmail,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_PROVIDER_ID,
} from "@repo/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeField,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useConvexAuth } from "convex/react";
import { type FormEvent, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { safeNextPath } from "../auth/redirects";
import { FullPageStatus } from "../components/full-page-status";

/**
 * The same email + code sign-in as apps/app, with its own session (see
 * main.tsx). Anyone can sign in; RequireAdmin then turns away accounts that
 * aren't in PLATFORM_ADMIN_EMAILS.
 */
export function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState<string | null>(null);

  if (isLoading) return <FullPageStatus>Loading…</FullPageStatus>;
  if (isAuthenticated) return <Navigate to={next} replace />;

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <Card className="w-full max-w-sm">
        {email === null ? (
          <EmailStep onSent={setEmail} />
        ) : (
          <CodeStep email={email} onChangeEmail={() => setEmail(null)} />
        )}
      </Card>
    </main>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = emailError(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSending(true);
    const address = normaliseEmail(email);
    try {
      await signIn(SIGN_IN_PROVIDER_ID, { email: address });
      onSent(address);
    } catch {
      setError("We couldn't send a code just now. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Matchmaker Admin</CardTitle>
        <CardDescription>
          Sign in with a platform admin's email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          data-testid="sign-in-email-form"
        >
          <Field invalid={error !== null}>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
            {error && <FieldError match>{error}</FieldError>}
          </Field>
          <Button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      </CardContent>
    </>
  );
}

function CodeStep({
  email,
  onChangeEmail,
}: {
  email: string;
  onChangeEmail: () => void;
}) {
  const { signIn } = useAuthActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(value: string) {
    if (value.length !== SIGN_IN_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success the auth state flips and SignInPage redirects.
      await signIn(SIGN_IN_PROVIDER_ID, { email, code: value });
    } catch {
      setError("That code didn't work. Check it, or start again.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a {SIGN_IN_CODE_LENGTH}-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify(code);
          }}
          className="flex flex-col gap-4"
          data-testid="sign-in-code-form"
        >
          <Field invalid={error !== null}>
            <FieldLabel>Sign-in code</FieldLabel>
            <CodeField
              length={SIGN_IN_CODE_LENGTH}
              value={code}
              onValueChange={setCode}
              onValueComplete={(value) => void verify(value)}
              disabled={busy}
            />
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              <FieldDescription>It expires in 10 minutes.</FieldDescription>
            )}
          </Field>
          <Button
            type="submit"
            disabled={busy || code.length !== SIGN_IN_CODE_LENGTH}
          >
            {busy ? "Checking…" : "Continue"}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto self-start px-0"
            onClick={onChangeEmail}
          >
            Use a different email
          </Button>
        </form>
      </CardContent>
    </>
  );
}
