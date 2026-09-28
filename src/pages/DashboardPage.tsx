import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PLANS } from '@/lib/plans';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import type { AdAccount, PublishedAd, AdPerformance, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

export default function DashboardPage() {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [ads, setAds] = useState<PublishedAd[]>([]);
  const [performance, setPerformance] = useState<AdPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!user) return;
    const [{ data: accData }, { data: adData }, { data: perfData }] = await Promise.all([
      supabase.from('ad_accounts').select('*').eq('user_id', user.id),
      supabase.from('published_ads').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('ad_performance').select('*').eq('user_id', user.id).order('date', { ascending: true }),
    ]);
    setAccounts((accData as AdAccount[]) ?? []);
    setAds((adData as PublishedAd[]) ?? []);
    setPerformance((perfData as AdPerformance[]) ?? []);
    setLoading(false);
  }

  const plan = subscription ? PLANS[subscription.plan] : PLANS.starter;
  const usagePct = plan.maxGenerations > 0
    ? Math.min(100, Math.round((subscription?.generations_used ?? 0) / plan.maxGenerations * 100))
    : 0;

  // Aggregate last 14 days of performance
  const stats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const recent = performance.filter((p) => p.date >= cutoffStr);
    const spend = recent.reduce((s, d) => s + Number(d.spend), 0);
    const revenue = recent.reduce((s, d) => s + Number(d.revenue), 0);
    const clicks = recent.reduce((s, d) => s + d.clicks, 0);
    const conversions = recent.reduce((s, d) => s + d.conversions, 0);

    // Previous 14 days for trend
    const prevCutoff = new Date();
    prevCutoff.setDate(prevCutoff.getDate() - 28);
    const prevCutoffStr = prevCutoff.toISOString().split('T')[0];
    const prev = performance.filter((p) => p.date >= prevCutoffStr && p.date < cutoffStr);
    const prevSpend = prev.reduce((s, d) => s + Number(d.spend), 0);
    const prevRevenue = prev.reduce((s, d) => s + Number(d.revenue), 0);
    const prevClicks = prev.reduce((s, d) => s + d.clicks, 0);
    const prevConversions = prev.reduce((s, d) => s + d.conversions, 0);

    const trend = (curr: number, prevVal: number) => {
      if (prevVal === 0) return curr > 0 ? '+100%' : '0%';
      const pct = Math.round(((curr - prevVal) / prevVal) * 100);
      return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    return { spend, revenue, clicks, conversions, spendTrend: trend(spend, prevSpend), revenueTrend: trend(revenue, prevRevenue), clicksTrend: trend(clicks, prevClicks), conversionsTrend: trend(conversions, prevConversions) };
  }, [performance]);

  const connectedPlatforms = new Set(accounts.filter(a => a.status === 'connected').map(a => a.platform));

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Here's what's happening across your ad accounts.</p>
        </div>

        {/* Quick stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Spend (14d)" value={`$${stats.spend.toFixed(2)}`} trend={stats.spendTrend} />
          <StatCard label="Revenue (14d)" value={`$${stats.revenue.toFixed(2)}`} trend={stats.revenueTrend} />
          <StatCard label="Clicks (14d)" value={stats.clicks.toString()} trend={stats.clicksTrend} />
          <StatCard label="Conversions (14d)" value={stats.conversions.toString()} trend={stats.conversionsTrend} />
        </div>

        {/* Two column layout */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Connections summary */}
          <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Connected Accounts</h2>
              <button onClick={() => navigate('/app/connections')} className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
                Manage →
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['meta', 'google', 'tiktok'] as Platform[]).map((p) => {
                const connected = connectedPlatforms.has(p);
                const count = accounts.filter(a => a.platform === p && a.status === 'connected').length;
                return (
                  <div key={p} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: PLATFORM_COLORS[p] }}
                      >
                        <span className="text-xs font-bold">{p[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{PLATFORM_LABELS[p]}</p>
                        <p className="text-xs text-gray-400">{connected ? `${count} account${count !== 1 ? 's' : ''}` : 'Not connected'}</p>
                      </div>
                    </div>
                    {connected ? (
                      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    ) : (
                      <button
                        onClick={() => navigate('/app/connections')}
                        className="mt-3 text-xs font-medium text-gray-900 hover:underline"
                      >
                        Connect →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Usage */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Plan Usage</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{plan.name} plan</span>
              <span className="text-sm font-medium text-gray-900">${plan.price}/mo</span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Generations</span>
                <span className="text-gray-700">
                  {subscription?.generations_used ?? 0} / {plan.maxGenerations === 0 ? '∞' : plan.maxGenerations}
                </span>
              </div>
              {plan.maxGenerations > 0 && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-500' : 'bg-gray-900'}`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              )}
            </div>
            <button
              onClick={() => navigate('/app/billing')}
              className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Manage plan
            </button>
          </div>
        </div>

        {/* Recent ads */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Published Ads</h2>
            <button onClick={() => navigate('/app/analytics')} className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
              View all →
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
            </div>
          ) : ads.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <p className="text-sm text-gray-500">No published ads yet.</p>
              <button
                onClick={() => navigate('/app/new-run')}
                className="mt-3 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ads.map((ad) => {
                const account = accounts.find(a => a.id === ad.ad_account_id);
                return (
                  <div key={ad.id} className="flex items-center gap-4 px-6 py-4">
                    {ad.creative_url && (
                      <img src={ad.creative_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{ad.headline}</p>
                      <p className="text-xs text-gray-400">
                        {account ? PLATFORM_LABELS[account.platform as Platform] : 'Unknown'} · {ad.status}
                      </p>
                    </div>
                    <span className="text-sm text-gray-600">${ad.daily_budget}/day</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-gray-900 px-6 py-5">
          <div>
            <h3 className="text-base font-semibold text-white">Ready to launch a new campaign?</h3>
            <p className="text-sm text-gray-400">Generate AI ad creative in seconds.</p>
          </div>
          <button
            onClick={() => navigate('/app/new-run')}
            className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            New Run
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, trend }: { label: string; value: string; trend: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      <p className={`mt-1 text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {trend} vs previous period
      </p>
    </div>
  );
}
