import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { AdminStats } from '@passvault/shared';
import type { LoginEventSummary } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

// ---- Helpers ----------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type RangeKey = 'today' | '7d' | '30d';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

function buildDateRange(key: RangeKey): string[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = key === '7d' ? 7 : 30;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function aggregateByDay(events: LoginEventSummary[], range: RangeKey): { label: string; logins: number }[] {
  const dates = buildDateRange(range);
  const counts: Record<string, number> = Object.fromEntries(dates.map(d => [d, 0]));
  events.forEach(ev => {
    const d = ev.timestamp.slice(0, 10);
    if (d in counts) counts[d]++;
  });
  return dates.map(date => ({ label: date, logins: counts[date] }));
}

function aggregateByHour(events: LoginEventSummary[]): { label: string; logins: number }[] {
  const todayDate = new Date().toISOString().slice(0, 10);
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0') + ':00');
  const counts: Record<string, number> = Object.fromEntries(hours.map(h => [h, 0]));
  events.forEach(ev => {
    if (ev.timestamp.slice(0, 10) === todayDate) {
      const hour = ev.timestamp.slice(11, 13) + ':00';
      if (hour in counts) counts[hour]++;
    }
  });
  return hours.map(h => ({ label: h, logins: counts[h] }));
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ---- Metric card ------------------------------------------------------------

function MetricCard({ label, value, linkTo }: { label: string; value: string | null; linkTo?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {label}
      </p>
      {value === null ? (
        <Skeleton className="h-9 w-28" />
      ) : linkTo ? (
        <Link to={linkTo} className="text-3xl font-bold text-primary hover:text-primary/80 transition-colors">
          {value}
        </Link>
      ) : (
        <p className="text-3xl font-bold text-foreground">{value}</p>
      )}
    </div>
  );
}

// ---- Chart config -----------------------------------------------------------

const chartConfig = {
  logins: {
    label: 'Logins',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

// ---- Main page --------------------------------------------------------------

export function DashboardPage() {
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<LoginEventSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState<RangeKey>('7d');

  const load = useCallback(async () => {
    const [s, ev] = await Promise.all([
      admin.getStats(),
      admin.getLoginEvents(),
    ]);
    setStats(s);
    setEvents(ev.events);
    setLoaded(true);
  }, [admin.getStats, admin.getLoginEvents]);

  useEffect(() => {
    if (!token || loaded) return;
    load();
  }, [token, loaded, load]);

  const statsLoading = admin.loading && !loaded;
  const chartData = useMemo(
    () => range === 'today' ? aggregateByHour(events) : aggregateByDay(events, range),
    [events, range],
  );

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Dashboard</h1>
      {admin.error && (
        <p className="text-destructive text-sm mb-4">{admin.error}</p>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Users"
          value={statsLoading ? null : String(stats?.totalUsers ?? 0)}
          linkTo="/admin/users"
        />
        <MetricCard
          label="Vault Storage"
          value={statsLoading ? null : formatBytes(stats?.totalVaultSizeBytes ?? 0)}
        />
        <MetricCard
          label="Logins (last 7 days)"
          value={statsLoading ? null : String(stats?.loginsLast7Days ?? 0)}
          linkTo="/admin/logs/logins"
        />
      </div>

      {/* Login activity chart */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-sm">Login Activity</p>
            <p className="text-xs text-muted-foreground">
              {range === 'today' ? 'Number of logins per hour' : 'Number of logins per day'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <Button
                key={r.key}
                variant={range === r.key ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {statsLoading ? (
          <Skeleton className="h-[200px] w-full rounded-md" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="loginsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={range === 'today'
                  ? (v: string) => v.slice(0, 2) + 'h'
                  : formatDateLabel}
                interval={range === 'today' ? 3 : range === '7d' ? 0 : 4}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                allowDecimals={false}
                width={28}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={v => range === 'today'
                      ? String(v) + ' UTC'
                      : formatDateLabel(String(v))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="logins"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#loginsFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
