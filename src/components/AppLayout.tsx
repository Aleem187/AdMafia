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

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, subscription, signOut } = useAuth();
  const navigate = useNavigate();
  const plan = subscription ? PLANS[subscription.plan] : PLANS.starter;
  const usagePct = plan.maxGenerations > 0
    ? Math.min(100, Math.round((subscription?.generations_used ?? 0) / plan.maxGenerations * 100))
    : 0;

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-gray-900 text-gray-300">
        <div className="flex h-16 items-center gap-2 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-900 font-bold text-sm">AM</div>
          <span className="text-lg font-semibold tracking-tight text-white">AdMafia</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Usage meter */}
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

        {/* User section */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-sm text-white">{user?.email}</p>
            </div>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-white transition-colors" title="Sign out">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 pl-64">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
