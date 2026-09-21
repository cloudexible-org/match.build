import { api, erasureConfirmationError } from "@repo/api";
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
import {
  AccountSearch,
  type AccountSummary,
} from "../components/account-search";
import { serverErrorMessage } from "../lib/server-error";

type Done = { candidates: number; auditEventsRedacted: number };

/**
 * Erasure requests (prd/phase-1.md §12), the admin-only process that resolves
 * the right to erasure against "nothing is deleted" (§6).
 *
 * It erases the person, not the record: every matchmaker keeps the
 * conversation, their notes and the history of what they did, attached to a
 * candidate nobody can be identified from. Irreversible, so it takes the
 * account's own address typed back before it will run.
 */
export function ErasurePage() {
  const [chosen, setChosen] = useState<AccountSummary | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Erasure requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Erases a person at their request: their name, address and handles,
          everywhere they appear — including inside the audit trail. Every
          matchmaker keeps the conversation, their notes and their history of
          working with them, attached to an anonymous record.
        </p>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-xl">Before you run this</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">It can't be undone.</span> There
              is nothing left afterwards to work out who the person was.
            </li>
            <li>
              The account is closed with it: an erased person can't sign in, and
              signing up again with the same address starts a fresh account.
            </li>
            <li>
              <span className="text-foreground">
                Message and note text is left alone.
              </span>{" "}
              If a request reaches into what was written, that's the
              matchmaker's call as data controller — handle it with them.
            </li>
            <li>
              An account that owns a matchmaker profile can't be erased here.
            </li>
          </ul>
        </CardContent>
      </Card>

      {done === null ? (
        <>
          <AccountSearch
            label="Find the account"
            testId="erasure-search"
            renderAction={(account) => (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={chosen?._id === account._id}
                onClick={() => setChosen(account)}
              >
                {chosen?._id === account._id ? "Selected" : "Erase…"}
              </Button>
            )}
          />
          {chosen !== null && (
            <Confirm
              account={chosen}
              onCancel={() => setChosen(null)}
              onDone={(result) => {
                setChosen(null);
                setDone(result);
              }}
            />
          )}
        </>
      ) : (
        <Card data-testid="erasure-done">
          <CardHeader>
            <CardTitle>Erased</CardTitle>
            <CardDescription>
              {done.candidates === 1
                ? "1 matchmaker's record was anonymised"
                : `${done.candidates} matchmakers' records were anonymised`}
              , and {done.auditEventsRedacted} audit{" "}
              {done.auditEventsRedacted === 1 ? "entry" : "entries"} had their
              personal values redacted. The erasure is itself in the trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => setDone(null)}>
              Handle another request
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Confirm({
  account,
  onCancel,
  onDone,
}: {
  account: AccountSummary;
  onCancel: () => void;
  onDone: (result: Done) => void;
}) {
  const erase = useMutation(api.admin.mutations.eraseAccount);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Checked here for a quick answer, and again on the server, which is what
    // actually decides.
    const mistyped = erasureConfirmationError(typed, account.email);
    setError(mistyped);
    if (mistyped !== null) return;
    setBusy(true);
    try {
      onDone(await erase({ userId: account._id, confirmEmail: typed.trim() }));
    } catch (caught) {
      setError(serverErrorMessage(caught, "Couldn't erase. Try again."));
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive" data-testid="erasure-confirm">
      <CardHeader>
        <CardTitle className="text-xl">
          Erase {account.email ?? "this account"}?
        </CardTitle>
        <CardDescription>
          Type the address back to confirm. This can't be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Field invalid={error !== null}>
            <FieldLabel>Account email</FieldLabel>
            <Input
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              data-testid="erasure-confirm-email"
            />
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              <FieldDescription>{account.email}</FieldDescription>
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              data-testid="erasure-confirm-submit"
            >
              {busy ? "Erasing…" : "Erase permanently"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
