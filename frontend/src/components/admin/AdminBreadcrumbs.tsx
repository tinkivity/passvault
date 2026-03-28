import { Link, useLocation } from 'react-router-dom';

type Crumb = { label: string; to?: string };

function buildCrumbs(pathname: string, state: unknown): Crumb[] {
  if (pathname === '/admin/dashboard' || pathname === '/admin' || pathname === '/admin/') {
    return [{ label: 'Admin' }];
  }
  if (pathname === '/admin/users') {
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Users' },
    ];
  }
  if (pathname.startsWith('/admin/users/')) {
    const username = (state as { user?: { username?: string } } | null)?.user?.username;
    const userId = pathname.split('/admin/users/')[1];
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Users', to: '/admin/users' },
      { label: username ?? userId },
    ];
  }
  if (pathname === '/admin/logs/logins') {
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Logs' },
      { label: 'Logins' },
    ];
  }
  if (pathname === '/admin/management/admin') {
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Management' },
      { label: 'Admin' },
    ];
  }
  return [{ label: 'Admin' }];
}

export function AdminBreadcrumbs() {
  const { pathname, state } = useLocation();
  const crumbs = buildCrumbs(pathname, state);

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-muted-foreground select-none shrink-0">›</span>}
            {isLast || !crumb.to ? (
              <span className={`truncate ${isLast ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
