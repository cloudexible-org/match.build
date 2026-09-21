import { api } from "@repo/api";
import { buttonVariants } from "@repo/ui";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { AppHeader } from "../components/app-header";
import { FullPageStatus } from "../components/full-page-status";

/**
 * Discover, at `/c/mm/discover`: where a candidate finds another matchmaker
 * to join.
 *
 * The directory and the applications behind it are phase 3
 * (prd/phase-3.md §3) — matchmakers have nothing to be listed by yet, and
 * `candidates` has no `applied` membership. Until then this says so plainly
 * rather than leaving "Join another matchmaker" pointing at nothing.
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
            Browsing matchmakers and applying to join is coming. For now, a
            matchmaker brings you in: ask yours for an invite link and it will
            appear here as an invitation.
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
