-- ============================================================
-- Programa de Recompensas por Cliente Frecuente
-- Extiende discount_codes para soportar códigos personalizados,
-- con límite de usos, expiración y asignación a cliente.
-- ============================================================

-- Nuevas columnas en discount_codes
ALTER TABLE discount_codes
  ADD COLUMN IF NOT EXISTS max_uses            INTEGER          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uses_count          INTEGER NOT NULL  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_client_id  UUID             REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reward_tier         NUMERIC(12,2)    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS redeemed_in_order_id UUID            REFERENCES orders(id) ON DELETE SET NULL;

-- Índice para buscar códigos asignados a un cliente
CREATE INDEX IF NOT EXISTS idx_discount_codes_assigned_client
  ON discount_codes(assigned_client_id)
  WHERE assigned_client_id IS NOT NULL;

-- Índice único: un solo código de recompensa por cliente y umbral (idempotencia)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_unique_per_client_tier
  ON discount_codes(assigned_client_id, reward_tier)
  WHERE reward_tier IS NOT NULL;
