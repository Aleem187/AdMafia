import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { callPublishAds } from '@/lib/api';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import type { PublishedAd, AdAccount, AdPerformance, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

type DateRange = '7d' | '14d' | '30d';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ads, setAds] = useState<PublishedAd[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [performance, setPerformance] = useState<AdPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange>('14d');
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [rerunMessage, setRerunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleRerun(ad: PublishedAd) {
    if (!user) return;
    if (!ad.ad_account_id || !ad.creative_url) {
      setRerunMessage({ type: 'error', text: 'This ad has no ad account or creative to retry with.' });
      return;
    }

    setRerunningId(ad.id);
    setRerunMessage(null);
    try {
      // Reuses the exact copy and creative already stored on this ad and
      // sends it straight to publish-ads, which never calls generate-ads —
      // no new OpenAI copy or image generation, no AI credits spent.
      const result = await callPublishAds({
        generationId: ad.generation_id,
        userId: user.id,
        copy: { headline: ad.headline ?? '', body: ad.body ?? '', cta: ad.cta ?? '' },
        creative: ad.creative_url,
        accountIds: [ad.ad_account_id],
        dailyBudget: Number(ad.daily_budget),
      });
      if (result.errors?.length) {
        setRerunMessage({ type: 'error', text: result.errors.join(' ') });
      } else {
        setRerunMessage({ type: 'success', text: `Rerun submitted for "${ad.headline}".` });
      }
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rerun failed.';
      setRerunMessage({ type: 'error', text: message });
    } finally {
      setRerunningId(null);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!user) return;
    const [{ data: adData }, { data: accData }, { data: perfData }] = await Promise.all([
      supabase.from('published_ads').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('ad_accounts').select('*').eq('user_id', user.id),
      supabase.from('ad_performance').select('*').eq('user_id', user.id).order('date', { ascending: true }),
    ]);
    setAds((adData as PublishedAd[]) ?? []);
    setAccounts((accData as AdAccount[]) ?? []);
    setPerformance((perfData as AdPerformance[]) ?? []);
    setLoading(false);
  }

  const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Filter ads by platform
  const filteredAds = useMemo(() => {
    if (platformFilter === 'all') return ads;
    const accountIds = accounts.filter((a) => a.platform === platformFilter).map((a) => a.id);
    return ads.filter((ad) => accountIds.includes(ad.ad_account_id ?? ''));
  }, [ads, accounts, platformFilter]);

  // Filter performance by date range and platform
  const filteredPerf = useMemo(() => {
    let perf = performance.filter((p) => p.date >= cutoffStr);
    if (platformFilter !== 'all') {
      const accountIds = accounts.filter((a) => a.platform === platformFilter).map((a) => a.id);
      const adIds = ads.filter((ad) => accountIds.includes(ad.ad_account_id ?? '')).map((ad) => ad.id);
      perf = perf.filter((p) => adIds.includes(p.published_ad_id));
    }
    return perf;
  }, [performance, ads, accounts, platformFilter, cutoffStr]);

  // Aggregate by date for chart
  const chartData = useMemo(() => {
    const byDate = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>();
    for (const p of filteredPerf) {
      const existing = byDate.get(p.date) ?? { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.spend += Number(p.spend);
      existing.revenue += Number(p.revenue);
      existing.clicks += p.clicks;
      existing.impressions += p.impressions;
      existing.conversions += p.conversions;
      byDate.set(p.date, existing);
    }
    return Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v }));
  }, [filteredPerf]);

  // Aggregate metrics
  const totals = useMemo(() => {
    const spend = chartData.reduce((s, d) => s + d.spend, 0);
    const clicks = chartData.reduce((s, d) => s + d.clicks, 0);
    const impressions = chartData.reduce((s, d) => s + d.impressions, 0);
    const conversions = chartData.reduce((s, d) => s + d.conversions, 0);
    const revenue = chartData.reduce((s, d) => s + d.revenue, 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
    return { spend, clicks, impressions, conversions, revenue, roas, cpc, ctr, cvr };
  }, [chartData]);

  // Per-ad performance
  const adPerformanceMap = useMemo(() => {
    const byAd = new Map<string, { spend: number; revenue: number; clicks: number; conversions: number }>();
    for (const p of filteredPerf) {
      const existing = byAd.get(p.published_ad_id) ?? { spend: 0, revenue: 0, clicks: 0, conversions: 0 };
      existing.spend += Number(p.spend);
      existing.revenue += Number(p.revenue);
      existing.clicks += p.clicks;
      existing.conversions += p.conversions;
      byAd.set(p.published_ad_id, existing);
    }
    return byAd;
  }, [filteredPerf]);

  const chartMax = Math.max(...chartData.map((d) => Math.max(d.spend, d.revenue)), 1);

  // Computed once and shared by both the mobile card list and the desktop
  // table below, so the two responsive views never drift out of sync.
  const enrichedAds = useMemo(() => {
    return filteredAds.map((ad) => {
      const account = accounts.find((a) => a.id === ad.ad_account_id);
      const adPerf = adPerformanceMap.get(ad.id);
      const adSpend = adPerf?.spend ?? 0;
      const adRevenue = adPerf?.revenue ?? 0;
      const adRoas = adSpend > 0 ? adRevenue / adSpend : 0;
      return { ad, account, adSpend, adRevenue, adRoas };
    });
  }, [filteredAds, accounts, adPerformanceMap]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Analytics Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Cross-platform performance overview for all your published ads.</p>
          </div>
          <button
            onClick={() => navigate('/app/new-run')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors sm:w-auto"
          >
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            New Run
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
            {(['all', 'meta', 'google', 'tiktok'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  platformFilter === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p === 'all' ? 'All Platforms' : PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
            {(['7d', '14d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {r === '7d' ? '7 days' : r === '14d' ? '14 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <KpiCard label="Total Spend" value={`$${totals.spend.toFixed(2)}`} sub={`${totals.clicks} clicks`} icon="spend" />
          <KpiCard label="Revenue" value={`$${totals.revenue.toFixed(2)}`} sub={`${totals.conversions} conversions`} icon="revenue" />
          <KpiCard label="ROAS" value={`${totals.roas.toFixed(2)}x`} sub={`CPC $${totals.cpc.toFixed(2)}`} icon="roas" />
          <KpiCard label="CTR" value={`${totals.ctr.toFixed(2)}%`} sub={`CVR ${totals.cvr.toFixed(1)}%`} icon="ctr" />
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Spend vs Revenue</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm bg-gray-400" /> Spend</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm bg-gray-900" /> Revenue</span>
              </div>
            </div>
            {/* Scrolls horizontally instead of squeezing bars unreadably thin
                when a wide date range (e.g. 30 days) is selected on a narrow screen. */}
            <div className="overflow-x-auto">
              <div className="flex h-48 items-end gap-1" style={{ minWidth: `${chartData.length * 14}px` }}>
                {chartData.map((d) => (
                  <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5">
                    <div className="absolute -top-8 hidden rounded-lg bg-gray-900 px-2 py-1 text-[10px] text-white group-hover:block z-10 whitespace-nowrap">
                      ${d.revenue.toFixed(0)} / ${d.spend.toFixed(0)}
                    </div>
                    <div
                      className="w-full rounded-t-sm bg-gray-900 transition-all"
                      style={{ height: `${(d.revenue / chartMax) * 100}%` }}
                    />
                    <div
                      className="w-full rounded-t-sm bg-gray-400 transition-all"
                      style={{ height: `${(d.spend / chartMax) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-gray-400">
              <span>{chartData[0]?.date}</span>
              <span>{chartData[chartData.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {rerunMessage && (
          <div className={`mt-6 flex items-start gap-3 rounded-xl px-5 py-4 ${rerunMessage.type === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`flex-1 text-sm ${rerunMessage.type === 'success' ? 'text-green-900' : 'text-red-700'}`}>{rerunMessage.text}</p>
            <button onClick={() => setRerunMessage(null)} className={rerunMessage.type === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Ads table */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
            <h2 className="text-sm font-semibold text-gray-900">Published Ads ({filteredAds.length})</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="px-4 py-12 text-center sm:px-6">
              <p className="text-sm text-gray-400">No published ads yet.</p>
              <button onClick={() => navigate('/app/new-run')} className="mt-2 text-sm font-medium text-gray-900 hover:underline">
                Create your first campaign
              </button>
            </div>
          ) : (
            <>
              {/* Stacked card view — below sm, where an 8-column table would
                  either overflow or force constant horizontal scrolling just
                  to read a single ad's numbers. */}
              <div className="divide-y divide-gray-50 sm:hidden">
                {enrichedAds.map(({ ad, account, adSpend, adRevenue, adRoas }) => (
                  <div key={ad.id} className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      {ad.creative_url && (
                        <img src={ad.creative_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{ad.headline}</p>
                        <p className="text-xs text-gray-400">{ad.cta}</p>
                      </div>
                      <span className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        ad.status === 'live' ? 'bg-green-50 text-green-700' :
                        ad.status === 'queued' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          ad.status === 'live' ? 'bg-green-500' :
                          ad.status === 'queued' ? 'bg-blue-500' : 'bg-gray-400'
                        }`} />
                        {ad.status}
                      </span>
                    </div>

                    {account && (
                      <div className="mt-3 flex items-center gap-2">
                        <div
                          className="h-5 w-5 flex-shrink-0 rounded-md"
                          style={{ backgroundColor: PLATFORM_COLORS[account.platform as Platform] }}
                        />
                        <span className="text-xs text-gray-600">{PLATFORM_LABELS[account.platform as Platform]}</span>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-gray-50/70 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Budget</span>
                        <span className="font-medium text-gray-900">${ad.daily_budget}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Spend</span>
                        <span className="font-medium text-gray-900">${adSpend.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Revenue</span>
                        <span className="font-medium text-gray-900">${adRevenue.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">ROAS</span>
                        <span className="font-semibold text-gray-900">{adRoas.toFixed(2)}x</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRerun(ad)}
                      disabled={rerunningId === ad.id || !ad.ad_account_id || !ad.creative_url}
                      title={!ad.ad_account_id || !ad.creative_url ? 'Missing ad account or creative — cannot rerun' : 'Republish this exact ad copy and creative without regenerating it'}
                      className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        rerunningId === ad.id || !ad.ad_account_id || !ad.creative_url
                          ? 'cursor-not-allowed border-gray-100 text-gray-300'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
                      }`}
                    >
                      {rerunningId === ad.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                          Rerunning...
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                          </svg>
                          Rerun
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {/* Full table — sm and up. Still horizontally scrollable on its
                  own in case a tablet-width viewport is still narrower than
                  all 8 columns. */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ad</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Platform</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Budget</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Spend</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Revenue</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">ROAS</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {enrichedAds.map(({ ad, account, adSpend, adRevenue, adRoas }) => (
                      <tr key={ad.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {ad.creative_url && (
                              <img src={ad.creative_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{ad.headline}</p>
                              <p className="text-xs text-gray-400">{ad.cta}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {account && (
                            <div className="flex items-center gap-2">
                              <div
                                className="h-6 w-6 rounded-md"
                                style={{ backgroundColor: PLATFORM_COLORS[account.platform as Platform] }}
                              />
                              <span className="text-sm text-gray-600">{PLATFORM_LABELS[account.platform as Platform]}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            ad.status === 'live' ? 'bg-green-50 text-green-700' :
                            ad.status === 'queued' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              ad.status === 'live' ? 'bg-green-500' :
                              ad.status === 'queued' ? 'bg-blue-500' : 'bg-gray-400'
                            }`} />
                            {ad.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-600">${ad.daily_budget}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-600">${adSpend.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">${adRevenue.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{adRoas.toFixed(2)}x</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRerun(ad)}
                            disabled={rerunningId === ad.id || !ad.ad_account_id || !ad.creative_url}
                            title={!ad.ad_account_id || !ad.creative_url ? 'Missing ad account or creative — cannot rerun' : 'Republish this exact ad copy and creative without regenerating it'}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              rerunningId === ad.id || !ad.ad_account_id || !ad.creative_url
                                ? 'cursor-not-allowed border-gray-100 text-gray-300'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
                            }`}
                          >
                            {rerunningId === ad.id ? (
                              <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                                Rerunning...
                              </>
                            ) : (
                              <>
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                                </svg>
                                Rerun
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  const iconColors: Record<string, string> = {
    spend: 'bg-blue-50 text-blue-600',
    revenue: 'bg-green-50 text-green-600',
    roas: 'bg-purple-50 text-purple-600',
    ctr: 'bg-amber-50 text-amber-600',
  };
  const iconPaths: Record<string, string> = {
    spend: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    revenue: 'M3 3v18h18M7 14l4-4 4 4 6-6',
    roas: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    ctr: 'M3 3v18h18M7 16V8M12 16v-5M17 16v-2',
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconColors[icon]}`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPaths[icon]} />
          </svg>
        </div>
      </div>
      <p className="mt-3 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
