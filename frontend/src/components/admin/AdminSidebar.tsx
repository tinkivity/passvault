import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  UsersIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const sections = [
  {
    label: 'Management',
    items: [
      { to: '/admin/users', label: 'User', icon: UsersIcon },
      { to: '/admin/management/admin', label: 'Admin', icon: Cog6ToothIcon },
    ],
  },
  {
    label: 'Logs',
    items: [
      { to: '/admin/logs/logins', label: 'Logins', icon: ArrowRightOnRectangleIcon },
    ],
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
  `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors border-l-2 ${
    isActive
      ? 'bg-primary/10 border-primary text-primary font-medium'
      : 'border-transparent text-base-content/70 hover:bg-base-200 hover:text-base-content'
  }`;

const childLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 pl-7 pr-4 py-2 text-sm transition-colors border-l-2 ${
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
    <nav className="w-52 shrink-0 bg-base-200 border-r border-base-300 flex flex-col py-3">
      <NavLink to="/admin/dashboard" className={topLinkClass}>
        <HomeIcon className="w-4 h-4 shrink-0" />
        Dashboard
      </NavLink>

      <div className="mt-2 border-t border-base-300" />

      {sections.map((section) => (
        <div key={section.label}>
          <button
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-base-content/40 hover:text-base-content/70 transition-colors"
            onClick={() => toggle(section.label)}
          >
            {section.label}
            {expanded[section.label]
              ? <ChevronDownIcon className="w-3 h-3" />
              : <ChevronRightIcon className="w-3 h-3" />}
          </button>
          {expanded[section.label] &&
            section.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={childLinkClass}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );
}
