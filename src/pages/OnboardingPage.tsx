import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { PLAN_LIST, PLANS } from '@/lib/plans';
import { supabase } from '@/lib/supabase';
import type { Plan } from '@/lib/types';

export default function OnboardingPage() {
  const { user, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('growth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'plan' | 'processing'>('plan');

  async function handleSubscribe() {
    if (!user) return;
    setLoading(true);
    setError(null);
    setStep('processing');

    // Mock Stripe checkout — in production this would redirect to Stripe
    // and a webhook would create the subscription record.
    const { error } = await supabase.from('subscriptions').upsert({
      user_id: user.id,
      plan: selectedPlan,
      status: 'active',
      stripe_customer_id: `cus_mock_${user.id.slice(0, 8)}`,
      stripe_subscription_id: `sub_mock_${user.id.slice(0, 8)}`,
      generations_used: 0,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      setStep('plan');
      return;
    }

    await refreshSubscription();
    navigate('/app');
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Please sign up first.</p>
          <Link to="/signup" className="mt-4 inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white">
            Go to sign up
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          <p className="mt-4 text-sm font-medium text-gray-600">Setting up your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white font-bold text-sm">AM</div>
            <span className="text-lg font-semibold tracking-tight">AdMafia</span>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Choose your plan</h1>
          <p className="mt-2 text-gray-600">You can upgrade or downgrade anytime. 14-day free trial — no charge today.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLAN_LIST.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative rounded-2xl border bg-white p-6 text-left transition-all ${
                selectedPlan === plan.id
                  ? 'border-gray-900 ring-2 ring-gray-900 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                  Popular
                </div>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  selectedPlan === plan.id ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                }`}>
                  {selectedPlan === plan.id && (
                    <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-sm text-gray-500">/mo</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{plan.tagline}</p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                    <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Link to="/app" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Skip for now
          </Link>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="rounded-xl bg-gray-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : `Start ${PLANS[selectedPlan].name} plan`}
          </button>
        </div>
      </div>
    </div>
  );
}
