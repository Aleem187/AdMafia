import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { callPublishAds } from '@/lib/api';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import type { AdAccount, CopyVariant, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

interface PublishState {
  generationId: string;
  copy: CopyVariant;
  creative: string;
  accountIds: string[];
}

export default function PublishPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const state = location.state as PublishState | null;
  const [budget, setBudget] = useState('50');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);

  useEffect(() => {
    if (state?.accountIds?.length) {
      supabase
        .from('ad_accounts')
        .select('*')
        .in('id', state.accountIds)
        .then(({ data }) => {
          if (data) setAccounts(data as AdAccount[]);
        });
    }
  }, [state?.accountIds]);

  async function handlePublish() {
    if (!user || !state) return;
    setPublishing(true);
    setError(null);

    try {
      const result = await callPublishAds({
        generationId: state.generationId,
        userId: user.id,
        copy: state.copy,
        creative: state.creative,
        accountIds: state.accountIds,
        dailyBudget: parseFloat(budget) || 50,
      });

      setPublishing(false);

      if (result.errors && result.errors.length > 0) {
        setError(result.errors.join('; '));
      }

      setPublished(true);

      setTimeout(() => {
        navigate('/app/analytics');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publishing failed.';
      setError(message);
      setPublishing(false);
    }
  }

  if (!state) {
    return (
      <AppLayout>
        <div className="px-8 py-10 text-center">
          <p className="text-gray-500">No ad selected for publishing.</p>
          <button onClick={() => navigate('/app/new-run')} className="mt-4 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white">
            Create a new run
          </button>
        </div>
      </AppLayout>
    );
  }

  if (published) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Ads published successfully!</h2>
          <p className="mt-1 text-sm text-gray-500">Redirecting to analytics...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="mb-8">
          <button onClick={() => navigate(-1)} className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Publish Confirmation</h1>
          <p className="mt-1 text-sm text-gray-500">Review the summary and set your daily budget before publishing.</p>
        </div>

        {/* Ad preview */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Ad Summary</h2>
          <div className="flex gap-5">
            <img src={state.creative} alt="Creative" className="h-32 w-32 rounded-xl object-cover" />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900">{state.copy.headline}</p>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{state.copy.body}</p>
              <span className="mt-3 inline-block rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">{state.copy.cta}</span>
            </div>
          </div>
        </div>

        {/* Target accounts */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Target Accounts ({accounts.length})</h2>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold"
                  style={{ backgroundColor: PLATFORM_COLORS[account.platform as Platform] }}
                >
                  {account.platform[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{account.account_name}</p>
                  <p className="text-xs text-gray-400">{PLATFORM_LABELS[account.platform as Platform]}</p>
                </div>
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Ready</span>
              </div>
            ))}
          </div>
        </div>

        {/* Budget */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Daily Budget</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">$</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min="1"
                className="w-32 rounded-xl border border-gray-200 py-3 pl-8 pr-4 text-lg font-bold text-gray-900 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <span className="text-sm text-gray-500">per day, per account</span>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Estimated total daily spend: <span className="font-semibold text-gray-600">${(parseFloat(budget) || 0) * accounts.length}</span> across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        )}

        {/* Publish button */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-7 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {publishing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Publishing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Publish {accounts.length} Ad{accounts.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
