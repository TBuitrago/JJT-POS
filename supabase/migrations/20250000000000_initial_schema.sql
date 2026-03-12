-- ============================================================
-- Culto Orquídeas POS — Esquema inicial de base de datos
-- ============================================================

-- Secuencia para números de orden CO-XXXX
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ============================================================
-- TABLA: products
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(4) UNIQUE NOT NULL CHECK (sku ~ '^\d{4}$'),
  name        VARCHAR(255) NOT NULL,
  price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  phone       VARCHAR(20) NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: discount_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS discount_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  percentage  NUMERIC(5, 2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: orders
-- ============================================================
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('draft', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         VARCHAR(10) UNIQUE NOT NULL DEFAULT (
                         'CO-' || LPAD(nextval('order_number_seq')::text, 4, '0')
                       ),
  status               order_status NOT NULL DEFAULT 'draft',
  client_id            UUID REFERENCES clients(id) ON DELETE SET NULL,
  guest_name           VARCHAR(255),
  payment_method       payment_method NOT NULL DEFAULT 'cash',
  discount_code_id     UUID REFERENCES discount_codes(id) ON DELETE SET NULL,
  discount_percentage  NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0),
  subtotal_gross       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_gross >= 0),
  subtotal_net         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_net >= 0),
  shipping_cost        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  total                NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  CONSTRAINT valid_guest_or_client CHECK (
    client_id IS NOT NULL OR guest_name IS NOT NULL
  )
);

-- ============================================================
-- TABLA: order_items
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name  VARCHAR(255) NOT NULL,   -- snapshot
  product_sku   VARCHAR(4) NOT NULL,      -- snapshot
  unit_price    NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),  -- snapshot
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  line_total    NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

-- ============================================================
-- TABLA: inventory_logs
-- ============================================================
DO $$ BEGIN
  CREATE TYPE inventory_action AS ENUM ('add', 'remove', 'sale', 'create', 'delete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name     VARCHAR(255) NOT NULL,   -- snapshot
  action           inventory_action NOT NULL,
  quantity_change  INTEGER NOT NULL,         -- positivo = ingreso, negativo = salida
  quantity_before  INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after   INTEGER NOT NULL CHECK (quantity_after >= 0),
  performed_by     VARCHAR(100) NOT NULL DEFAULT 'Admin',
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES para consultas frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at DESC);

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente en products
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- Política: solo service_role tiene acceso total (el backend usa service_role_key)
-- El frontend usa anon_key + JWT de usuario autenticado

-- products: lectura para usuarios autenticados, escritura solo via backend (service_role)
CREATE POLICY "Authenticated users can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to products"
  ON products FOR ALL
  TO service_role
  USING (true);

-- clients
CREATE POLICY "Authenticated users can read clients"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to clients"
  ON clients FOR ALL
  TO service_role
  USING (true);

-- discount_codes
CREATE POLICY "Authenticated users can read discount_codes"
  ON discount_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to discount_codes"
  ON discount_codes FOR ALL
  TO service_role
  USING (true);

-- orders
CREATE POLICY "Authenticated users can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to orders"
  ON orders FOR ALL
  TO service_role
  USING (true);

-- order_items
CREATE POLICY "Authenticated users can read order_items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to order_items"
  ON order_items FOR ALL
  TO service_role
  USING (true);

-- inventory_logs
CREATE POLICY "Authenticated users can read inventory_logs"
  ON inventory_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to inventory_logs"
  ON inventory_logs FOR ALL
  TO service_role
  USING (true);
