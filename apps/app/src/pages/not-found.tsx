import { buttonVariants } from "@repo/ui";
import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That link doesn't lead anywhere.
      </p>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Go home
      </Link>
    </main>
  );
}
