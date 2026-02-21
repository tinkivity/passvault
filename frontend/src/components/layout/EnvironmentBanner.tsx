const ENV = import.meta.env.VITE_ENVIRONMENT ?? 'dev';

const bannerConfig: Record<string, { label: string; className: string } | undefined> = {
  dev: { label: 'DEV ENVIRONMENT', className: 'bg-yellow-400 text-yellow-900' },
  beta: { label: 'BETA ENVIRONMENT', className: 'bg-blue-500 text-white' },
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
