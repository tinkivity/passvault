import { Link } from 'react-router-dom';

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
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
