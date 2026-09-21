import { api } from "@repo/api";
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { FullPageStatus } from "../components/full-page-status";
import { Page, PageHeader } from "../shell/page";

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
    <Page accountName={me.name ?? ""}>
      <PageHeader
        title="Find a matchmaker"
        description="Where browsing matchmakers will live."
      />
      <Card data-testid="discover-empty">
        <CardHeader>
          <CardTitle>The directory isn't open yet.</CardTitle>
          <CardDescription>
            A matchmaker brings you in: ask yours for an invite link, and it
            will appear on your matchmakers as an invitation to accept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/c"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to your matchmakers
          </Link>
        </CardContent>
      </Card>
    </Page>
  );
}
