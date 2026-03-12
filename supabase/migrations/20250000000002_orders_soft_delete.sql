-- Soft delete para órdenes
-- Permite eliminar cualquier orden (draft o completada) preservando el registro
-- Las órdenes eliminadas se ocultan de las vistas principales y se pueden
-- consultar en la tab "Eliminadas" del módulo de Órdenes

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Índice para filtrar órdenes activas eficientemente
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at)
  WHERE deleted_at IS NULL;
