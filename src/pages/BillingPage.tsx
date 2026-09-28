import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { deleteAccount } from '@/lib/api';
import { PLANS, PLAN_LIST } from '@/lib/plans';
import type { Plan } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

export default function BillingPage() {
  const { user, subscription, signOut, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [changingPlan, setChangingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      setDeleteError(message);
      setDeleting(false);
    }
  }

  const currentPlan = subscription ? PLANS[subscription.plan] : PLANS.starter;
  const usagePct = currentPlan.maxGenerations > 0
    ? Math.min(100, Math.round((subscription?.generations_used ?? 0) / currentPlan.maxGenerations * 100))
    : 0;

  async function handleUpgrade(newPlan: Plan) {
    if (!user) return;
    setChangingPlan(newPlan);
    setError(null);

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan: newPlan,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', user.id);

    setChangingPlan(null);

    if (error) {
      setError(error.message);
      return;
    }

    await refreshSubscription();
  }

  if (!subscription) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-8 py-10">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
            <h2 className="text-lg font-semibold text-amber-900">No active subscription</h2>
            <p className="mt-1 text-sm text-amber-700">Choose a plan to start using AdMafia.</p>
            <button
              onClick={() => navigate('/onboarding')}
              className="mt-4 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Choose a plan
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Billing & Account Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your subscription, view usage, and update your plan.</p>
        </div>

        {/* Current plan + usage */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Plan</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">{currentPlan.name}</h2>
              <p className="text-sm text-gray-500">${currentPlan.price}/month</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {subscription.status}
              </span>
              <p className="mt-2 text-xs text-gray-400">
                Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Usage meter */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">AI Generations This Month</span>
              <span className="text-gray-500">
                {subscription.generations_used} / {currentPlan.maxGenerations === 0 ? '∞' : currentPlan.maxGenerations}
              </span>
            </div>
            {currentPlan.maxGenerations > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-gray-900'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            )}
          </div>

          {/* Account info */}
          <div className="mt-6 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Account email</span>
              <span className="font-medium text-gray-900">{user?.email}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">Customer ID</span>
              <span className="font-mono text-xs text-gray-400">{subscription.stripe_customer_id ?? 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Plan options */}
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Change Plan</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_LIST.map((plan) => {
            const isCurrent = plan.id === subscription.plan;
            const isDowngrade = PLANS[subscription.plan].price > plan.price;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border bg-white p-6 ${
                  isCurrent ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'
                }`}
              >
                {plan.highlight && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                    Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-sm text-gray-500">/mo</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !isCurrent && handleUpgrade(plan.id)}
                  disabled={isCurrent || changingPlan !== null}
                  className={`mt-5 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    isCurrent
                      ? 'cursor-default bg-gray-100 text-gray-500'
                      : isDowngrade
                        ? 'border border-gray-200 text-gray-900 hover:bg-gray-50'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {isCurrent ? 'Current plan' : changingPlan === plan.id ? 'Updating...' : isDowngrade ? 'Downgrade' : 'Upgrade'}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Invoice history (mock) */}
        <h2 className="mb-4 mt-8 text-lg font-semibold text-gray-900">Invoice History</h2>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="hover:bg-gray-50/50">
                <td className="px-6 py-3 text-sm text-gray-600">{new Date(subscription.current_period_start).toLocaleDateString()}</td>
                <td className="px-6 py-3 text-sm text-gray-900">{currentPlan.name} plan — monthly</td>
                <td className="px-6 py-3 text-right text-sm text-gray-900">${currentPlan.price}.00</td>
                <td className="px-6 py-3 text-right"><span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Paid</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Danger zone */}
        <h2 className="mb-4 mt-8 text-lg font-semibold text-gray-900">Danger Zone</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete my account and data</p>
                <p className="mt-1 text-xs text-gray-500">
                  Permanently deletes your account, ad platform connections, campaign briefs, generated creative,
                  published-ad history, products, and uploaded/generated files. This cannot be undone. See our{' '}
                  <a href="/data-deletion" target="_blank" rel="noreferrer" className="underline hover:text-gray-900">
                    Data Deletion
                  </a>{' '}
                  page for exactly what's removed.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Delete account
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-red-900">This is permanent and cannot be undone.</p>
              <p className="mt-1 text-xs text-red-700">
                Type <span className="font-mono font-semibold">DELETE</span> below to confirm you want to permanently
                delete your account and all associated data.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="mt-3 w-full max-w-xs rounded-lg border border-red-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
              {deleteError && (
                <p className="mt-2 text-xs text-red-700">{deleteError}</p>
              )}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    deleteConfirmText !== 'DELETE' || deleting
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {deleting ? 'Deleting...' : 'Permanently delete my account'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
