import { ACCOUNT_SEARCH_MIN_LENGTH, api, type Id } from "@repo/api";
import { Field, FieldDescription, FieldLabel, Input } from "@repo/ui";
import { useQuery } from "convex/react";
import { type ReactNode, useDeferredValue, useState } from "react";

export type AccountSummary = {
  _id: Id<"users">;
  email?: string;
  name?: string;
  verified: boolean;
  deleted: boolean;
};

/**
 * Finds accounts by the start of their email. `renderAction` draws the
 * control at the end of each result row (pick it as a filter, issue a code).
 */
export function AccountSearch({
  label,
  renderAction,
  testId,
}: {
  label: string;
  renderAction: (account: AccountSummary) => ReactNode;
  testId: string;
}) {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const ready = deferred.length >= ACCOUNT_SEARCH_MIN_LENGTH;
  const results = useQuery(
    api.admin.queries.searchAccounts,
    ready ? { search: deferred } : "skip",
  );

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <Input
          type="search"
          inputMode="email"
          autoComplete="off"
          placeholder="Start of an email address"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <FieldDescription>
          Matches the start of the address, e.g. “jane” or “jane@exa”.
        </FieldDescription>
      </Field>
      {ready && results !== undefined && (
        <ul
          className="divide-y divide-border rounded-md border border-border bg-card"
          aria-label="Matching accounts"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No account's email starts with “{deferred}”.
            </li>
          ) : (
            results.map((account) => (
              <li
                key={account._id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                data-testid="account-result"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {account.email ?? "(no email)"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      account.name ?? "No name yet",
                      account.deleted && "deleted",
                      !account.verified && "never signed in",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {renderAction(account)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
