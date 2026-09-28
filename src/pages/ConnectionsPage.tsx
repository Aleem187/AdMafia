import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { startOAuthConnect, completeOAuthCallback, type OAuthCallbackResult } from '@/lib/api';
import { getPendingOAuthCallback } from '@/lib/oauthCallback';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import type { AdAccount, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';
import { PLANS } from '@/lib/plans';

const PLATFORMS: Platform[] = ['meta', 'google', 'tiktok'];

export default function ConnectionsPage() {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  // True while an OAuth redirect's code is being exchanged but we don't yet
  // know (or don't need to render) which specific platform it was for.
  const [finalizingOAuth, setFinalizingOAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Guards against exchanging the same code twice (StrictMode double-effects,
  // re-renders when `user` resolves, etc.).
  const handledCodeRef = useRef<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  // Handle OAuth callback. The platform is intentionally NOT assumed here: the
  // server resolves it from `state` (oauth-connect records state -> platform
  // for every platform), since guessing wrong would send one platform's
  // authorization code to another platform's token endpoint.
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state) return;
    if (handledCodeRef.current === code) return;

    // Fast path: main.tsx already kicked off the exchange at startup using the
    // session persisted in localStorage. Just attach to that promise.
    const pending = getPendingOAuthCallback(code);
    if (pending) {
      handledCodeRef.current = code;
      finishOAuthCallback(pending.promise);
      return;
    }

    // Slow path (no stored session / token expired): wait for AuthProvider.
    if (!user) return;
    handledCodeRef.current = code;
    finishOAuthCallback(completeOAuthCallback({ code, state, userId: user.id }));
  }, [searchParams, user]);

  async function loadAccounts() {
    if (!user) return;
    const { data } = await supabase
      .from('ad_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAccounts((data as AdAccount[]) ?? []);
    setLoading(false);
  }

  async function handleConnect(platform: Platform) {
    if (!user) return;
    setError(null);
    setConnecting(platform);
    try {
      const authUrl = await startOAuthConnect(platform);
      // Redirect to the platform's OAuth page
      window.location.href = authUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start OAuth flow.';
      setError(message);
      setConnecting(null);
    }
  }

  async function finishOAuthCallback(exchange: Promise<OAuthCallbackResult>) {
    setFinalizingOAuth(true);
    setError(null);
    try {
      const result = await exchange;
      setSuccessMsg(`Connected ${result.count} ${PLATFORM_LABELS[result.platform]} account${result.count !== 1 ? 's' : ''}.`);
      await loadAccounts();
      // Clean up URL
      navigate('/app/connections', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth callback failed.';
      setError(message);
    } finally {
      setFinalizingOAuth(false);
    }
  }

  function getAccountLimit(platform: Platform): number {
    const plan = subscription ? PLANS[subscription.plan] : PLANS.starter;
    return plan.maxAccountsPerPlatform;
  }

  function getAccountCount(platform: Platform): number {
    return accounts.filter((a) => a.platform === platform && a.status === 'connected').length;
  }

  async function handleDisconnect(account: AdAccount) {
    const { error } = await supabase
      .from('ad_accounts')
      .delete()
      .eq('id', account.id);

    if (!error) {
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Ad Account Connections</h1>
          <p className="mt-1 text-sm text-gray-500">Connect your Meta, Google, and TikTok ad accounts to start publishing campaigns.</p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 px-5 py-4">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Connection failed</p>
              <p className="mt-0.5 text-xs text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-green-50 px-5 py-4">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {connecting && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-blue-50 px-5 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            <p className="text-sm font-medium text-blue-900">Connecting to {PLATFORM_LABELS[connecting]}...</p>
          </div>
        )}

        {finalizingOAuth && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-blue-50 px-5 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            <p className="text-sm font-medium text-blue-900">Finishing connection...</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          </div>
        ) : (
          <div className="space-y-6">
            {PLATFORMS.map((platform) => {
              const platformAccounts = accounts.filter((a) => a.platform === platform);
              const limit = getAccountLimit(platform);
              const count = getAccountCount(platform);
              const atLimit = limit > 0 && count >= limit;
              const isConnecting = connecting === platform;

              return (
                <div key={platform} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <PlatformBadge platform={platform} />
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">{PLATFORM_LABELS[platform]}</h2>
                        <p className="text-xs text-gray-500">
                          {count} connected
                          {limit > 0 ? ` · ${limit} max` : ' · unlimited'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => !atLimit && !isConnecting && handleConnect(platform)}
                      disabled={atLimit || isConnecting}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        atLimit || isConnecting
                          ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {isConnecting ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Connecting...
                        </>
                      ) : atLimit ? (
                        'Limit reached'
                      ) : (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Connect account
                        </>
                      )}
                    </button>
                  </div>

                  {platformAccounts.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {platformAccounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xs font-mono text-gray-500">
                              {account.account_id.slice(0, 4)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{account.account_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{account.account_id}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              Connected
                            </span>
                            <button
                              onClick={() => handleDisconnect(account)}
                              className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-gray-400">No {PLATFORM_LABELS[platform]} accounts connected yet.</p>
                      <p className="mt-1 text-xs text-gray-400">Click "Connect account" to authorize via {PLATFORM_LABELS[platform]}'s OAuth.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info card */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <div>
              <p className="text-sm font-medium text-gray-700">How connections work</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                Clicking "Connect account" redirects you to the platform's OAuth authorization page. After you approve,
                your ad accounts are automatically discovered and linked. Your access tokens are stored securely and
                never exposed to the browser. If a platform's API credentials aren't configured yet, the connection
                will fail with a clear error message.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
      style={{ backgroundColor: PLATFORM_COLORS[platform] }}
    >
      <PlatformSvg platform={platform} />
    </div>
  );
}

function PlatformSvg({ platform }: { platform: Platform }) {
  const paths: Record<Platform, string> = {
    meta: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898v-2.89h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.875h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z',
    google: 'M12 11v2.8h6.9c-.3 1.8-2.1 5.2-6.9 5.2-4.1 0-7.5-3.4-7-7.5S7.9 3.5 12 3.5c2.4 0 4 .9 5.2 2.1l2.2-2.1C17.5 1.7 15 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c6.9 0 11.5-4.8 11.5-11.6 0-.8-.1-1.3-.2-1.9H12z',
    tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.6-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.78-.1z',
  };
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[platform]} />
    </svg>
  );
}
