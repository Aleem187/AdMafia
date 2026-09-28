import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { callGenerateAds } from '@/lib/api';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import { PLANS } from '@/lib/plans';
import type { AdAccount, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

export default function NewRunPage() {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [productLinks, setProductLinks] = useState<string[]>([]);
  const [productLinkInput, setProductLinkInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = subscription ? PLANS[subscription.plan] : PLANS.starter;
  const generationsUsed = subscription?.generations_used ?? 0;
  const atLimit = plan.maxGenerations > 0 && generationsUsed >= plan.maxGenerations;

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    if (!user) return;
    const { data } = await supabase
      .from('ad_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .order('created_at', { ascending: false });
    setAccounts((data as AdAccount[]) ?? []);
    setLoading(false);
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAssetFiles(files);
  }

  function handleAddProductLink() {
    const link = productLinkInput.trim();
    if (!link) return;
    if (productLinks.includes(link)) {
      setProductLinkInput('');
      return;
    }
    setProductLinks((prev) => [...prev, link]);
    setProductLinkInput('');
  }

  function handleRemoveProductLink(link: string) {
    setProductLinks((prev) => prev.filter((l) => l !== link));
  }

  // Uploads each selected asset to Supabase Storage and returns their public
  // URLs — previously these files were never actually uploaded, only their
  // filenames were sent along, so generate-ads had no real image to work with.
  async function uploadProductImages(files: File[]): Promise<string[]> {
    if (!user || files.length === 0) return [];
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(path);
      urls.push(publicUrlData.publicUrl);
    }
    return urls;
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!prompt.trim()) {
      setError('Please describe your campaign goal.');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Select at least one ad account to target.');
      return;
    }
    if (atLimit) {
      setError(`You've reached your plan limit of ${plan.maxGenerations} generations/month. Upgrade to continue.`);
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      // Upload any product photos so generate-ads has a real image to work
      // with (an edit-based flow needs actual bytes, not just a filename).
      const imageUrls = await uploadProductImages(assetFiles);

      // Create campaign brief
      const { data: brief, error: briefError } = await supabase
        .from('campaign_briefs')
        .insert({
          user_id: user.id,
          prompt_text: prompt,
          asset_urls: imageUrls,
          product_urls: productLinks,
          target_account_ids: selectedAccounts,
        })
        .select()
        .single();

      if (briefError || !brief) {
        throw new Error('Failed to create campaign brief.');
      }

      // Determine target platforms from selected accounts
      const targetPlatforms = [...new Set(
        accounts
          .filter((a) => selectedAccounts.includes(a.id))
          .map((a) => a.platform)
      )];

      // Call the generate-ads edge function
      const { copyVariants, creativeUrls } = await callGenerateAds(
        prompt,
        assetFiles.map((f) => f.name),
        targetPlatforms,
        productLinks,
        imageUrls
      );

      // Create generation record
      const { data: generation, error: genError } = await supabase
        .from('generations')
        .insert({
          brief_id: brief.id,
          user_id: user.id,
          status: 'completed',
          copy_variants: copyVariants,
          creative_urls: creativeUrls,
          approved: false,
        })
        .select()
        .single();

      if (genError || !generation) {
        throw new Error('Failed to save generation results.');
      }

      // Increment usage counter
      await supabase
        .from('subscriptions')
        .update({ generations_used: generationsUsed + 1 })
        .eq('user_id', user.id);

      setGenerating(false);
      navigate(`/app/review/${generation.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed.';
      setError(message);
      setGenerating(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">New Campaign Run</h1>
          <p className="mt-1 text-sm text-gray-500">Describe your campaign goal and let AI generate ad creative for your connected accounts.</p>
        </div>

        {atLimit && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-amber-900">Generation limit reached</p>
              <p className="text-xs text-amber-700">You've used all {plan.maxGenerations} generations on your {plan.name} plan this month.</p>
            </div>
            <button
              onClick={() => navigate('/app/billing')}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Upgrade
            </button>
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Prompt */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <label className="block text-sm font-semibold text-gray-900">Campaign Brief</label>
            <p className="mt-0.5 text-xs text-gray-500">Describe your goal, offer, target audience, and desired tone.</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900 resize-none"
              placeholder="e.g. Launching a new line of eco-friendly water bottles. Target health-conscious millennials in the US. Tone: bold, playful, urgency-driven. Offer: 20% off first order with code ECO20. Emphasize sustainability and style."
            />
            <div className="mt-2 flex justify-end text-xs text-gray-400">{prompt.length} characters</div>
          </div>

          {/* Product links */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <label className="block text-sm font-semibold text-gray-900">Product Links</label>
            <p className="mt-0.5 text-xs text-gray-500">Paste a link to the product page(s) you're advertising (optional).</p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={productLinkInput}
                onChange={(e) => setProductLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProductLink();
                  }
                }}
                placeholder="https://yourstore.com/products/example"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              />
              <button
                type="button"
                onClick={handleAddProductLink}
                className="flex-shrink-0 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Add
              </button>
            </div>
            {productLinks.length > 0 && (
              <ul className="mt-3 space-y-2">
                {productLinks.map((link) => (
                  <li key={link} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="truncate text-xs text-gray-700">{link}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveProductLink(link)}
                      className="flex-shrink-0 text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Asset upload */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <label className="block text-sm font-semibold text-gray-900">Creative Assets</label>
            <p className="mt-0.5 text-xs text-gray-500">Upload product photos, logos, or brand assets (optional).</p>
            <div className="mt-3 rounded-xl border-2 border-dashed border-gray-200 px-6 py-8 text-center transition-colors hover:border-gray-300">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <svg className="mx-auto h-10 w-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-400">PNG, JPG up to 10MB</p>
              </label>
            </div>
            {assetFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {assetFiles.map((file) => (
                  <span key={file.name} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                    {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Target accounts */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <label className="block text-sm font-semibold text-gray-900">Target Ad Accounts</label>
            <p className="mt-0.5 text-xs text-gray-500">Select which connected accounts to publish to.</p>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                Loading accounts...
              </div>
            ) : accounts.length === 0 ? (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center">
                <p className="text-sm text-gray-500">No connected ad accounts yet.</p>
                <button
                  type="button"
                  onClick={() => navigate('/app/connections')}
                  className="mt-2 text-sm font-medium text-gray-900 hover:underline"
                >
                  Connect an account
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {accounts.map((account) => {
                  const isSelected = selectedAccounts.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold"
                        style={{ backgroundColor: PLATFORM_COLORS[account.platform as Platform] }}
                      >
                        {account.platform[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{account.account_name}</p>
                        <p className="text-xs text-gray-400">{PLATFORM_LABELS[account.platform as Platform]} · {account.account_id}</p>
                      </div>
                      <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                        isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {plan.maxGenerations === 0
                ? `${generationsUsed} generations used · Unlimited plan`
                : `${generationsUsed} / ${plan.maxGenerations} generations used this month`}
            </p>
            <button
              type="submit"
              disabled={generating || atLimit}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-7 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
