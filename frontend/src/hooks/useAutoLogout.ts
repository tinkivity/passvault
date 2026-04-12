import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAutoLogoutOptions {
  timeoutSeconds: number;
  onLogout: () => void;
  active: boolean;
}

/**
 * Countdown timer that fires `onLogout` when `timeoutSeconds` elapses.
 * Returns `secondsLeft` for display.
 *
 * Uses a wall-clock deadline (Date.now) instead of decrementing a counter,
 * so the timer catches up immediately when the browser tab regains focus
 * after being throttled in the background.
 */
export function useAutoLogout({ timeoutSeconds, onLogout, active }: UseAutoLogoutOptions) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const deadlineRef = useRef(Date.now() + timeoutSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

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
        onLogoutRef.current();
      } else {
        setSecondsLeft(remaining);
      }
    };

    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, timeoutSeconds]);

  return { secondsLeft, reset, extend: reset };
}
