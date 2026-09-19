/**
 * Readable sentences for a matchmaker profile's own audit events, shown on
 * its settings page (prd/phase-1.md §5.1). `before` / `after` arrive
 * JSON-encoded, as stored.
 */

export type ProfileChange = {
  field: string;
  before?: string;
  after?: string;
};

const FIELD_LABELS: Record<string, string> = {
  username: "username",
  displayName: "display name",
  businessName: "business name",
};

export function describeProfileEvent(
  action: string,
  changes: ProfileChange[],
): string[] {
  if (action === "matchmaker.created") return ["Created the profile"];
  if (action !== "matchmaker.updated") return [action];
  if (changes.length === 0) return ["Updated the profile"];
  return changes.map(describeChange);
}

function describeChange(change: ProfileChange): string {
  const label = FIELD_LABELS[change.field] ?? change.field;
  const before = decode(change.before);
  const after = decode(change.after);
  if (before === undefined && after !== undefined) {
    return `Set ${label} to “${after}”`;
  }
  if (before !== undefined && after === undefined) {
    return `Removed ${label} “${before}”`;
  }
  return `Changed ${label} from “${before ?? ""}” to “${after ?? ""}”`;
}

function decode(encoded: string | undefined): string | undefined {
  if (encoded === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(encoded);
    return typeof value === "string" ? value : encoded;
  } catch {
    return encoded;
  }
}
