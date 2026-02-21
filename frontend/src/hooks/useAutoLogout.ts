import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAutoLogoutOptions {
  timeoutSeconds: number;
  onLogout: () => void;
  active: boolean;
}

/**
 * Countdown timer that fires `onLogout` when `timeoutSeconds` elapses.
 * Returns `secondsLeft` for display.
 */
export function useAutoLogout({ timeoutSeconds, onLogout, active }: UseAutoLogoutOptions) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const reset = useCallback(() => {
    setSecondsLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSecondsLeft(timeoutSeconds);
      return;
    }

    setSecondsLeft(timeoutSeconds);
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onLogoutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, timeoutSeconds]);

  return { secondsLeft, reset };
}
