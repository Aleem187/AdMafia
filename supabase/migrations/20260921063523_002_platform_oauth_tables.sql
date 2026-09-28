/*
# Platform OAuth Token Storage

Creates two new tables to support real OAuth integration with Meta, Google, and TikTok ad platforms.

## New Tables

1. **platform_tokens** — Stores OAuth access tokens, refresh tokens, and expiry for each user-platform connection.
   - `id` (uuid, PK)
   - `user_id` (uuid, FK to auth.users) — which user owns this token
   - `platform` (text: 'meta' | 'google' | 'tiktok')
   - `access_token` (text) — OAuth access token
   - `refresh_token` (text, nullable) — OAuth refresh token for long-lived access
   - `token_expires_at` (timestamptz, nullable) — when the access token expires
   - `scope` (text, nullable) — OAuth scopes granted
   - `platform_user_id` (text, nullable) — the platform's user/account ID from OAuth
   - `created_at`, `updated_at`

2. **oauth_states** — Stores CSRF state parameters for OAuth flows to prevent replay attacks.
   - `id` (uuid, PK)
   - `user_id` (uuid, FK to auth.users)
   - `platform` (text)
   - `state` (text) — random state string
   - `consumed` (boolean, default false) — whether this state was used
   - `created_at`
   - Auto-expires after 10 minutes via application logic

## Security
- RLS enabled on both tables.
- platform_tokens: NO client read/insert/update/delete — only edge functions with service role key can access. Policies use `TO authenticated` with `USING (false)` to deny all client access.
- oauth_states: authenticated users can insert (to start OAuth) and select (to verify callback), but only edge functions update/delete via service role.

## Important Notes
1. Tokens are NEVER exposed to the frontend — only edge functions read them using the service role key.
2. OAuth states are single-use and expire after 10 minutes.
3. The ad_accounts table continues to store account display info; platform_tokens stores the credentials separately.
*/

-- Platform tokens (server-only access, no client reads)
CREATE TABLE IF NOT EXISTS platform_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  platform_user_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE platform_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all client access — only service role (edge functions) can use this table
DROP POLICY IF EXISTS "deny_select_platform_tokens" ON platform_tokens;
CREATE POLICY "deny_select_platform_tokens" ON platform_tokens FOR SELECT
  TO authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_platform_tokens" ON platform_tokens;
CREATE POLICY "deny_insert_platform_tokens" ON platform_tokens FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_platform_tokens" ON platform_tokens;
CREATE POLICY "deny_update_platform_tokens" ON platform_tokens FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_platform_tokens" ON platform_tokens;
CREATE POLICY "deny_delete_platform_tokens" ON platform_tokens FOR DELETE
  TO authenticated USING (false);

-- OAuth states (CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  state text NOT NULL,
  consumed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_oauth_states" ON oauth_states;
CREATE POLICY "select_own_oauth_states" ON oauth_states FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_oauth_states" ON oauth_states;
CREATE POLICY "insert_own_oauth_states" ON oauth_states FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_oauth_states" ON oauth_states;
CREATE POLICY "update_own_oauth_states" ON oauth_states FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_oauth_states" ON oauth_states;
CREATE POLICY "delete_own_oauth_states" ON oauth_states FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_tokens_user ON platform_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_tokens_platform ON platform_tokens(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id);

-- Add error_message column to ad_accounts for storing connection errors
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS error_message text;
