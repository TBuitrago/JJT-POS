-- ============================================================
-- Seed de desarrollo — 10 plantas de prueba (SKU 0001–0010)
-- Solo usar en entorno de desarrollo/staging
-- ============================================================

INSERT INTO products (sku, name, price, stock) VALUES
  ('0001', 'Phalaenopsis Amabilis',     45000,  12),
  ('0002', 'Cattleya Trianae',          85000,   8),
  ('0003', 'Dendrobium Nobile',         35000,  20),
  ('0004', 'Oncidium Sphacelatum',      30000,  15),
  ('0005', 'Cymbidium Devonianum',      65000,   6),
  ('0006', 'Paphiopedilum Petula',      95000,   4),
  ('0007', 'Vanda Coerulea',           120000,   3),
  ('0008', 'Miltoniopsis Roezlii',      55000,  10),
  ('0009', 'Brassia Arcuigera',         40000,  18),
  ('0010', 'Epidendrum Radicans',       25000,  25)
ON CONFLICT (sku) DO NOTHING;

-- Código de descuento de prueba
INSERT INTO discount_codes (code, percentage, is_active) VALUES
  ('BIENVENIDO10',  10.00, true),
  ('ORQUIDEA20',    20.00, true),
  ('VIP30',         30.00, false)
ON CONFLICT (code) DO NOTHING;

-- Cliente de prueba
INSERT INTO clients (name, email, phone) VALUES
  ('María García', 'maria@ejemplo.com', '3001234567'),
  ('Carlos López', 'carlos@ejemplo.com', '3109876543')
ON CONFLICT (email) DO NOTHING;
