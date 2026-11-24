import { useEffect, useState } from "react";

/**
 * Milliseconds since `startedAt` (e.g. a mutation's `submittedAt`), ticking
 * once a second while `active`. Drives the "…Ns" on long single-request waits
 * (sync, sync annotations, cut release) whose stage lines are otherwise static.
 */
export function useElapsedMs(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return active ? Math.max(0, now - startedAt) : 0;
}
