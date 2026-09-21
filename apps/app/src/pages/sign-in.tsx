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
import { takeAccountDeleted } from "../auth/account-deleted";
import { safeNextPath } from "../auth/redirects";
import { FullPageStatus } from "../components/full-page-status";

/**
 * `sent` is false when the person chose "I already have a code" — one from an
 * earlier email, or issued by a platform admin (apps/admin) — so no new code
 * was sent, which would have replaced it.
 */
type Step = { kind: "email" } | { kind: "code"; email: string; sent: boolean };

/**
 * Sign-in and sign-up are one flow (prd/phase-1.md §8.3): enter an email, then
 * the code sent to it. A new account is asked for its name afterwards, by
 * RequireAuth. The page never says whether an account exists for an address.
 */
export function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  // Set by the account settings page just before it deleted the account, so
  // the person lands somewhere that says it worked rather than on a bare
  // sign-in form. Read once, on arrival: reading it clears it.
  const [deleted] = useState(takeAccountDeleted);
  const [step, setStep] = useState<Step>({ kind: "email" });

  if (isLoading) return <FullPageStatus>Loading…</FullPageStatus>;
  if (isAuthenticated) return <Navigate to={next} replace />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start gap-4 px-4 py-12 sm:justify-center">
      {deleted && (
        <Card
          className="w-full max-w-md bg-accent/40 p-4 text-sm"
          data-testid="account-deleted-notice"
        >
          <p className="font-medium">Your account is deleted.</p>
          <p className="text-muted-foreground">
            Matchmakers you worked with keep their copy of past conversations.
            Signing up again with the same address starts a new account.
          </p>
        </Card>
      )}
      <Card className="w-full max-w-md">
        {step.kind === "email" ? (
          <EmailStep
            onSent={(email) => setStep({ kind: "code", email, sent: true })}
            onHaveCode={(email) =>
              setStep({ kind: "code", email, sent: false })
            }
          />
        ) : (
          <CodeStep
            email={step.email}
            sent={step.sent}
            onChangeEmail={() => setStep({ kind: "email" })}
          />
        )}
      </Card>
    </main>
  );
}

function EmailStep({
  onSent,
  onHaveCode,
}: {
  onSent: (email: string) => void;
  onHaveCode: (email: string) => void;
}) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function validEmail(): string | null {
    const invalid = emailError(email);
    setError(invalid);
    return invalid ? null : normaliseEmail(email);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const address = validEmail();
    if (address === null) return;
    setSending(true);
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
        <CardTitle>Sign in to match.build</CardTitle>
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
          <Button
            type="button"
            variant="link"
            className="h-auto self-center px-0"
            disabled={sending}
            onClick={() => {
              const address = validEmail();
              if (address !== null) onHaveCode(address);
            }}
          >
            I already have a code
          </Button>
        </form>
      </CardContent>
    </>
  );
}

function CodeStep({
  email,
  sent,
  onChangeEmail,
}: {
  email: string;
  sent: boolean;
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
      await signIn(SIGN_IN_PROVIDER_ID, { email, code: value });
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
      await signIn(SIGN_IN_PROVIDER_ID, { email });
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
        <CardTitle>{sent ? "Check your email" : "Enter your code"}</CardTitle>
        <CardDescription>
          {sent
            ? `We sent a ${SIGN_IN_CODE_LENGTH}-digit code to `
            : `Enter the ${SIGN_IN_CODE_LENGTH}-digit code for `}
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
              <FieldDescription>
                {sent
                  ? "It expires in 10 minutes."
                  : "Codes expire 10 minutes after they're issued."}
              </FieldDescription>
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
