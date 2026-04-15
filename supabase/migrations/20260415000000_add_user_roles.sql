-- ============================================================
-- Migración: Sistema de roles (admin / vendedor)
-- ============================================================

-- 1. Enum para roles de usuario
CREATE TYPE user_role AS ENUM ('admin', 'vendedor');

-- 2. Tabla de perfiles de usuario (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to user_profiles"
  ON user_profiles FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 3. Columna created_by en orders y clients (nullable para registros existentes)
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by  ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
