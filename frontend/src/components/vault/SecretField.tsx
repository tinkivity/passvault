import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SecretFieldProps {
  value: string;
  label?: string;
}

export function SecretField({ value, label }: SecretFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <div className="flex items-center gap-1 min-w-0" aria-label={label}>
      <span className="font-mono text-sm truncate">
        {visible ? value : '••••••••••••'}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setVisible(v => !v)}
        title={visible ? t('hide') : t('show')}
        aria-label={visible ? t('hide') : t('show')}
        className="shrink-0"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        title={copied ? t('copied') : t('copy')}
        aria-label={t('copy')}
        className="shrink-0"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
