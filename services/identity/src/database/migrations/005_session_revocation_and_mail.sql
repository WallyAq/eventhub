ALTER TABLE users ADD COLUMN credentials_version integer NOT NULL DEFAULT 0 CHECK(credentials_version >= 0);
CREATE TABLE revoked_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX revoked_sessions_expiry ON revoked_sessions(expires_at);
CREATE TABLE mail_outbox (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_outbox_pending ON mail_outbox(next_attempt_at) WHERE status='PENDING';
