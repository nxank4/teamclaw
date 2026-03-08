import { useEffect, useState } from "react";

export interface TimeboxCountdown {
  remainingSeconds: number | null;
  isExpired: boolean;
}

export function useTimeboxCountdown(task: Record<string, unknown>): TimeboxCountdown {
  const status = (task.status as string) ?? "pending";
  const inProgressAt = task.in_progress_at as string | null | undefined;
  const rawTimebox = Number(task.timebox_minutes ?? 25);
  const timeboxMinutes =
    Number.isFinite(rawTimebox) && rawTimebox >= 1 ? rawTimebox : 25;

  const enabled =
    status === "in_progress" && typeof inProgressAt === "string" && inProgressAt.length > 0;

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!enabled) return null;
    const startedMs = Date.parse(inProgressAt as string);
    if (!Number.isFinite(startedMs)) return null;
    const totalMs = timeboxMinutes * 60_000;
    const elapsedMs = Date.now() - startedMs;
    return Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
  });

  useEffect(() => {
    if (!enabled) {
      setRemainingSeconds(null);
      return;
    }

    const computeRemaining = (): number | null => {
      const startedMs = Date.parse(inProgressAt as string);
      if (!Number.isFinite(startedMs)) return null;
      const totalMs = timeboxMinutes * 60_000;
      const elapsedMs = Date.now() - startedMs;
      return Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
    };

    setRemainingSeconds(computeRemaining());
    const id = setInterval(() => setRemainingSeconds(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, [enabled, inProgressAt, timeboxMinutes]);

  return {
    remainingSeconds,
    isExpired: enabled && remainingSeconds !== null && remainingSeconds <= 0,
  };
}

