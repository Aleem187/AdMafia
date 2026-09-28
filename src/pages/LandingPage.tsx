import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLANS, PLAN_LIST } from '@/lib/plans';
import { useAuth } from '@/lib/auth';

export default function LandingPage() {
  const { user } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white font-bold text-sm">
              AM
            </div>
            <span className="text-lg font-semibold tracking-tight">AdMafia</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
            <a href="#how" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">How it works</a>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/app" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/signin" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Sign in</Link>
                <Link to="/signup" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-50 via-gray-50 to-red-50 blur-3xl" />
        </div>
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-green-500" />
            AI-powered ad creation, now with cross-platform publishing
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl md:text-7xl">
            Run ads like
            <span className="block bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">the mafia runs a city.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 leading-relaxed">
            Connect your Meta, Google, and TikTok ad accounts. Describe your campaign in plain English.
            Our AI generates high-converting ad creative, copy, and targeting — then publishes it across every platform.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link to="/signup" className="rounded-xl bg-gray-900 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-gray-900/20 hover:bg-gray-800 transition-all hover:shadow-xl hover:shadow-gray-900/30">
              Start free trial
            </Link>
            <a href="#how" className="rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-400">No credit card required · 14-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* Logos / social proof */}
      <section className="border-y border-gray-100 bg-gray-50/50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Trusted by performance marketers at</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {['NORTHWIND', 'ShopSphere', 'GrowthLab', 'Meridian', 'Caseload', 'Brightside'].map((name) => (
              <span key={name} className="text-lg font-bold text-gray-300 tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Everything you need to dominate ad spend</h2>
            <p className="mt-4 text-lg text-gray-600">From brief to published ad in minutes. Not days.</p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              { icon: 'Sparkles', title: 'AI Creative Generation', desc: 'Describe your campaign goal. Get headline copy, body text, CTAs, and creative image variants in seconds.' },
              { icon: 'Share2', title: 'Cross-Platform Publishing', desc: 'Push approved ads directly to Meta, Google, and TikTok from a single dashboard. No tab-switching.' },
              { icon: 'BarChart3', title: 'Unified Analytics', desc: 'Track spend, clicks, conversions, and revenue across every platform. Know your ROAS at a glance.' },
              { icon: 'Link', title: 'Account Connections', desc: 'Connect multiple ad accounts per platform. Manage everything from one command center.' },
              { icon: 'Shield', title: 'Secure by Design', desc: 'Row-level security on every table. Your data, your accounts, your creative — never anyone else\'s.' },
              { icon: 'Zap', title: 'Plan-Based Limits', desc: 'Start with 15 generations/month. Scale to unlimited with Agency. Upgrade or downgrade anytime.' },
            ].map((f) => (
              <div key={f.title} className="group rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:border-gray-200">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
                  <FeatureIcon name={f.icon} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-gray-50/50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">From prompt to published in 4 steps</h2>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-4">
            {[
              { step: '01', title: 'Connect accounts', desc: 'Link your Meta, Google, and TikTok ad accounts with one-click OAuth.' },
              { step: '02', title: 'Write a brief', desc: 'Describe your goal, audience, and tone. Upload product photos and brand assets.' },
              { step: '03', title: 'Review & approve', desc: 'AI generates copy and creative variants. Approve, edit, or regenerate each one.' },
              { step: '04', title: 'Publish & track', desc: 'Push to your selected platforms. Watch spend, clicks, and revenue roll in.' },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="mb-4 text-4xl font-bold text-gray-200">{s.step}</div>
                <h3 className="text-lg font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Simple, transparent pricing</h2>
            <p className="mt-4 text-lg text-gray-600">Pick a plan that matches your ambition. Cancel or upgrade anytime.</p>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billingCycle === 'yearly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Yearly <span className="text-green-600">(-20%)</span>
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLAN_LIST.map((plan) => {
              const price = billingCycle === 'yearly' ? Math.round(plan.price * 12 * 0.8) : plan.price;
              const suffix = billingCycle === 'yearly' ? '/yr' : '/mo';
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border bg-white p-8 transition-all ${
                    plan.highlight
                      ? 'border-gray-900 shadow-2xl shadow-gray-900/10 md:scale-105'
                      : 'border-gray-200 shadow-sm hover:shadow-lg'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                      Most popular
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">${price}</span>
                    <span className="text-sm text-gray-500">{suffix}</span>
                  </div>
                  <Link
                    to="/signup"
                    className={`mt-6 block rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
                      plan.highlight
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'border border-gray-200 text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Start with {plan.name}
                  </Link>
                  <ul className="mt-8 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Ready to take over the ad game?</h2>
          <p className="mt-4 text-lg text-gray-400">Join the marketers who've already switched to AI-powered ad creation.</p>
          <Link to="/signup" className="mt-8 inline-block rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-gray-900 hover:bg-gray-100 transition-colors">
            Start your free trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white text-xs font-bold">AM</div>
            <span className="font-semibold">AdMafia</span>
          </div>
          <p className="text-sm text-gray-400">© 2026 AdMafia. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    Sparkles: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
    Share2: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',
    BarChart3: 'M3 3v18h18M7 16V8M12 16v-5M17 16v-2',
    Link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
    Shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    Zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  };
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}
