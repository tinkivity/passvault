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
 */
export function useVaultTimeout({ timeoutSeconds, onTimeout, active }: UseVaultTimeoutOptions) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

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
          onTimeoutRef.current();
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
