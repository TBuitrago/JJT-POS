-- Sprint 2: soft delete para productos
-- Permite eliminar plantas sin romper FK de inventory_logs u order_items
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
