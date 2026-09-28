/*
# AdMafia Initial Schema

Creates all core tables for the AdMafia AI ad creation and management platform.

## New Tables

1. **subscriptions** — Tracks the user's plan (Starter/Growth/Agency), Stripe billing info, and monthly usage counters.
   - `user_id` (uuid, PK + FK to auth.users) — one subscription per user
   - `plan` (text: 'starter' | 'growth' | 'agency')
   - `status` (text: 'active' | 'canceled' | 'past_due')
   - `stripe_customer_id`, `stripe_subscription_id` (text, nullable)
   - `generations_used` (int, default 0) — usage counter
   - `current_period_start`, `current_period_end` (timestamptz)
   - `created_at`, `updated_at`

2. **ad_accounts** — Connected advertising platform accounts (Meta, Google, TikTok).
   - `id` (uuid, PK)
   - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
   - `platform` (text: 'meta' | 'google' | 'tiktok')
   - `account_id` (text) — platform-specific account ID
   - `account_name` (text)
   - `status` (text: 'connected' | 'disconnected')
   - `metadata` (jsonb) — mock connection metadata
   - `connected_at`, `created_at`

3. **campaign_briefs** — The user's prompt + asset uploads for an AI generation run.
   - `id` (uuid, PK)
   - `user_id` (uuid, FK, defaults to auth.uid())
   - `prompt_text` (text)
   - `asset_urls` (jsonb) — uploaded creative asset URLs
   - `target_account_ids` (uuid[]) — which ad accounts to target
   - `created_at`

4. **generations** — AI generation output for a campaign brief.
   - `id` (uuid, PK)
   - `brief_id` (uuid, FK to campaign_briefs)
   - `user_id` (uuid, FK, defaults to auth.uid())
   - `status` (text: 'pending' | 'completed' | 'failed')
   - `copy_variants` (jsonb) — array of {headline, body, cta}
   - `creative_urls` (jsonb) — array of image URLs
   - `approved` (boolean, default false)
   - `created_at`

5. **published_ads** — Ads that have been approved and queued/published to a platform.
   - `id` (uuid, PK)
   - `generation_id` (uuid, FK to generations)
   - `user_id` (uuid, FK, defaults to auth.uid())
   - `ad_account_id` (uuid, FK to ad_accounts)
   - `platform_ad_id` (text, nullable) — platform's ad ID
   - `status` (text: 'queued' | 'publishing' | 'live' | 'paused' | 'error')
   - `daily_budget` (numeric, default 0)
   - `headline`, `body`, `cta` (text) — the approved copy
   - `creative_url` (text) — the approved creative image
   - `published_at`, `created_at`

6. **ad_performance** — Daily performance metrics per published ad.
   - `id` (uuid, PK)
   - `published_ad_id` (uuid, FK to published_ads)
   - `user_id` (uuid, FK, defaults to auth.uid())
   - `date` (date)
   - `spend` (numeric, default 0)
   - `clicks` (int, default 0)
   - `impressions` (int, default 0)
   - `conversions` (int, default 0)
   - `revenue` (numeric, default 0)
   - `created_at`

## Security
- RLS enabled on ALL tables.
- Owner-scoped CRUD policies on every table (user can only see/modify their own rows).
- All `user_id` columns default to `auth.uid()`.
*/

-- Subscriptions (one per user)
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'agency')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  stripe_customer_id text,
  stripe_subscription_id text,
  generations_used int NOT NULL DEFAULT 0,
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz DEFAULT now() + interval '1 month',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;
CREATE POLICY "delete_own_subscriptions" ON subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Ad accounts
CREATE TABLE IF NOT EXISTS ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  account_id text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
  metadata jsonb DEFAULT '{}',
  connected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ad_accounts" ON ad_accounts;
CREATE POLICY "select_own_ad_accounts" ON ad_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_ad_accounts" ON ad_accounts;
CREATE POLICY "insert_own_ad_accounts" ON ad_accounts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_ad_accounts" ON ad_accounts;
CREATE POLICY "update_own_ad_accounts" ON ad_accounts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_ad_accounts" ON ad_accounts;
CREATE POLICY "delete_own_ad_accounts" ON ad_accounts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Campaign briefs
CREATE TABLE IF NOT EXISTS campaign_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_text text NOT NULL,
  asset_urls jsonb DEFAULT '[]',
  target_account_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE campaign_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_briefs" ON campaign_briefs;
CREATE POLICY "select_own_briefs" ON campaign_briefs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_briefs" ON campaign_briefs;
CREATE POLICY "insert_own_briefs" ON campaign_briefs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_briefs" ON campaign_briefs;
CREATE POLICY "update_own_briefs" ON campaign_briefs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_briefs" ON campaign_briefs;
CREATE POLICY "delete_own_briefs" ON campaign_briefs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Generations
CREATE TABLE IF NOT EXISTS generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid REFERENCES campaign_briefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  copy_variants jsonb DEFAULT '[]',
  creative_urls jsonb DEFAULT '[]',
  approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_generations" ON generations;
CREATE POLICY "select_own_generations" ON generations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_generations" ON generations;
CREATE POLICY "insert_own_generations" ON generations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_generations" ON generations;
CREATE POLICY "update_own_generations" ON generations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_generations" ON generations;
CREATE POLICY "delete_own_generations" ON generations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Published ads
CREATE TABLE IF NOT EXISTS published_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES generations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id uuid REFERENCES ad_accounts(id) ON DELETE SET NULL,
  platform_ad_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'publishing', 'live', 'paused', 'error')),
  daily_budget numeric(10,2) DEFAULT 0,
  headline text,
  body text,
  cta text,
  creative_url text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE published_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_published_ads" ON published_ads;
CREATE POLICY "select_own_published_ads" ON published_ads FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_published_ads" ON published_ads;
CREATE POLICY "insert_own_published_ads" ON published_ads FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_published_ads" ON published_ads;
CREATE POLICY "update_own_published_ads" ON published_ads FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_published_ads" ON published_ads;
CREATE POLICY "delete_own_published_ads" ON published_ads FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Ad performance (daily metrics per published ad)
CREATE TABLE IF NOT EXISTS ad_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_ad_id uuid REFERENCES published_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric(10,2) DEFAULT 0,
  clicks int DEFAULT 0,
  impressions int DEFAULT 0,
  conversions int DEFAULT 0,
  revenue numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ad_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_performance" ON ad_performance;
CREATE POLICY "select_own_performance" ON ad_performance FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_performance" ON ad_performance;
CREATE POLICY "insert_own_performance" ON ad_performance FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_performance" ON ad_performance;
CREATE POLICY "update_own_performance" ON ad_performance FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_performance" ON ad_performance;
CREATE POLICY "delete_own_performance" ON ad_performance FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user ON ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_briefs_user ON campaign_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_brief ON generations(brief_id);
CREATE INDEX IF NOT EXISTS idx_published_ads_user ON published_ads(user_id);
CREATE INDEX IF NOT EXISTS idx_published_ads_account ON published_ads(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_ad ON ad_performance(published_ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_user ON ad_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_date ON ad_performance(date);
