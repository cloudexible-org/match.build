/**
 * Scheduled jobs.
 *
 * One so far: the nightly match run (prd/phase-3.md §5). It reads every
 * matchmaker's book, scores every pair in it deterministically, and puts new
 * suggestions on the board — no model anywhere, so the same book scored twice
 * gives the same answer twice (`matches/rules.ts`).
 *
 * The cron itself only fans out: `runNightly` schedules one job per book, and
 * each book's pass is its own transaction. A cron whose single transaction
 * covered every tenant would be one read limit away from a night where nobody
 * gets any matches.
 *
 * 03:00 UTC, which is the quiet hour for the timezones this is being built for
 * and late enough that a matchmaker who filled in profiles all evening wakes up
 * to the board having read them.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "nightly match run",
  { hourUTC: 3, minuteUTC: 0 },
  internal.matches.mutations.runNightly,
  {},
);

export default crons;
