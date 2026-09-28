import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/mock';
import { callGenerateAds } from '@/lib/api';
import type { Generation, CopyVariant, AdAccount, Platform } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

export default function ReviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCopy, setSelectedCopy] = useState(0);
  const [selectedCreative, setSelectedCreative] = useState(0);
  const [previewPlatform, setPreviewPlatform] = useState<Platform>('meta');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState<CopyVariant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGeneration();
  }, [id]);

  async function loadGeneration() {
    if (!user || !id) return;
    const { data: gen } = await supabase
      .from('generations')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (gen) {
      const g = gen as Generation;
      setGeneration(g);
      // Load target accounts
      const { data: brief } = await supabase
        .from('campaign_briefs')
        .select('target_account_ids')
        .eq('id', g.brief_id)
        .maybeSingle();

      if (brief?.target_account_ids?.length) {
        const { data: accs } = await supabase
          .from('ad_accounts')
          .select('*')
          .in('id', brief.target_account_ids);
        setAccounts((accs as AdAccount[]) ?? []);
      }
    }
    setLoading(false);
  }

  async function handleRegenerate() {
    if (!user || !generation) return;
    setLoading(true);
    try {
      // Load the brief prompt
      const { data: brief } = await supabase
        .from('campaign_briefs')
        .select('prompt_text')
        .eq('id', generation.brief_id)
        .maybeSingle();

      const promptText = brief?.prompt_text ?? '';
      const platforms = [...new Set(accounts.map((a) => a.platform))] as string[];

      const { copyVariants, creativeUrls } = await callGenerateAds(promptText, [], platforms);

      const { data } = await supabase
        .from('generations')
        .update({
          copy_variants: copyVariants,
          creative_urls: creativeUrls,
        })
        .eq('id', generation.id)
        .select()
        .single();

      if (data) {
        setGeneration(data as Generation);
        setSelectedCopy(0);
        setSelectedCreative(0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Regeneration failed.';
      setError(message);
    }
    setLoading(false);
  }

  function handleEdit(idx: number) {
    const variant = generation?.copy_variants[idx];
    if (variant) {
      setEditing(idx);
      setEditText({ ...variant });
    }
  }

  async function saveEdit() {
    if (!generation || editing === null || !editText) return;
    const newVariants = [...generation.copy_variants];
    newVariants[editing] = editText;

    const { data } = await supabase
      .from('generations')
      .update({ copy_variants: newVariants })
      .eq('id', generation.id)
      .select()
      .single();

    if (data) {
      setGeneration(data as Generation);
    }
    setEditing(null);
    setEditText(null);
  }

  async function handleApproveAndPublish() {
    if (!user || !generation) return;
    const copy = generation.copy_variants[selectedCopy];
    const creative = generation.creative_urls[selectedCreative];

    // Mark as approved
    await supabase
      .from('generations')
      .update({ approved: true })
      .eq('id', generation.id);

    // Navigate to publish confirmation with state
    navigate('/app/publish', {
      state: {
        generationId: generation.id,
        copy,
        creative,
        accountIds: accounts.map((a) => a.id),
      },
    });
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
        </div>
      </AppLayout>
    );
  }

  if (!generation) {
    return (
      <AppLayout>
        <div className="px-8 py-10 text-center text-gray-500">Generation not found.</div>
      </AppLayout>
    );
  }

  const copy = generation.copy_variants[selectedCopy] ?? generation.copy_variants[0];
  const creative = generation.creative_urls[selectedCreative] ?? generation.creative_urls[0];
  const availablePlatforms = [...new Set(accounts.map((a) => a.platform))] as Platform[];

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button onClick={() => navigate('/app')} className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              Back to dashboard
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Review Generated Ads</h1>
            <p className="mt-1 text-sm text-gray-500">Review AI-generated copy and creative. Select your favorites and publish.</p>
          </div>
          <button
            onClick={handleRegenerate}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            Regenerate all
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Copy variants */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Ad Copy Variants</h2>
            {generation.copy_variants.map((variant, idx) => (
              <div
                key={idx}
                className={`rounded-2xl border bg-white p-5 transition-all ${
                  selectedCopy === idx ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {editing === idx && editText ? (
                  <div className="space-y-3">
                    <input
                      value={editText.headline}
                      onChange={(e) => setEditText({ ...editText, headline: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-gray-900"
                    />
                    <textarea
                      value={editText.body}
                      onChange={(e) => setEditText({ ...editText, body: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900 resize-none"
                    />
                    <input
                      value={editText.cta}
                      onChange={(e) => setEditText({ ...editText, cta: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-gray-900"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">Save</button>
                      <button onClick={() => { setEditing(null); setEditText(null); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <button onClick={() => setSelectedCopy(idx)} className="flex-1 text-left">
                        <h3 className="text-base font-semibold text-gray-900">{variant.headline}</h3>
                        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{variant.body}</p>
                        <span className="mt-2 inline-block rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{variant.cta}</span>
                      </button>
                      <div className="ml-3 flex flex-col gap-1">
                        <button onClick={() => handleEdit(idx)} className="text-gray-400 hover:text-gray-900 transition-colors" title="Edit">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        {selectedCopy === idx && (
                          <span className="text-green-500">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Creative variants + preview */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Creative Image Variants</h2>
            <div className="grid grid-cols-2 gap-3">
              {generation.creative_urls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCreative(idx)}
                  className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                    selectedCreative === idx ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img src={url} alt={`Creative ${idx + 1}`} className="aspect-square w-full object-cover" />
                  {selectedCreative === idx && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Platform preview */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Platform Preview</h3>
                <div className="flex gap-1">
                  {availablePlatforms.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPreviewPlatform(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        previewPlatform === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {PLATFORM_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <PlatformPreview platform={previewPlatform} copy={copy} creative={creative} />
            </div>
          </div>
        </div>

        {/* Approve bar */}
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-4">
          <div className="text-sm text-gray-500">
            Selected: <span className="font-medium text-gray-900">Copy variant {selectedCopy + 1}</span> + <span className="font-medium text-gray-900">Creative {selectedCreative + 1}</span>
          </div>
          <button
            onClick={handleApproveAndPublish}
            className="rounded-xl bg-gray-900 px-7 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            Approve & Continue to Publish
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

function PlatformPreview({ platform, copy, creative }: { platform: Platform; copy: CopyVariant; creative: string }) {
  if (platform === 'meta') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div>
            <p className="text-xs font-semibold text-gray-900">Your Brand</p>
            <p className="text-[10px] text-gray-400">Sponsored</p>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg">
          <img src={creative} alt="Preview" className="aspect-video w-full object-cover" />
        </div>
        <div className="mt-3">
          <p className="text-sm font-bold text-gray-900">{copy.headline}</p>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">{copy.body}</p>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-500">your-store.com</span>
          <span className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">{copy.cta}</span>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
        </div>
      </div>
    );
  }

  if (platform === 'google') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
          <span>Ad</span><span>·</span><span className="text-blue-600">your-store.com</span>
        </div>
        <p className="text-base font-medium text-blue-700 hover:underline cursor-pointer">{copy.headline}</p>
        <p className="text-sm text-green-700">your-store.com/offer</p>
        <p className="mt-1 text-sm text-gray-600 leading-relaxed">{copy.body}</p>
        <div className="mt-3 inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-blue-700">
          {copy.cta}
        </div>
      </div>
    );
  }

  // TikTok
  return (
    <div className="mx-auto max-w-xs rounded-xl border border-gray-200 bg-black p-3">
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg">
        <img src={creative} alt="TikTok preview" className="h-full w-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-sm font-bold text-white">{copy.headline}</p>
          <p className="mt-1 text-xs text-white/80 leading-relaxed">{copy.body}</p>
          <span className="mt-2 inline-block rounded-md bg-white px-3 py-1.5 text-xs font-bold text-black">{copy.cta}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-white">
        <span className="text-xs font-semibold">@yourbrand</span>
        <div className="flex gap-3 text-xs">
          <span>♥</span><span>💬</span><span>↗</span>
        </div>
      </div>
    </div>
  );
}
