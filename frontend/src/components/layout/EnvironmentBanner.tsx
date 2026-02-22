const ENV = import.meta.env.VITE_ENVIRONMENT ?? 'dev';

const bannerConfig: Record<string, { label: string; className: string } | undefined> = {
  dev: { label: 'DEV ENVIRONMENT', className: 'bg-warning text-warning-content' },
  beta: { label: 'BETA ENVIRONMENT', className: 'bg-info text-info-content' },
};

export function EnvironmentBanner() {
  const config = bannerConfig[ENV];
  if (!config) return null;

  return (
    <div className={`w-full text-center text-xs font-bold py-1 tracking-widest ${config.className}`}>
      {config.label}
    </div>
  );
}
