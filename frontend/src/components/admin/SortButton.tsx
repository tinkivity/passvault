import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface SortButtonProps {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}

export function SortButton({ label, active, direction, onClick }: SortButtonProps) {
  const Icon = active
    ? direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1.5 cursor-pointer select-none font-semibold hover:text-foreground transition-colors"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}
