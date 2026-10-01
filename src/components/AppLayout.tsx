import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { PLANS } from '@/lib/plans';
import type { ReactNode } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/app',
    label: 'Dashboard',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    to: '/app/connections',
    label: 'Connections',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    to: '/app/new-run',
    label: 'New Run',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    to: '/app/analytics',
    label: 'Analytics',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18M7 16V8M12 16v-5M17 16v-2" />
      </svg>
    ),
  },
  {
    to: '/app/billing',
    label: 'Billing',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
      </svg>
    ),
  },
];

const SIDEBAR_STORAGE_KEY = 'admafia-sidebar-collapsed';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, subscription, signOut } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const plan = subscription ? PLANS[subscription.plan] : PLANS.starter;
  const usagePct = plan.maxGenerations > 0
    ? Math.min(100, Math.round((subscription?.generations_used ?? 0) / plan.maxGenerations * 100))
    : 0;

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Private browsing / blocked storage — collapse state just won't persist.
      }
      return next;
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-gray-900 text-gray-300 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex h-16 items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-6'}`}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-gray-900 font-bold text-sm">AM</div>
          <span
            className={`overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight text-white transition-all duration-300 ${
              isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
            }`}
          >
            AdMafia
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span
                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                  isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Usage meter — too much detail for an icon rail, so it's hidden
            (not animated) while collapsed rather than squeezed down. */}
        {!isCollapsed && (
          <div className="px-4 py-4">
            <div className="rounded-xl bg-white/5 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Plan</span>
                <span className="font-semibold text-white">{plan.name}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-gray-400">Generations</span>
                <span className="text-gray-300">
                  {plan.maxGenerations === 0
                    ? `${subscription?.generations_used ?? 0} / ∞`
                    : `${subscription?.generations_used ?? 0} / ${plan.maxGenerations}`}
                </span>
              </div>
              {plan.maxGenerations > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white/40 transition-all" style={{ width: `${usagePct}%` }} />
                </div>
              )}
              <NavLink to="/app/billing" className="mt-3 block text-center text-xs font-medium text-gray-400 hover:text-white transition-colors">
                Manage plan
              </NavLink>
            </div>
          </div>
        )}

        {/* User section */}
        <div className={`border-t border-white/10 py-4 ${isCollapsed ? 'px-0' : 'px-4'}`}>
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-3' : 'gap-3'}`}>
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
              title={isCollapsed ? (user?.email ?? undefined) : undefined}
            >
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{user?.email}</p>
              </div>
            )}
            <button onClick={handleSignOut} className="flex-shrink-0 text-gray-400 hover:text-white transition-colors" title="Sign out">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Collapse/expand toggle — floats on the sidebar's edge, the
            standard dashboard pattern (VSCode, Notion, Linear, etc.).
            Positioned relative to <aside> itself (a `fixed` element is a
            containing block for `absolute` descendants), so `left-64` /
            `left-20` land exactly on the sidebar's current right edge. */}
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`absolute top-8 z-40 -ml-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-300 hover:text-gray-900 ${
            isCollapsed ? 'left-20' : 'left-64'
          }`}
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </aside>

      {/* Main content */}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${isCollapsed ? 'pl-20' : 'pl-64'}`}>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
