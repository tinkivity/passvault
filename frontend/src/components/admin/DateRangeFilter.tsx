import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangeFilterProps {
  label: string;
  ariaLabel: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}

export function DateRangeFilter({ label, ariaLabel, from, to, onFrom, onTo }: DateRangeFilterProps) {
  const activeCount = [from, to].filter(Boolean).length;
  const isActive = activeCount > 0;

  return (
    <Popover>
      <PopoverTrigger render={
        <Button variant="outline" size="sm" className="h-8 border-dashed" aria-label={ariaLabel} />
      }>
        <CalendarDaysIcon className="mr-1 h-4 w-4" />
        {label}
        {isActive && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {activeCount}
            </Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px]" align="start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">From</p>
            <Input
              type="date"
              className="h-8 text-sm"
              value={from}
              max={to || undefined}
              onChange={e => onFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">To</p>
            <Input
              type="date"
              className="h-8 text-sm"
              value={to}
              min={from || undefined}
              onChange={e => onTo(e.target.value)}
            />
          </div>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => { onFrom(''); onTo(''); }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
