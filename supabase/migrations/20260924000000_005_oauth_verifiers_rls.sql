-- oauth_verifiers now holds a row for every platform's in-flight OAuth
-- connection (state, and for TikTok its PKCE code_verifier), not just
-- TikTok's. It currently has no RLS at all, so any authenticated (or anon)
-- client could list every user's pending OAuth states. Only the edge
-- functions (service role) ever need to read or write this table, so lock
-- it down the same way platform_tokens already is.
ALTER TABLE oauth_verifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_oauth_verifiers" ON oauth_verifiers;
CREATE POLICY "deny_select_oauth_verifiers" ON oauth_verifiers FOR SELECT
  TO authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_oauth_verifiers" ON oauth_verifiers;
CREATE POLICY "deny_insert_oauth_verifiers" ON oauth_verifiers FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_oauth_verifiers" ON oauth_verifiers;
CREATE POLICY "deny_update_oauth_verifiers" ON oauth_verifiers FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_oauth_verifiers" ON oauth_verifiers;
CREATE POLICY "deny_delete_oauth_verifiers" ON oauth_verifiers FOR DELETE
  TO authenticated USING (false);
