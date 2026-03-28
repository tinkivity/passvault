import React from 'react';
import { Loader2, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button as UIButton } from '@/components/ui/button';
import { Input as UIInput } from '@/components/ui/input';
import { EnvironmentBanner } from './EnvironmentBanner.js';
import { useTheme } from '../../hooks/useTheme.js';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="min-h-screen flex flex-col bg-muted text-foreground">
      <EnvironmentBanner />
      <div className="absolute top-2 right-2 z-10">
        <UIButton
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </UIButton>
      </div>
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={cn('bg-card rounded-xl border border-border p-6 w-full max-w-md', className)}>
      {children}
    </div>
  );
}

interface ErrorMessageProps {
  message: string | null;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
      {message}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const variantMap = {
    primary: 'default' as const,
    secondary: 'ghost' as const,
    danger: 'destructive' as const,
  };

  return (
    <UIButton
      variant={variantMap[variant]}
      className={className}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Please wait…
        </>
      ) : children}
    </UIButton>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground/70">
        {label}
      </label>
      <UIInput id={id} className={className} {...props} />
    </div>
  );
}
