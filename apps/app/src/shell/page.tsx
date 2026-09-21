import { cn } from "@repo/ui";
import type { ReactNode } from "react";
import { AppHeader } from "../components/app-header";

/**
 * The width every page that isn't a chat is read at: full width on a phone,
 * this column on anything wider.
 *
 * There are two page shapes in the app and only two — a chat shell, whose
 * columns take the whole viewport, and this. The header spans the viewport
 * on both; it is the app's frame rather than part of the page.
 */
export const PAGE_WIDTH = "max-w-3xl";

/**
 * A page that isn't a chat.
 *
 * `accountName` renders the header too, for a page that owns it. Pages
 * inside a layout that already has one — the workspace's settings and
 * onboard — leave it out.
 *
 * Deliberately offers no width knob: four different widths is what having
 * one of these was avoiding.
 */
export function Page({
  accountName,
  children,
  className,
}: {
  accountName?: string;
  children: ReactNode;
  /** For a page that needs different padding, never a different width. */
  className?: string;
}) {
  const main = (
    <main
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-8",
        PAGE_WIDTH,
        className,
      )}
    >
      {children}
    </main>
  );
  if (accountName === undefined) return main;
  return (
    <div className="min-h-dvh">
      <AppHeader name={accountName} />
      {main}
    </div>
  );
}

/**
 * What a page says it is, at the top of it: its `h1`, and the sentence
 * under it where one helps. `action` is the one thing the page is for, if
 * it has one.
 *
 * A page title is a page title whether the page is a form or a list, which
 * is what onboard and profile settings had drifted apart on.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-3xl">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** A labelled block within a page: "Invitations", "History", "Notes". */
export function PageSection({
  title,
  testId,
  action,
  children,
}: {
  title: string;
  testId: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${testId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-sm font-medium uppercase tracking-wide text-muted-foreground"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Rows in a bordered card: a section's list, however it's ordered. */
export function CardList({
  ordered = false,
  children,
}: {
  /** An `ol` where the order carries meaning, such as a history. */
  ordered?: boolean;
  children: ReactNode;
}) {
  const className =
    "flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card";
  return ordered ? (
    <ol className={className}>{children}</ol>
  ) : (
    <ul className={className}>{children}</ul>
  );
}
