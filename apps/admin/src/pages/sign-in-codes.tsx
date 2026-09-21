import { api, type Id } from "@repo/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useMutation } from "convex/react";
import { useState } from "react";
import {
  AccountSearch,
  type AccountSummary,
} from "../components/account-search";
import { appSignInUrl } from "../lib/app-url";
import { serverErrorMessage } from "../lib/server-error";

type Issued = { email: string; code: string; expiresAt: number };

/**
 * Issues a sign-in code for any account, to sign in to the app as it. Nothing
 * is emailed to the account's owner; every code is in the audit trail.
 */
export function SignInCodesPage() {
  const issue = useMutation(api.admin.mutations.issueSignInCodeFor);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, setPending] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issueFor(account: AccountSummary) {
    setPending(account._id);
    setError(null);
    try {
      setIssued(await issue({ userId: account._id }));
    } catch (caught) {
      setError(serverErrorMessage(caught, "Couldn't issue a code. Try again."));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Sign-in codes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to the app as any account. The code isn't emailed to them, and
          issuing it is recorded in the audit trail.
        </p>
      </div>

      <AccountSearch
        label="Find an account"
        testId="sign-in-code-search"
        renderAction={(account) => {
          const blocked = account.deleted
            ? "Deleted"
            : !account.verified
              ? "Never signed in"
              : null;
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={blocked !== null || pending !== null}
              onClick={() => void issueFor(account)}
            >
              {blocked ??
                (pending === account._id ? "Issuing…" : "Issue sign-in code")}
            </Button>
          );
        }}
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {issued && <IssuedCode issued={issued} />}
    </div>
  );
}

function IssuedCode({ issued }: { issued: Issued }) {
  const [copied, setCopied] = useState(false);
  const expires = new Date(issued.expiresAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card data-testid="issued-code">
      <CardHeader>
        <CardTitle>Code for {issued.email}</CardTitle>
        <CardDescription>Works once, until {expires}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <output
            className="rounded-md bg-muted px-4 py-2 font-mono text-3xl tracking-[0.3em]"
            data-testid="issued-code-value"
            aria-label="Sign-in code"
          >
            {issued.code}
          </output>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Open{" "}
            <a
              href={appSignInUrl()}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              the app's sign-in page
            </a>{" "}
            in a private window, so your own app session stays put.
          </li>
          <li>
            Enter <span className="text-foreground">{issued.email}</span> and
            choose{" "}
            <span className="text-foreground">I already have a code</span>.
          </li>
          <li>
            Enter the code. Don't choose “Email me a code”: that sends them a
            new one and this one stops working.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
