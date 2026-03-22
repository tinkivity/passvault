import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const sections = [
  {
    label: 'Management',
    items: [
      { to: '/admin/users', label: 'User' },
      { to: '/admin/management/admin', label: 'Admin' },
    ],
  },
  {
    label: 'Logs',
    items: [{ to: '/admin/logs/logins', label: 'Logins' }],
  },
];

function getInitialExpanded(pathname: string): Record<string, boolean> {
  return Object.fromEntries(
    sections.map((s) => [
      s.label,
      s.items.some((item) => pathname.startsWith(item.to)),
    ]),
  );
}

const topLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-2 text-sm transition-colors border-l-2 ${
    isActive
      ? 'bg-primary/10 border-primary text-primary font-medium'
      : 'border-transparent text-base-content/70 hover:bg-base-200 hover:text-base-content'
  }`;

const childLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block pl-7 pr-4 py-2 text-sm transition-colors border-l-2 ${
    isActive
      ? 'bg-primary/10 border-primary text-primary font-medium'
      : 'border-transparent text-base-content/60 hover:bg-base-200 hover:text-base-content'
  }`;

export function AdminSidebar() {
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => getInitialExpanded(pathname),
  );

  useEffect(() => {
    sections.forEach((section) => {
      if (section.items.some((item) => pathname.startsWith(item.to))) {
        setExpanded((prev) => ({ ...prev, [section.label]: true }));
      }
    });
  }, [pathname]);

  const toggle = (label: string) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <nav className="w-48 shrink-0 bg-base-300 flex flex-col py-3">
      <NavLink to="/admin/dashboard" className={topLinkClass}>
        Dashboard
      </NavLink>

      <div className="mt-2 border-t border-base-content/10" />

      {sections.map((section) => (
        <div key={section.label}>
          <button
            className="w-full flex items-center justify-between px-4 py-2 text-sm font-semibold text-base-content/50 hover:text-base-content transition-colors"
            onClick={() => toggle(section.label)}
          >
            {section.label}
            <span className="text-xs">{expanded[section.label] ? '▾' : '▸'}</span>
          </button>
          {expanded[section.label] &&
            section.items.map((item) => (
              <NavLink key={item.to} to={item.to} className={childLinkClass}>
                {item.label}
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );
}
