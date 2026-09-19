import { useAuthActions } from "@convex-dev/auth/react";
import { emailError, normaliseEmail, SIGN_IN_CODE_LENGTH } from "@repo/api";
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

/** Must match the provider id in packages/api/convex/auth.ts. */
const PROVIDER = "email-code";

type Step = { kind: "email" } | { kind: "code"; email: string };

/**
 * Sign-in and sign-up are one flow (prd/phase-1.md §8.3): enter an email, then
 * the code sent to it. A new account is asked for its name afterwards, by
 * RequireAuth. The page never says whether an account exists for an address.
 */
export function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [step, setStep] = useState<Step>({ kind: "email" });

  if (isLoading) return <FullPageStatus>Loading…</FullPageStatus>;
  if (isAuthenticated) return <Navigate to={next} replace />;

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <Card className="w-full max-w-sm">
        {step.kind === "email" ? (
          <EmailStep onSent={(email) => setStep({ kind: "code", email })} />
        ) : (
          <CodeStep
            email={step.email}
            onChangeEmail={() => setStep({ kind: "email" })}
          />
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
      await signIn(PROVIDER, { email: address });
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
        <CardTitle>Sign in to Matchmaker</CardTitle>
        <CardDescription>
          New here? Use the same form — we'll set up your account.
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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(value: string) {
    if (value.length !== SIGN_IN_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // On success the auth state flips and SignInPage redirects.
      await signIn(PROVIDER, { email, code: value });
    } catch {
      setError("That code didn't work. Check it, or send a new one.");
      setCode("");
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await signIn(PROVIDER, { email });
      setCode("");
      setNotice("We sent a new code.");
    } catch {
      setError("We couldn't send a code just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void verify(code);
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
          onSubmit={handleSubmit}
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
          {notice && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {notice}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || code.length !== SIGN_IN_CODE_LENGTH}
          >
            {busy ? "Checking…" : "Continue"}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={onChangeEmail}
            >
              Use a different email
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() => void resend()}
              disabled={busy}
            >
              Send a new code
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );
}
