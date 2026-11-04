ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
CREATE TABLE email_changes (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  new_email varchar(254) NOT NULL CHECK(new_email=lower(new_email)),
  credentials_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_changes_expiry ON email_changes(expires_at);
