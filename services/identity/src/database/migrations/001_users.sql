CREATE TABLE users (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'PARTICIPANT' CHECK (role IN ('PARTICIPANT')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

