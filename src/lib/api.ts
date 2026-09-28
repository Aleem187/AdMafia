import { supabase } from './supabase';
import type { CopyVariant, Platform } from './types';

interface GenerateResult {
  copyVariants: CopyVariant[];
  creativeUrls: string[];
}

export async function callGenerateAds(
  prompt: string,
  assetNames: string[],
  platforms: string[],
  productUrls: string[] = [],
  imageUrls: string[] = []
): Promise<GenerateResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ads`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ prompt, assetNames, platforms, productUrls, imageUrls }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Generation failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.copyVariants || !data.creativeUrls) {
    throw new Error('Invalid response from generation service');
  }
  return { copyVariants: data.copyVariants, creativeUrls: data.creativeUrls };
}

interface PublishResult {
  publishedAdIds: string[];
  count: number;
  errors?: string[];
}

export async function callPublishAds(params: {
  generationId: string;
  userId: string;
  copy: CopyVariant;
  creative: string;
  accountIds: string[];
  dailyBudget: number;
}): Promise<PublishResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-ads`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Publish failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return { publishedAdIds: data.publishedAdIds ?? [], count: data.count ?? 0, errors: data.errors };
}

export function getOAuthRedirectUri(): string {
  const origin = window.location.origin;
  return `${origin}/app/connections`;
}

export async function startOAuthConnect(platform: Platform): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const redirectUri = getOAuthRedirectUri();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-connect`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ platform, redirectUri }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OAuth setup failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.authUrl) throw new Error('No authorization URL returned');
  // return both authUrl and state so the frontend can persist state and pass it back on callback
  return data.authUrl as string;
}

export interface OAuthCallbackResult {
  platform: Platform;
  accounts: Array<{ id: string; account_id: string; account_name: string }>;
  count: number;
}

export async function completeOAuthCallback(params: {
  // Optional: when omitted, the server resolves the platform itself from
  // `state` (every platform's oauth-connect call now records state -> platform
  // in oauth_verifiers). This lets a caller kick off the exchange before it
  // knows which platform a redirect belongs to.
  platform?: Platform;
  code: string;
  state?: string;
  userId: string;
}, accessToken?: string): Promise<OAuthCallbackResult> {
  let token = accessToken;
  if (!token) {
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData.session?.access_token;
  }
  if (!token) throw new Error('Not authenticated');

  const redirectUri = getOAuthRedirectUri();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      platform: params.platform,
      code: params.code,
      state: params.state,
      redirectUri,
      userId: params.userId,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OAuth callback failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.platform) throw new Error('Server did not report which platform this connection was for.');
  return { platform: data.platform as Platform, accounts: data.accounts ?? [], count: data.count ?? 0 };
}

export async function syncPerformance(userId: string): Promise<{ synced: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-performance`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Sync failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return { synced: data.synced ?? 0 };
}

// Permanently deletes the caller's own account: platform connections,
// campaign briefs, generations, published ads, performance history,
// products, uploaded/generated storage files, and the auth user itself.
// See supabase/functions/delete-account.
export async function deleteAccount(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Account deletion failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
}
