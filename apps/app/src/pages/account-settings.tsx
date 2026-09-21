import { useAuthActions } from "@convex-dev/auth/react";
import {
  ACCOUNT_DELETION_CODE_LENGTH,
  accountNameError,
  api,
  deletionCodeError,
  USER_LIMITS,
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
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { markAccountDeleted } from "../auth/account-deleted";
import { FullPageStatus } from "../components/full-page-status";
import { serverErrorMessage } from "../lib/server-error";
import { NotificationSettings } from "../notifications/notification-settings";
import { Page, PageHeader } from "../shell/page";

/**
 * Account settings (prd/phase-1.md §4): the account's name, how it is
 * notified (§8.1), and deleting it (§3.5).
 */
export function AccountSettingsPage() {
  const me = useQuery(api.users.queries.me);
  const home = useQuery(api.users.queries.home);

  if (me === undefined || home === undefined) {
    return <FullPageStatus>Loading…</FullPageStatus>;
  }
  if (me === null || home === null) return null; // RequireAuth handles this

  return (
    <Page accountName={me.name ?? ""}>
      <PageHeader
        title="Account settings"
        description="Your name, how we reach you, and closing your account."
      />
      <NameForm name={me.name ?? ""} email={me.email ?? ""} />
      <NotificationSettings />
      <DeleteAccount
        ownsMatchmakerProfile={home.matchmakerProfiles.length > 0}
      />
    </Page>
  );
}

function NameForm({ name, email }: { name: string; email: string }) {
  const setName = useMutation(api.users.mutations.setName);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = accountNameError(value);
    setError(invalid);
    if (invalid) return;
    setStatus("saving");
    try {
      await setName({ name: value });
      setStatus("saved");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
      setStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You</CardTitle>
        <CardDescription>
          Matchmakers you have joined see this name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          data-testid="account-name-form"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <span data-testid="account-email">{email}</span>
            <span className="text-sm text-muted-foreground">
              The address you sign in with.
            </span>
          </div>

          <Field invalid={error !== null}>
            <FieldLabel>Your name</FieldLabel>
            <Input
              autoComplete="name"
              maxLength={USER_LIMITS.name}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (status === "saved") setStatus("idle");
              }}
            />
            {error && <FieldError match>{error}</FieldError>}
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
            <span
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-testid="account-name-status"
            >
              {status === "saved" ? "Saved." : ""}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Where the deletion has got to: nothing asked for, or a code is waiting. */
type Step = { kind: "idle" } | { kind: "code"; email: string };

/**
 * Delete account (prd/phase-1.md §3.5): a fresh one-time code to the account's
 * own address, then the deletion.
 *
 * An account that owns a matchmaker profile can't be deleted here — its
 * candidates, notes and conversations hang off that profile — so it is told
 * why instead of being offered a button that would be refused.
 */
function DeleteAccount({
  ownsMatchmakerProfile,
}: {
  ownsMatchmakerProfile: boolean;
}) {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const requestCode = useMutation(api.users.mutations.requestDeletionCode);
  const deleteAccount = useMutation(api.users.mutations.deleteAccount);

  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const { email } = await requestCode({});
      setCode("");
      setStep({ kind: "code", email });
    } catch (caught) {
      setError(
        serverErrorMessage(
          caught,
          "We couldn't send a code just now. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value: string) {
    const invalid = deletionCodeError(value, ACCOUNT_DELETION_CODE_LENGTH);
    setError(invalid);
    if (invalid || busy) return;
    setBusy(true);
    try {
      const result = await deleteAccount({ code: value });
      if (result.kind === "refused") {
        setError(result.message);
        setCode("");
        setBusy(false);
        return;
      }
      // The account is gone, so this session is worthless: end it before
      // anything can try to read with it. The note is left first, because
      // RequireAuth also notices the account has gone and races this
      // redirect — whichever wins, the sign-in page finds it.
      markAccountDeleted();
      await signOut();
      void navigate("/sign-in", { replace: true });
    } catch (caught) {
      setError(serverErrorMessage(caught, "That didn't work. Try again."));
      setBusy(false);
    }
  }

  return (
    <Card data-testid="delete-account">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Matchmakers you have worked with keep their copy of past
          conversations. This can't be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ownsMatchmakerProfile ? (
          <p className="text-sm text-muted-foreground">
            You have a matchmaker profile, so this account can't be deleted here
            — your candidates' conversations, notes and history belong to it.
            Get in touch and we'll help.
          </p>
        ) : step.kind === "idle" ? (
          <>
            <p className="text-sm text-muted-foreground">
              We'll email you a {ACCOUNT_DELETION_CODE_LENGTH}-digit code to
              confirm it's you.
            </p>
            <Button
              variant="outline"
              className="self-start text-destructive"
              disabled={busy}
              data-testid="delete-account-start"
              onClick={() => void sendCode()}
            >
              {busy ? "Sending…" : "Delete account"}
            </Button>
          </>
        ) : (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void confirm(code);
            }}
            className="flex flex-col gap-4"
            data-testid="delete-account-form"
          >
            <Field invalid={error !== null}>
              <FieldLabel>Confirmation code</FieldLabel>
              <CodeField
                length={ACCOUNT_DELETION_CODE_LENGTH}
                value={code}
                onValueChange={setCode}
                onValueComplete={(value) => void confirm(value)}
                disabled={busy}
              />
              {error ? (
                <FieldError match>{error}</FieldError>
              ) : (
                <FieldDescription>
                  Sent to {step.email}. It expires in 10 minutes.
                </FieldDescription>
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={busy || code.length !== ACCOUNT_DELETION_CODE_LENGTH}
              >
                {busy ? "Deleting…" : "Delete my account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStep({ kind: "idle" });
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                disabled={busy}
                onClick={() => void sendCode()}
              >
                Send a new code
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
