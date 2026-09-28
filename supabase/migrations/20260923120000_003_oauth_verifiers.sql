-- Add table to store temporary PKCE verifiers for OAuth flows
CREATE TABLE IF NOT EXISTS oauth_verifiers (
  state text PRIMARY KEY,
  code_verifier text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_verifiers_state ON oauth_verifiers(state);
