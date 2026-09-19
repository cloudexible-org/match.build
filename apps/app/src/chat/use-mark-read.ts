import { useEffect } from "react";

/**
 * Tells the server what has been seen, the way prd/phase-1.md §8.1 defines
 * "seen": the conversation is open **and** the tab is visible. Re-runs when
 * the newest message changes, and when the tab comes back to the foreground,
 * so a thread left open in a background tab doesn't count as read.
 *
 * Step 8's notifications are driven by the same markers.
 */
export function useMarkRead(
  latestSeq: number | undefined,
  markRead: (seq: number) => Promise<unknown>,
): void {
  useEffect(() => {
    if (latestSeq === undefined || latestSeq <= 0) return;
    let cancelled = false;
    const report = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      // A failed mark-read is not worth interrupting anyone: the next
      // message, or the next visit, sends it again.
      void markRead(latestSeq).catch(() => {});
    };
    report();
    document.addEventListener("visibilitychange", report);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", report);
    };
  }, [latestSeq, markRead]);
}
