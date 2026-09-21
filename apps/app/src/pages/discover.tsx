import { api } from "@repo/api";
import { buttonVariants } from "@repo/ui";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";

/**
 * Discover, at `/c/mm/discover`: where a candidate will one day find another
 * matchmaker to join.
 *
 * **Nothing in the UI links here in v1, deliberately.** The only way into a
 * matchmaker's book is an invitation from that matchmaker
 * (prd/phase-1.md §3.2); the directory and the applications behind it are
 * phase 3 (prd/phase-3.md §3), and `candidates` has no `applied` membership
 * yet. The route is kept as the shell that work lands in, and says so to
 * anyone who reaches it by hand.
 */
export function DiscoverPage() {
  const me = useQuery(api.users.queries.me);

  if (me === undefined) return <FullPageStatus>Loading…</FullPageStatus>;
  if (me === null) return null; // RequireAuth handles this

  return (
    <div className="min-h-dvh">
      <AppHeader name={me.name ?? ""} />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        <h1 className="font-display text-3xl">Find a matchmaker</h1>
        <div
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
          data-testid="discover-empty"
        >
          <p className="font-medium">The directory isn't open yet.</p>
          <p className="text-sm text-muted-foreground">
            A matchmaker brings you in: ask yours for an invite link, and it
            will appear on your matchmakers as an invitation to accept.
          </p>
          <div>
            <Link
              to="/c"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to your matchmakers
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
