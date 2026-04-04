import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SunIcon, MoonIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/useTheme.js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ShellHeaderProps {
  breadcrumbs: ReactNode;
  secondsLeft: number;
  onExtend?: () => void;
}

export function ShellHeader({ breadcrumbs, secondsLeft, onExtend }: ShellHeaderProps) {
  const { isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const LANGUAGES = [
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' },
    { code: 'fr', label: 'FR' },
    { code: 'ru', label: 'RU' },
  ] as const;

  const handleLanguageChange = (lang: string) => {
    void i18n.changeLanguage(lang);
    localStorage.setItem('pv_language', lang);
  };

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const secs = secondsLeft % 60;
  const timeDisplay = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}:${String(secs).padStart(2, '0')}`;

  const isUrgent = secondsLeft <= 60;
  const timerClass = secondsLeft <= 30
    ? 'text-sm font-mono font-medium text-destructive hidden sm:inline'
    : isUrgent
      ? 'text-sm font-mono font-medium text-amber-500 hidden sm:inline'
      : 'text-sm font-mono text-foreground/60 hidden sm:inline';

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex-1 min-w-0">{breadcrumbs}</div>
      <div className="flex items-center gap-1 shrink-0">
        <span className={timerClass}>{timeDisplay}</span>
        {isUrgent && onExtend && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onExtend}
            className="text-xs h-7 px-2 text-destructive hover:text-destructive"
          >
            {t('extend')}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-7 w-7"
            title={t('language')}
            aria-label={t('language')}
          >
            <GlobeAltIcon className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGES.map(({ code, label }) => (
              <DropdownMenuItem
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={i18n.language?.startsWith(code) ? 'font-semibold' : undefined}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
