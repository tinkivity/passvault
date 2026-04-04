import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  QuestionMarkCircleIcon,
  SunIcon,
  MoonIcon,
  GlobeAltIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ShellHeaderProps {
  breadcrumbs: ReactNode;
  secondsLeft: number;
  onExtend?: () => void;
  onLogout?: () => void;
}

export function ShellHeader({ breadcrumbs, secondsLeft, onExtend, onLogout }: ShellHeaderProps) {
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
        <TooltipProvider>
          {/* 1. Help — disabled / coming soon */}
          <Tooltip>
            <TooltipTrigger
              className="inline-flex items-center justify-center rounded-md h-7 w-7 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled
              aria-label={t('helpComingSoon')}
            >
              <QuestionMarkCircleIcon className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>{t('helpComingSoon')}</TooltipContent>
          </Tooltip>

          {/* 2. Light / Dark mode toggle */}
          <Tooltip>
            <TooltipTrigger
              className="inline-flex items-center justify-center rounded-md h-7 w-7 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={toggleTheme}
              aria-label={isDark ? t('switchToLight') : t('switchToDark')}
            >
              {isDark
                ? <SunIcon className="w-4 h-4" />
                : <MoonIcon className="w-4 h-4" />}
            </TooltipTrigger>
            <TooltipContent>{isDark ? t('switchToLight') : t('switchToDark')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 3. Language selector */}
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

        {/* 4. Logout */}
        {onLogout && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                className="inline-flex items-center justify-center rounded-md h-7 w-7 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={onLogout}
                aria-label={t('logOut')}
              >
                <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent>{t('logOut')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}
