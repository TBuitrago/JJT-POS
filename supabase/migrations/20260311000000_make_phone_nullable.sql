-- Make clients.phone nullable.
-- Backend already sends null when phone is empty; this aligns the DB schema
-- so that creating/editing a client without a phone number does not fail.
ALTER TABLE clients
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN phone DROP DEFAULT;
