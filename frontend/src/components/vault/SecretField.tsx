import { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SecretFieldProps {
  value: string;
  label?: string;
}

export function SecretField({ value, label }: SecretFieldProps) {
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
        title={visible ? 'Hide' : 'Show'}
        aria-label={visible ? 'Hide' : 'Show'}
        className="shrink-0"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        title="Copy"
        aria-label="Copy to clipboard"
        className="shrink-0"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
