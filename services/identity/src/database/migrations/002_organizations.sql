CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description varchar(2000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar(20) NOT NULL CHECK (role IN ('OWNER', 'ORGANIZER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE UNIQUE INDEX organization_one_owner ON organization_members (organization_id) WHERE role = 'OWNER';
CREATE INDEX organization_members_user ON organization_members (user_id, organization_id);
