-- Agrega campos de precio ajustado y nota al vendedor en cada línea de orden.
-- original_price: precio de inventario al momento de la venta (null si no se modificó)
-- price_note:     motivo del ajuste de precio (opcional, solo si original_price != null)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS price_note     TEXT          NULL;
