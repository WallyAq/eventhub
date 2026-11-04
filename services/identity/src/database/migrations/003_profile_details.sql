ALTER TABLE users ADD COLUMN cpf varchar(11), ADD COLUMN phone varchar(15),
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN terms_accepted_at timestamptz;
ALTER TABLE organizations ADD COLUMN cnpj varchar(14) UNIQUE, ADD COLUMN legal_name varchar(120),
  ADD COLUMN entity_type varchar(80), ADD COLUMN phone varchar(15), ADD COLUMN email varchar(254);
