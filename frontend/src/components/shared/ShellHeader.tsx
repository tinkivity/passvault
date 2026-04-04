import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/useTheme.js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface ShellHeaderProps {
  breadcrumbs: ReactNode;
  secondsLeft: number;
}

export function ShellHeader({ breadcrumbs, secondsLeft }: ShellHeaderProps) {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const secs = secondsLeft % 60;
  const timeDisplay = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
  const timerClass = secondsLeft <= 30
    ? 'text-sm font-mono font-medium text-destructive hidden sm:inline mr-2'
    : secondsLeft <= 60
      ? 'text-sm font-mono font-medium text-amber-500 hidden sm:inline mr-2'
      : 'text-sm font-mono text-foreground/60 hidden sm:inline mr-2';

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex-1 min-w-0">{breadcrumbs}</div>
      <div className="flex items-center gap-1 shrink-0">
        <span className={timerClass}>{timeDisplay}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          title={isDark ? t('switchToLight') : t('switchToDark')}
          aria-label={isDark ? t('switchToLight') : t('switchToDark')}
        >
          {isDark
            ? <SunIcon className="w-4 h-4" />
            : <MoonIcon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
