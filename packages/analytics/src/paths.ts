/**
 * URL scrubbing for captured events.
 *
 * Every event PostHog sends carries the current URL, and an app's routes
 * routinely put something private in the path. Masking a concrete path back to
 * the route pattern that produced it keeps the funnel answerable — "how many
 * people reached the invite page" still works — while what leaves the browser
 * identifies nobody.
 *
 * The engine is generic on purpose: the route lists belong to the app that
 * declares those routes, not to this package. See
 * `apps/app/src/analytics/routes.ts` for the ones in use.
 */

export interface RouteMask {
  /** Path the app is mounted under, e.g. Vite's `base`. Defaults to root. */
  basePath?: string;
  /**
   * Paths that are routes in their own right. Matched first, so a literal
   * keeps its identity instead of collapsing into a pattern that would also
   * accept it (`/mm/new` is a funnel step, not one more workspace).
   */
  literals?: readonly string[];
  /**
   * Route patterns whose concrete paths carry something personal. A `:name`
   * segment matches any non-empty segment; every other segment matches
   * exactly. A path matching none of them is left alone.
   */
  patterns?: readonly string[];
}

/** Strips a trailing slash and normalises the root to the empty string. */
function normaliseBase(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, "");
  return trimmed === "/" ? "" : trimmed;
}

function matchPattern(
  segments: readonly string[],
  patterns: readonly (readonly string[])[],
): string | null {
  for (const pattern of patterns) {
    if (pattern.length !== segments.length) continue;
    const matches = pattern.every((segment, index) =>
      segment.startsWith(":")
        ? segments[index] !== ""
        : segment === segments[index],
    );
    if (matches) return pattern.join("/");
  }
  return null;
}

/**
 * Builds the path masker for one app's routes. Returns the path unchanged
 * when it is a known literal or matches no pattern at all — an unrecognised
 * path is usually a 404, which is worth seeing as it was typed.
 */
export function createPathMask(
  routes: RouteMask,
): (pathname: string) => string {
  const base = normaliseBase(routes.basePath ?? "/");
  const literals = new Set(routes.literals ?? []);
  const patterns = (routes.patterns ?? []).map((pattern) => pattern.split("/"));

  return (pathname: string): string => {
    // Only strip the base at a segment boundary: "/app" must not swallow the
    // leading characters of "/application".
    const remainder =
      base !== "" && pathname.startsWith(base)
        ? pathname.slice(base.length)
        : null;
    const withinBase = remainder === "" || remainder?.startsWith("/") === true;
    const path = withinBase ? remainder || "/" : pathname;
    const prefix = withinBase ? base : "";

    if (literals.has(path)) return pathname;
    const masked = matchPattern(path.split("/"), patterns);
    return masked === null ? pathname : `${prefix}${masked}`;
  };
}

/**
 * Masks a URL property: its path, and any query parameter whose value is
 * itself a path. That second half is not hypothetical — a signed-out visitor
 * following an invite link lands on `/sign-in?next=/invite/<token>`, so the
 * token would otherwise ride along in the query string of the sign-in
 * pageview.
 */
export function maskUrl(
  value: string,
  maskPath: (pathname: string) => string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Not an absolute URL: a bare path (`$pathname`) still gets masked,
    // anything else (`$direct`) is left alone.
    return value.startsWith("/") ? maskPath(value) : value;
  }
  parsed.pathname = maskPath(parsed.pathname);
  for (const [key, parameter] of [...parsed.searchParams]) {
    if (parameter.startsWith("/")) {
      parsed.searchParams.set(key, maskPath(parameter));
    }
  }
  return parsed.toString();
}

/**
 * Which property names hold a URL. Matched by shape rather than by an explicit
 * list, so the properties PostHog adds in a later release (`$session_entry_*`
 * joined `$initial_*` this way) are covered the day they appear.
 */
const URL_PROPERTY = /(^|_)(url|pathname|referrer)$/;

function isUrlProperty(key: string): boolean {
  return URL_PROPERTY.test(key.startsWith("$") ? key.slice(1) : key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** How far to recurse. `$set` and `$set_once` sit one level down. */
const MAX_DEPTH = 3;

/** Rewrites every URL-shaped property, at the top level and inside `$set`. */
export function sanitizeProperties(
  properties: Record<string, unknown>,
  maskPath: (pathname: string) => string,
  depth = 0,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && isUrlProperty(key)) {
      sanitized[key] = maskUrl(value, maskPath);
    } else if (depth < MAX_DEPTH && isPlainObject(value)) {
      sanitized[key] = sanitizeProperties(value, maskPath, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
