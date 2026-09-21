import { MESSAGE_LIMITS, messageBodyError } from "@repo/api";
import { Button, Textarea } from "@repo/ui";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { serverErrorMessage } from "../lib/server-error";

/**
 * The message composer, used by both sides of a conversation.
 *
 * Enter sends, Shift+Enter starts a line — what a chat is expected to do on a
 * keyboard, while the Send button stays the way in on a phone. The text is
 * kept if sending fails, so nothing typed is ever lost.
 *
 * `draft` is how **Edit** on a suggestion card works (prd/phase-2.md §2): the
 * drafted text is dropped in here for the matchmaker to change before they
 * send it. It never overwrites something they are part-way through typing.
 */
export function Composer({
  onSend,
  placeholder,
  disabledReason,
  draft,
}: {
  onSend: (body: string) => Promise<unknown>;
  placeholder: string;
  /** When set, the composer is closed and this says why. */
  disabledReason?: string;
  /**
   * A drafted reply to edit. `token` changes every time Edit is pressed, so
   * pressing it twice on the same card fills the box again.
   */
  draft?: { token: number; body: string } | null;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const filled = useRef(0);

  // Only when a *new* Edit arrives, and never over their own half-written
  // message: losing what someone typed to make room for a machine's draft is
  // the one thing this must not do.
  const token = draft?.token ?? 0;
  useEffect(() => {
    if (token === 0 || token === filled.current) return;
    filled.current = token;
    setBody((current) =>
      current.trim() === "" ? (draft?.body ?? "") : current,
    );
    box.current?.focus();
  }, [token, draft?.body]);

  if (disabledReason !== undefined) {
    return (
      <footer
        className="shrink-0 border-t border-border px-4 py-3 text-sm text-muted-foreground"
        data-testid="composer-closed"
      >
        {disabledReason}
      </footer>
    );
  }

  async function send() {
    const invalid = messageBodyError(body);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSend(body);
      setBody("");
    } catch (caught) {
      setError(serverErrorMessage(caught, "That didn't send. Try again."));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <footer className="shrink-0 border-t border-border p-3">
      <form
        className="flex items-end gap-2"
        data-testid="composer"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          ref={box}
          aria-label="Message"
          placeholder={placeholder}
          rows={1}
          maxLength={MESSAGE_LIMITS.body}
          className="max-h-40 min-h-10 resize-y py-2"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </form>
      {error && (
        <p
          role="alert"
          className="px-1 pt-2 text-sm text-destructive"
          data-testid="composer-error"
        >
          {error}
        </p>
      )}
    </footer>
  );
}
