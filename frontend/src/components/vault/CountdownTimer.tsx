interface CountdownTimerProps {
  secondsLeft: number;
  label?: string;
}

export function CountdownTimer({ secondsLeft, label = 'Auto-logout in' }: CountdownTimerProps) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isUrgent = secondsLeft <= 30;

  return (
    <span
      className={`text-xs tabular-nums font-mono ${
        isUrgent ? 'text-red-600 font-semibold' : 'text-gray-500'
      }`}
    >
      {label} {formatted}
    </span>
  );
}
