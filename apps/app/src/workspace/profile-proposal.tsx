/**
 * How an agent's proposal reads, wherever it is answered.
 *
 * A proposal now has two homes — the Profile section of the candidate panel
 * and the stack above the composer (`chat/suggestion-stack.tsx`) — and
 * "no → yes" has to mean the same thing in both. The surrounding card, its
 * label and its buttons belong to each surface; what is being proposed does
 * not.
 */

/** The `pending` half of a `profileEntry` (`convex/schema.ts`). */
export type Proposal = {
  action: "set" | "clear";
  value: string;
  suggestedAt: number;
  model: string;
  confidence?: number;
  sourceQuote?: string;
};

export function ProposedChange({
  proposal,
  /** What is recorded now, already rendered. Empty when nothing is. */
  current,
  /** The proposed value, already rendered. */
  proposed,
}: {
  proposal: Proposal;
  current: string;
  proposed: string;
}) {
  if (proposal.action === "clear") {
    return (
      <p className="break-words text-sm">
        Remove this — <s className="text-muted-foreground">{current}</s>
      </p>
    );
  }
  if (current) {
    return (
      <p className="break-words text-sm">
        <s className="text-muted-foreground">{current}</s> → {proposed}
      </p>
    );
  }
  return <p className="whitespace-pre-wrap break-words text-sm">{proposed}</p>;
}

/**
 * The candidate's own words behind a proposal, verbatim, so a matchmaker can
 * check it rather than take it on trust.
 */
export function ProposalQuote({ quote }: { quote: string | undefined }) {
  if (quote === undefined || quote === "") return null;
  return (
    <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
      “{quote}”
    </p>
  );
}
