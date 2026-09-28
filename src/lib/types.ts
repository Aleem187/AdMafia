export type Plan = 'starter' | 'growth' | 'agency';

export type Platform = 'meta' | 'google' | 'tiktok';

export interface Subscription {
  user_id: string;
  plan: Plan;
  status: 'active' | 'canceled' | 'past_due';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  generations_used: number;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}

export interface AdAccount {
  id: string;
  user_id: string;
  platform: Platform;
  account_id: string;
  account_name: string;
  status: 'connected' | 'disconnected';
  metadata: Record<string, unknown>;
  connected_at: string;
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description: string;
  image_url: string | null;
  created_at: string;
}

export interface CampaignBrief {
  id: string;
  user_id: string;
  prompt_text: string;
  asset_urls: string[];
  product_urls: string[];
  target_account_ids: string[];
  created_at: string;
}

export interface CopyVariant {
  headline: string;
  body: string;
  cta: string;
}

export interface Generation {
  id: string;
  brief_id: string;
  user_id: string;
  status: 'pending' | 'completed' | 'failed';
  copy_variants: CopyVariant[];
  creative_urls: string[];
  approved: boolean;
  created_at: string;
}

export interface PublishedAd {
  id: string;
  generation_id: string;
  user_id: string;
  ad_account_id: string | null;
  platform_ad_id: string | null;
  status: 'queued' | 'publishing' | 'live' | 'paused' | 'error';
  daily_budget: number;
  headline: string | null;
  body: string | null;
  cta: string | null;
  creative_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface AdPerformance {
  id: string;
  published_ad_id: string;
  user_id: string;
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
}
