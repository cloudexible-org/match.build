import type { ReactNode } from "react";

/**
 * The shape every section of the candidate panel reads in: a group heading,
 * then one line per thing known — label left, value in a second column you
 * can scan straight down, and the whole row is the way to change it where
 * there is a way (prd/phase-1.md §4.1, prd/phase-2.md §5).
 *
 * **Why this is shared rather than written twice.** Details and Profile are
 * the same kind of surface — a record a matchmaker reads far more often than
 * they edit — and the thing that made the column unreadable was each of them
 * spending three lines and a row of buttons on every fact. One set of rows
 * means the next person to add a section inherits the answer instead of
 * inventing a third one.
 *
 * The narrow column is the whole constraint: a permanent pair of buttons per
 * row does not fit, so editing is a row you click and a pencil that fades in
 * under the pointer.
 */

export function RecordGroup({
  title,
  children,
}: {
  /** Omitted where the section's own header already names the group. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      {title && <RecordHeading>{title}</RecordHeading>}
      {/* `-mx-2` so a row's hover background bleeds into the panel's own
          padding and reads as a full-width row, the way a list row should. */}
      <ul className="-mx-2 flex flex-col">{children}</ul>
    </section>
  );
}

export function RecordRow({
  label,
  value,
  onEdit,
  title,
  srOnly,
  footer,
  testId,
  field,
}: {
  label: string;
  value: ReactNode;
  /**
   * Makes the whole row the edit control. Left off for something the
   * matchmaker cannot change here — an email, a membership — which then reads
   * as a plain line with no affordance promising otherwise.
   */
  onEdit?: () => void;
  /** Hover text for the row, e.g. where a value came from. */
  title?: string;
  /** A line only a screen reader gets, e.g. that same provenance. */
  srOnly?: string;
  /** Anything under the row, e.g. the quote behind an agent's value. */
  footer?: ReactNode;
  testId?: string;
  /** `data-field`, so a spec can address one row by key. */
  field?: string;
}) {
  // `relative`: `sr-only` is `position: absolute`, and an absolute box whose
  // ancestors are all unpositioned is *not* clipped by their `overflow` — one
  // left loose sits at its static offset in the document and gives the window
  // a thousand pixels to scroll (`specs/app-convex/layout.spec.ts`).
  return (
    <li className="relative" data-testid={testId} data-field={field}>
      {onEdit ? (
        <button
          type="button"
          title={title}
          className="group/row flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onEdit}
        >
          <RecordLabel>{label}</RecordLabel>
          <RecordValue>{value}</RecordValue>
          <PencilIcon className="size-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
          {/* The button's name is its content — label, value, then this — so
              a screen reader hears the fact before it hears what the button
              does. An `aria-label` would replace all of it with "Edit …". */}
          <span className="sr-only">Edit</span>
        </button>
      ) : (
        <div
          title={title}
          className="flex items-baseline gap-3 px-2 py-1.5 text-left"
        >
          <RecordLabel>{label}</RecordLabel>
          <RecordValue>{value}</RecordValue>
        </div>
      )}
      {srOnly && <span className="sr-only">{srOnly}</span>}
      {footer}
    </li>
  );
}

/** A row turned over to a form: the same indent, none of the row chrome. */
export function RecordEditRow({
  children,
  testId,
  field,
}: {
  children: ReactNode;
  testId?: string;
  field?: string;
}) {
  return (
    <li className="relative px-2 py-2" data-testid={testId} data-field={field}>
      {children}
    </li>
  );
}

/** A group's name. Exported for History, which groups an `<ol>` by day. */
export function RecordHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h4>
  );
}

function RecordLabel({ children }: { children: ReactNode }) {
  return (
    <span className="w-32 shrink-0 text-sm text-muted-foreground">
      {children}
    </span>
  );
}

function RecordValue({ children }: { children: ReactNode }) {
  return <span className="min-w-0 flex-1 break-words text-sm">{children}</span>;
}

export function PencilIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M11.3 2.7a1.7 1.7 0 0 1 2.4 2.4L5.6 13.2 2 14l.8-3.6 8.5-7.7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2.5 4h11M6 4V2.5h4V4m-6 0 .6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The one piece of provenance worth a pixel in read mode. Whose record it is
 * is the default; that a model touched a value is the exception, and the
 * exception is what a mark is for.
 */
export function AssistantMark() {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block align-baseline text-xs text-primary"
    >
      ✦
    </span>
  );
}
