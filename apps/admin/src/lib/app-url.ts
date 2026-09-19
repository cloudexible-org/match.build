/**
 * The product app's sign-in page. Production serves apps/app at /app/ on this
 * app's own origin (packages/api/convex/http.ts), and so does `pnpm dev`.
 */
export function appSignInUrl(origin: string = window.location.origin): string {
  return new URL("/app/sign-in", origin).toString();
}
