import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminStats } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function MetricCard({ label, value, linkTo }: { label: string; value: string | null; linkTo?: string }) {
  return (
    <div className="bg-base-100 rounded-xl border border-base-300 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-3">
        {label}
      </p>
      {value === null ? (
        <div className="h-9 w-28 bg-base-300 rounded animate-pulse" />
      ) : linkTo ? (
        <Link to={linkTo} className="text-3xl font-bold text-primary hover:text-primary/80 transition-colors">
          {value}
        </Link>
      ) : (
        <p className="text-3xl font-bold text-base-content">{value}</p>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const loadStats = useCallback(async () => {
    const s = await admin.getStats();
    setStats(s);
    setStatsLoaded(true);
  }, [admin.getStats]);

  useEffect(() => {
    if (!token || statsLoaded) return;
    loadStats();
  }, [token, statsLoaded, loadStats]);

  const loading = admin.loading && !statsLoaded;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Dashboard</h1>
      {admin.error && (
        <p className="text-error text-sm mb-4">{admin.error}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Users"
          value={loading ? null : String(stats?.totalUsers ?? 0)}
          linkTo="/admin/users"
        />
        <MetricCard
          label="Vault Storage"
          value={loading ? null : formatBytes(stats?.totalVaultSizeBytes ?? 0)}
        />
        <MetricCard
          label="Logins (last 7 days)"
          value={loading ? null : String(stats?.loginsLast7Days ?? 0)}
          linkTo="/admin/logs/logins"
        />
      </div>
    </div>
  );
}
