-- Add platform column to oauth_verifiers and allow code_verifier to be nullable
ALTER TABLE IF EXISTS oauth_verifiers ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE IF EXISTS oauth_verifiers ALTER COLUMN code_verifier DROP NOT NULL;
