-- Isolated beply tables; additive and safe to re-run. Never resets existing data.
CREATE TABLE IF NOT EXISTS beply_accounts (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beply_sessions (
  token_hash text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES beply_accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS beply_session_expiry ON beply_sessions(expires_at);
CREATE TABLE IF NOT EXISTS beply_profiles (
  owner_id text PRIMARY KEY REFERENCES beply_accounts(id),
  active_workspace text NOT NULL
);
CREATE TABLE IF NOT EXISTS beply_workspaces (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES beply_accounts(id),
  kind text NOT NULL,
  name text NOT NULL,
  revision integer NOT NULL,
  state_json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beply_workspace_owner ON beply_workspaces(owner_id);
CREATE TABLE IF NOT EXISTS beply_backups (
  workspace_id text PRIMARY KEY REFERENCES beply_workspaces(id),
  last_success text,
  last_error text
);
CREATE TABLE IF NOT EXISTS beply_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  started_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS beply_uploads (
  pathname text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES beply_accounts(id),
  workspace_id text NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('document','backup')),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS beply_invites (
  token_hash text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);
