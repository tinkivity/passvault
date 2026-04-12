import { useEffect, useRef, useState, useCallback } from 'react';

interface UseVaultTimeoutOptions {
  timeoutSeconds: number;
  onTimeout: () => void;
  active: boolean;
}

/**
 * Per-vault countdown timer that fires `onTimeout` when the timeout elapses.
 * Separate from the session timeout — this controls how long a vault stays
 * unlocked (i.e., its derived encryption key is retained).
 *
 * Uses a wall-clock deadline (Date.now) instead of decrementing a counter,
 * so the timer catches up immediately when the browser tab regains focus
 * after being throttled in the background.
 */
export function useVaultTimeout({ timeoutSeconds, onTimeout, active }: UseVaultTimeoutOptions) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const deadlineRef = useRef(Date.now() + timeoutSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    deadlineRef.current = Date.now() + timeoutSeconds * 1000;
    setSecondsLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSecondsLeft(timeoutSeconds);
      return;
    }

    deadlineRef.current = Date.now() + timeoutSeconds * 1000;
    setSecondsLeft(timeoutSeconds);

    const tick = () => {
      const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        setSecondsLeft(0);
        onTimeoutRef.current();
      } else {
        setSecondsLeft(remaining);
      }
    };

    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, timeoutSeconds]);

  return { secondsLeft, reset };
}
