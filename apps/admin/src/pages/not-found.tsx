import { buttonVariants } from "@repo/ui";
import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="font-display text-3xl">Page not found</h1>
      <Link to="/audit" className={buttonVariants({ variant: "outline" })}>
        Go to the audit trail
      </Link>
    </div>
  );
}
