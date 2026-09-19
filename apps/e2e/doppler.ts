/**
 * Runs the suite's app servers under `doppler run`, so they get the same env
 * as `pnpm dev` (see the root `doppler.yaml`) instead of whatever `.env.local`
 * happens to be on disk.
 *
 * Two deliberate differences from the `dev` scripts:
 *
 *   - `--project` / `--config` are explicit. `doppler.yaml` binds by absolute
 *     path, so a fresh checkout or worktree that has not run `doppler setup`
 *     would otherwise fail — or worse, resolve some other binding.
 *   - Every variable the harness sets itself is passed to `--preserve-env`.
 *     `doppler run` lets Doppler win over the inherited environment by
 *     default, and Doppler's `dev` config holds the *cloud* Convex URL. Without
 *     this the suite would point the apps at your cloud deployment while global
 *     setup seeds (and wipes) the local one — the exact defect §1a of
 *     `docs/e2e-architecture.md` exists to prevent.
 *
 * `E2E_DOPPLER=0` runs the servers bare, for machines without Doppler access.
 * CI sets it: it has no Doppler token and passes placeholder URLs directly.
 * `E2E_DOPPLER_CONFIG` picks a config other than `dev`.
 */

export type DopplerProject = "matchmaker_app" | "matchmaker_www";

export function dopplerEnabled(): boolean {
  return process.env.E2E_DOPPLER !== "0";
}

export function withDoppler(
  project: DopplerProject,
  command: string,
  harnessEnv: Record<string, string>,
): string {
  if (!dopplerEnabled()) return command;

  const config = process.env.E2E_DOPPLER_CONFIG || "dev";
  const preserve = Object.keys(harnessEnv).join(",");
  return `doppler run --project ${project} --config ${config} --preserve-env="${preserve}" -- ${command}`;
}
