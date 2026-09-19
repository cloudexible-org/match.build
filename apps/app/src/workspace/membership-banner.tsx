import { api, candidateEmailError, type Id } from "@repo/api";
import { Button, Input } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { serverErrorMessage } from "../lib/server-error";
import { inviteUrl, type Membership } from "./candidate-labels";
import { useWorkspace } from "./workspace-layout";

type Invite = {
  expiresAt: number;
  lastSentAt?: number;
  copyable: boolean;
} | null;

const day = (time: number) => new Date(time).toLocaleDateString();

/**
 * The strip above a conversation that says where the candidate stands and
 * what the matchmaker can do about it (prd/phase-1.md §3.2, §4.1):
 *
 * - invited, invite open: the link with Copy, Resend, Change email, Revoke;
 * - invited, invite revoked or expired: Re-invite;
 * - declined, left, account deleted: when, and Re-invite.
 *
 * Nothing for a joined candidate.
 */
export function MembershipBanner({
  candidateId,
  name,
  email,
  membership,
  membershipChangedAt,
  invite,
}: {
  candidateId: Id<"candidates">;
  name: string;
  email: string;
  membership: Membership;
  membershipChangedAt: number;
  invite: Invite;
}) {
  if (membership === "joined") return null;
  if (membership === "invited" && invite !== null) {
    return (
      <OpenInvite candidateId={candidateId} email={email} invite={invite} />
    );
  }
  const status = {
    invited: "The invitation is no longer open. It was revoked or expired.",
    declined: `${name} declined your invitation on ${day(membershipChangedAt)}. Re-inviting emails ${email} a new link.`,
    left: `${name} left on ${day(membershipChangedAt)}.`,
    account_deleted: `${name} deleted their account on ${day(membershipChangedAt)}.`,
  }[membership];
  return (
    <Banner>
      <p className="text-sm">{status}</p>
      <ReinviteButton candidateId={candidateId} />
    </Banner>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b border-border bg-accent/40 px-4 py-3"
      data-testid="membership-banner"
    >
      {children}
    </div>
  );
}

/** Runs one mutation at a time, keeping its error for display. */
function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      return true;
    } catch (caught) {
      setError(serverErrorMessage(caught, "Something went wrong. Try again."));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, run };
}

function ReinviteButton({ candidateId }: { candidateId: Id<"candidates"> }) {
  const workspace = useWorkspace();
  const reinvite = useMutation(api.invites.mutations.reinvite);
  const { busy, error, run } = useRunner();
  return (
    <>
      <div>
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            void run("reinvite", () =>
              reinvite({ matchmakerId: workspace.matchmakerId, candidateId }),
            )
          }
        >
          {busy ? "Inviting…" : "Re-invite"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

function OpenInvite({
  candidateId,
  email,
  invite,
}: {
  candidateId: Id<"candidates">;
  email: string;
  invite: NonNullable<Invite>;
}) {
  const workspace = useWorkspace();
  const args = { matchmakerId: workspace.matchmakerId, candidateId };
  const token = useQuery(
    api.invites.queries.token,
    invite.copyable ? args : "skip",
  );
  const resend = useMutation(api.invites.mutations.resend);
  const revoke = useMutation(api.invites.mutations.revoke);
  const { busy, error, run } = useRunner();
  const [mode, setMode] = useState<"idle" | "changeEmail" | "confirmRevoke">(
    "idle",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const link =
    typeof token === "string"
      ? inviteUrl(token, window.location.origin, import.meta.env.BASE_URL)
      : null;

  async function copy() {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure origin): the link is still
      // selectable in the field.
    }
  }

  return (
    <Banner>
      <p className="text-sm">
        <span className="font-medium">Invited · not joined yet.</span> The
        invitation to {email} expires on {day(invite.expiresAt)}.
        {invite.lastSentAt !== undefined &&
          ` Last emailed ${day(invite.lastSentAt)}.`}
      </p>
      {invite.copyable ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            aria-label="Invite link"
            value={link ?? ""}
            onFocus={(event) => event.target.select()}
            data-testid="invite-link"
          />
          <Button
            type="button"
            variant="outline"
            disabled={link === null}
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy invite link"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This invitation's link can't be copied. Revoke it and re-invite to get
          one.
        </p>
      )}

      {mode === "changeEmail" ? (
        <ChangeEmailForm
          candidateId={candidateId}
          onDone={(message) => {
            setMode("idle");
            setNotice(message);
          }}
          onCancel={() => setMode("idle")}
        />
      ) : mode === "confirmRevoke" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Revoke the invitation? Its link stops working at once.</span>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void run("revoke", () => revoke(args)).then(() => setMode("idle"))
            }
          >
            Revoke
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Keep it
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              void run("resend", () => resend(args)).then((ok) => {
                if (ok) setNotice(`Invitation emailed to ${email} again.`);
              })
            }
          >
            {busy === "resend" ? "Sending…" : "Resend"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNotice(null);
              setMode("changeEmail");
            }}
          >
            Change email
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNotice(null);
              setMode("confirmRevoke");
            }}
          >
            Revoke
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {notice}
        </p>
      )}
    </Banner>
  );
}

function ChangeEmailForm({
  candidateId,
  onDone,
  onCancel,
}: {
  candidateId: Id<"candidates">;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const workspace = useWorkspace();
  const changeEmail = useMutation(api.invites.mutations.changeEmail);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<Id<"candidates"> | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = candidateEmailError(email);
    setDuplicateOf(null);
    setError(invalid);
    if (invalid) return;
    setSaving(true);
    try {
      const result = await changeEmail({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        email,
      });
      if (result.kind === "duplicate") {
        setDuplicateOf(result.candidateId);
      } else {
        onDone(`Invitation sent to ${email.trim().toLowerCase()}.`);
      }
    } catch (caught) {
      setError(serverErrorMessage(caught, "Something went wrong. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-2"
      data-testid="change-email-form"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          aria-label="New email"
          placeholder="New email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoFocus
        />
        <Button type="submit" size="sm" className="h-10" disabled={saving}>
          {saving ? "Sending…" : "Send new invitation"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The old link stops working.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {duplicateOf !== null && (
        <p role="alert" className="text-sm text-destructive">
          You already have a candidate with this email.{" "}
          <Link
            to={`/mm/${workspace.username}/c/${duplicateOf}`}
            className="font-medium underline underline-offset-4"
          >
            Open their conversation
          </Link>
        </p>
      )}
    </form>
  );
}
